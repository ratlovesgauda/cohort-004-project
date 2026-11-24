import { eq, and, gt, asc, sql, isNull } from "drizzle-orm";
import { db } from "~/db";
import {
  lessonComments,
  lessons,
  modules,
  courses,
  users,
  UserRole,
} from "~/db/schema";
import { COMMENT_MAX_LENGTH, INITIAL_REPLIES_COUNT } from "~/lib/comments";
import { isUserEnrolled } from "~/services/enrollmentService";

// ─── Comment Service ───
// Threaded comments on lessons (one level of replies). Permission checks live
// here; callers map CommentError codes to HTTP responses.
// Uses positional parameters (project convention).

export class CommentError extends Error {
  constructor(
    public code: "forbidden" | "invalid" | "not_found",
    message: string
  ) {
    super(message);
  }
}

export type CommentView = {
  id: number;
  lessonId: number;
  userId: number;
  parentId: number | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
  authorName: string;
  authorAvatarUrl: string | null;
  isInstructor: boolean;
};

export type CommentThread = CommentView & {
  replyCount: number;
  replies: CommentView[];
};

function getLessonContext(lessonId: number) {
  return db
    .select({ courseId: courses.id, instructorId: courses.instructorId })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .get();
}

function getUserRole(userId: number) {
  return db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .get()?.role;
}

/** Enrolled students, the course instructor, and admins. */
export function canAccessComments(userId: number, lessonId: number) {
  const ctx = getLessonContext(lessonId);
  if (!ctx) return false;
  if (ctx.instructorId === userId) return true;
  if (getUserRole(userId) === UserRole.Admin) return true;
  return isUserEnrolled(userId, ctx.courseId);
}

function validateBody(body: string) {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new CommentError("invalid", "Comment cannot be empty");
  }
  if (trimmed.length > COMMENT_MAX_LENGTH) {
    throw new CommentError(
      "invalid",
      `Comment must be at most ${COMMENT_MAX_LENGTH} characters`
    );
  }
  return trimmed;
}

const commentSelect = {
  id: lessonComments.id,
  lessonId: lessonComments.lessonId,
  userId: lessonComments.userId,
  parentId: lessonComments.parentId,
  body: lessonComments.body,
  createdAt: lessonComments.createdAt,
  updatedAt: lessonComments.updatedAt,
  authorName: users.name,
  authorAvatarUrl: users.avatarUrl,
  authorRole: users.role,
};

function toView(
  row: {
    id: number;
    lessonId: number;
    userId: number;
    parentId: number | null;
    body: string;
    createdAt: string;
    updatedAt: string;
    authorName: string;
    authorAvatarUrl: string | null;
  },
  instructorId: number
): CommentView {
  return {
    id: row.id,
    lessonId: row.lessonId,
    userId: row.userId,
    parentId: row.parentId,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    edited: row.updatedAt !== row.createdAt,
    authorName: row.authorName,
    authorAvatarUrl: row.authorAvatarUrl,
    isInstructor: row.userId === instructorId,
  };
}

function fetchReplies(
  commentId: number,
  cursor: number | null,
  limit: number,
  instructorId: number
) {
  const rows = db
    .select(commentSelect)
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(
      and(
        eq(lessonComments.parentId, commentId),
        cursor != null ? gt(lessonComments.id, cursor) : undefined
      )
    )
    .orderBy(asc(lessonComments.id))
    .limit(limit + 1)
    .all();
  const hasMore = rows.length > limit;
  return {
    replies: rows.slice(0, limit).map((r) => toView(r, instructorId)),
    hasMore,
  };
}

function countReplies(commentId: number) {
  return (
    db
      .select({ count: sql<number>`count(*)` })
      .from(lessonComments)
      .where(eq(lessonComments.parentId, commentId))
      .get()?.count ?? 0
  );
}

/** Total comments including replies, for the section heading. */
export function getCommentCount(lessonId: number) {
  return (
    db
      .select({ count: sql<number>`count(*)` })
      .from(lessonComments)
      .where(eq(lessonComments.lessonId, lessonId))
      .get()?.count ?? 0
  );
}

