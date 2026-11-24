import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/courses.$slug.lessons.$lessonId.comments";
import { getCurrentUserId } from "~/lib/session";
import { COMMENTS_PAGE_SIZE, REPLIES_PAGE_SIZE } from "~/lib/comments";
import {
  canAccessComments,
  commentBelongsToLesson,
  getComments,
  getReplies,
} from "~/services/commentService";
import { parseParams } from "~/lib/validation";

const paramsSchema = z.object({
  lessonId: z.coerce.number().int(),
});

const querySchema = z.object({
  cursor: z.coerce.number().int().optional(),
  parentId: z.coerce.number().int().optional(),
});

// Resource route: paginated comments (no parentId) or replies (with parentId).
export async function loader({ params, request }: Route.LoaderArgs) {
  const { lessonId } = parseParams(params, paramsSchema);

  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("You must be logged in", { status: 401 });
  }
  if (!canAccessComments(currentUserId, lessonId)) {
    throw data("You cannot view comments on this lesson", { status: 403 });
  }

  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!query.success) {
    throw data("Invalid parameters", { status: 400 });
  }
  const { cursor, parentId } = query.data;

  if (parentId != null) {
    if (!commentBelongsToLesson(parentId, lessonId)) {
      throw data("Comment not found", { status: 404 });
    }
    return {
      kind: "replies" as const,
      parentId,
      ...getReplies(parentId, cursor ?? null, REPLIES_PAGE_SIZE),
    };
  }
  return {
    kind: "comments" as const,
    ...getComments(lessonId, cursor ?? null, COMMENTS_PAGE_SIZE),
  };
}
