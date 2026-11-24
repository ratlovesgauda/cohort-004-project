import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { COMMENT_MAX_LENGTH } from "~/lib/comments";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let otherLessonId: number;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  addComment,
  editComment,
  deleteComment,
  getComments,
  getReplies,
  getCommentCount,
  canAccessComments,
  CommentError,
} from "./commentService";

function addUser(email: string, role = schema.UserRole.Student) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role })
    .returning()
    .get();
}

function enroll(userId: number) {
  testDb
    .insert(schema.enrollments)
    .values({ userId, courseId: base.course.id })
    .run();
}

function addLesson(title: string) {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "M", position: 1 })
    .returning()
    .get();
  return testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title, position: 1 })
    .returning()
    .get().id;
}

function errorCode(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    if (e instanceof CommentError) return e.code;
    throw e;
  }
  return null;
}

describe("commentService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
    lessonId = addLesson("L1");
    otherLessonId = addLesson("L2");
    enroll(base.user.id);
  });

  describe("permissions", () => {
    it("allows enrolled students, the instructor, and admins", () => {
      const admin = addUser("admin@example.com", schema.UserRole.Admin);
      expect(canAccessComments(base.user.id, lessonId)).toBe(true);
      expect(canAccessComments(base.instructor.id, lessonId)).toBe(true);
      expect(canAccessComments(admin.id, lessonId)).toBe(true);
    });

    it("denies unenrolled users reading context and posting", () => {
      const stranger = addUser("stranger@example.com");
      expect(canAccessComments(stranger.id, lessonId)).toBe(false);
      expect(errorCode(() => addComment(stranger.id, lessonId, "hi"))).toBe(
        "forbidden"
      );
    });

    it("revokes edit/delete of old comments when enrollment is removed", () => {
      const c = addComment(base.user.id, lessonId, "hello");
      testDb.delete(schema.enrollments).run();
      expect(errorCode(() => editComment(base.user.id, c.id, "x"))).toBe(
        "forbidden"
      );
      expect(errorCode(() => deleteComment(base.user.id, c.id))).toBe(
        "forbidden"
      );
      expect(getCommentCount(lessonId)).toBe(1);
    });

    it("lets only the author edit", () => {
      const c = addComment(base.user.id, lessonId, "hello");
      expect(errorCode(() => editComment(base.instructor.id, c.id, "x"))).toBe(
        "forbidden"
      );
    });

    it("lets instructor and admin delete any comment, but not other students", () => {
      const other = addUser("other@example.com");
      enroll(other.id);
      const admin = addUser("admin@example.com", schema.UserRole.Admin);
      const c1 = addComment(base.user.id, lessonId, "a");
      const c2 = addComment(base.user.id, lessonId, "b");
      expect(errorCode(() => deleteComment(other.id, c1.id))).toBe("forbidden");
      deleteComment(base.instructor.id, c1.id);
      deleteComment(admin.id, c2.id);
      expect(getCommentCount(lessonId)).toBe(0);
    });

    it("flags instructor comments", () => {
      addComment(base.instructor.id, lessonId, "welcome");
      addComment(base.user.id, lessonId, "thanks");
      const { comments } = getComments(lessonId, null, 10);
      expect(comments.map((c) => c.isInstructor)).toEqual([true, false]);
    });
  });

  describe("validation", () => {
    it("rejects empty and over-long bodies", () => {
      expect(errorCode(() => addComment(base.user.id, lessonId, "   "))).toBe(
        "invalid"
      );
      expect(
        errorCode(() =>
          addComment(base.user.id, lessonId, "x".repeat(COMMENT_MAX_LENGTH + 1))
        )
      ).toBe("invalid");
      addComment(base.user.id, lessonId, "x".repeat(COMMENT_MAX_LENGTH));
    });

    it("rejects replying to a comment on a different lesson", () => {
      const c = addComment(base.user.id, lessonId, "a");
      expect(
        errorCode(() => addComment(base.user.id, otherLessonId, "r", c.id))
      ).toBe("invalid");
    });
  });

  describe("replies", () => {
    it("flattens replies to replies onto the top-level parent", () => {
      const top = addComment(base.user.id, lessonId, "top");
      const r1 = addComment(base.user.id, lessonId, "r1", top.id);
      const r2 = addComment(base.user.id, lessonId, "r2", r1.id);
      expect(r2.parentId).toBe(top.id);
      const { comments } = getComments(lessonId, null, 10);
      expect(comments).toHaveLength(1);
      expect(comments[0].replyCount).toBe(2);
    });
  });

  describe("pagination", () => {
    it("pages top-level comments oldest first with a cursor", () => {
      for (let i = 1; i <= 5; i++) addComment(base.user.id, lessonId, `c${i}`);
      const page1 = getComments(lessonId, null, 2);
      expect(page1.comments.map((c) => c.body)).toEqual(["c1", "c2"]);
      expect(page1.hasMore).toBe(true);
      const page2 = getComments(lessonId, page1.comments[1].id, 2);
      expect(page2.comments.map((c) => c.body)).toEqual(["c3", "c4"]);
      const page3 = getComments(lessonId, page2.comments[1].id, 2);
      expect(page3.comments.map((c) => c.body)).toEqual(["c5"]);
      expect(page3.hasMore).toBe(false);
    });

    it("loads 3 initial replies with total count, then pages the rest", () => {
      const top = addComment(base.user.id, lessonId, "top");
      for (let i = 1; i <= 7; i++) {
        addComment(base.user.id, lessonId, `r${i}`, top.id);
      }
      const [thread] = getComments(lessonId, null, 10).comments;
      expect(thread.replyCount).toBe(7);
      expect(thread.replies.map((r) => r.body)).toEqual(["r1", "r2", "r3"]);

      const next = getReplies(top.id, thread.replies[2].id, 2);
      expect(next.replies.map((r) => r.body)).toEqual(["r4", "r5"]);
      expect(next.hasMore).toBe(true);
      const last = getReplies(top.id, next.replies[1].id, 2);
      expect(last.replies.map((r) => r.body)).toEqual(["r6", "r7"]);
      expect(last.hasMore).toBe(false);
    });
  });

  describe("edit", () => {
    it("updates the body and marks the comment edited", () => {
      const c = addComment(base.user.id, lessonId, "old");
      expect(getComments(lessonId, null, 10).comments[0].edited).toBe(false);
      editComment(base.user.id, c.id, "new");
      const [after] = getComments(lessonId, null, 10).comments;
      expect(after.body).toBe("new");
      expect(after.edited).toBe(true);
    });
  });

  describe("delete", () => {
    it("deleting a top-level comment removes its replies", () => {
      const top = addComment(base.user.id, lessonId, "top");
      addComment(base.user.id, lessonId, "r1", top.id);
      addComment(base.user.id, lessonId, "r2", top.id);
      deleteComment(base.user.id, top.id);
      expect(getCommentCount(lessonId)).toBe(0);
    });

    it("deleting a reply removes only that reply", () => {
      const top = addComment(base.user.id, lessonId, "top");
      const r1 = addComment(base.user.id, lessonId, "r1", top.id);
      addComment(base.user.id, lessonId, "r2", top.id);
      deleteComment(base.user.id, r1.id);
      expect(getCommentCount(lessonId)).toBe(2);
      expect(getComments(lessonId, null, 10).comments[0].replyCount).toBe(1);
    });
  });
});