/** Top-level comments, oldest first; cursor is the id of the last loaded one. */
export function getComments(
  lessonId: number,
  cursor: number | null,
  limit: number
) {
  const ctx = getLessonContext(lessonId);
  if (!ctx) return { comments: [] as CommentThread[], hasMore: false };

  const rows = db
    .select(commentSelect)
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(
      and(
        eq(lessonComments.lessonId, lessonId),
        isNull(lessonComments.parentId),
        cursor != null ? gt(lessonComments.id, cursor) : undefined
      )
    )
    .orderBy(asc(lessonComments.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const comments: CommentThread[] = rows.slice(0, limit).map((row) => ({
    ...toView(row, ctx.instructorId),
    replyCount: countReplies(row.id),
    replies: fetchReplies(row.id, null, INITIAL_REPLIES_COUNT, ctx.instructorId)
      .replies,
  }));

  return { comments, hasMore };
}

/** Replies to a top-level comment, oldest first, after the cursor reply id. */
export function getReplies(
  commentId: number,
  cursor: number | null,
  limit: number
) {
  const parent = db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, commentId))
    .get();
  if (!parent) return { replies: [] as CommentView[], hasMore: false };
  const ctx = getLessonContext(parent.lessonId);
  if (!ctx) return { replies: [] as CommentView[], hasMore: false };
  return fetchReplies(commentId, cursor, limit, ctx.instructorId);
}

export function addComment(
  userId: number,
  lessonId: number,
  body: string,
  parentId?: number | null
) {
  if (!getLessonContext(lessonId)) {
    throw new CommentError("not_found", "Lesson not found");
  }
  if (!canAccessComments(userId, lessonId)) {
    throw new CommentError("forbidden", "You cannot comment on this lesson");
  }
  const text = validateBody(body);

  let attachTo: number | null = null;
  if (parentId != null) {
    const parent = db
      .select()
      .from(lessonComments)
      .where(eq(lessonComments.id, parentId))
      .get();
    if (!parent) throw new CommentError("not_found", "Comment not found");
    if (parent.lessonId !== lessonId) {
      throw new CommentError("invalid", "Parent comment is on another lesson");
    }
    // One level only: replying to a reply attaches to the top-level parent.
    attachTo = parent.parentId ?? parent.id;
  }

  const now = new Date().toISOString();
  return db
    .insert(lessonComments)
    .values({
      lessonId,
      userId,
      parentId: attachTo,
      body: text,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

function getCommentOrThrow(commentId: number) {
  const comment = db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, commentId))
    .get();
  if (!comment) throw new CommentError("not_found", "Comment not found");
  return comment;
}

export function editComment(userId: number, commentId: number, body: string) {
  const comment = getCommentOrThrow(commentId);
  if (
    comment.userId !== userId ||
    !canAccessComments(userId, comment.lessonId)
  ) {
    throw new CommentError("forbidden", "You cannot edit this comment");
  }
  const text = validateBody(body);
  // Guarantee updatedAt differs from createdAt so the "edited" marker shows.
  let now = new Date().toISOString();
  if (now === comment.createdAt) {
    now = new Date(Date.parse(now) + 1).toISOString();
  }
  return db
    .update(lessonComments)
    .set({ body: text, updatedAt: now })
    .where(eq(lessonComments.id, commentId))
    .returning()
    .get();
}

/** Authors (while enrolled), the course instructor, and admins may delete. */
export function deleteComment(userId: number, commentId: number) {
  const comment = getCommentOrThrow(commentId);
  const ctx = getLessonContext(comment.lessonId);
  const isModerator =
    !!ctx &&
    (ctx.instructorId === userId || getUserRole(userId) === UserRole.Admin);
  const isAuthor =
    comment.userId === userId && canAccessComments(userId, comment.lessonId);
  if (!isModerator && !isAuthor) {
    throw new CommentError("forbidden", "You cannot delete this comment");
  }
  // Replies are removed by ON DELETE CASCADE.
  db.delete(lessonComments).where(eq(lessonComments.id, commentId)).run();
}

/** Number of replies that deleting this comment would remove. */
export function getReplyCount(commentId: number) {
  return countReplies(commentId);
}

/** Course instructor or admin: may delete any comment on the lesson. */
export function canModerateComments(userId: number, lessonId: number) {
  const ctx = getLessonContext(lessonId);
  if (!ctx) return false;
  return ctx.instructorId === userId || getUserRole(userId) === UserRole.Admin;
}

export function commentBelongsToLesson(commentId: number, lessonId: number) {
  const row = db
    .select({ lessonId: lessonComments.lessonId })
    .from(lessonComments)
    .where(eq(lessonComments.id, commentId))
    .get();
  return row?.lessonId === lessonId;
}
