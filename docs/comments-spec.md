# Lesson Comments — Spec

Status: agreed via design interview. Not yet implemented.

## Scope

- Comments attach to **lessons only** (not courses).
- Plain text only, max **1000 characters** for comments and replies. One shared constant drives service validation, the form `maxLength`, and the character counter.
- Out of scope for v1: likes, notifications, @mentions, reporting/flagging, real-time updates, markdown.

## Data model

- Dedicated `lessonComments` table (not polymorphic), added via a Drizzle migration.
- Columns: id, `lessonId` (FK, cascade delete), `userId` (FK, cascade delete), `parentId` (nullable, self-reference, cascade delete), body, createdAt, updatedAt.
- One level of replies: a reply cannot have replies. Replying to a reply attaches the new reply to the top-level parent.
- Replying to a comment that belongs to a different lesson is rejected.
- An edited comment shows an "edited" marker.

## Access rules

- Enrolled students, the course instructor, and admins can read and post.
- Authors can edit and delete their own comments.
- Instructors (of the course) and admins can delete any comment on that course.
- Unenrolled users have no access. If enrollment is removed, the user loses access, including edit/delete of their old comments. The comments remain.
- Comments by the course instructor display an "Instructor" badge.

## Pagination and ordering

- Top-level comments: **oldest first**, 10 initially, "Load more" loads 10 more via a fetcher using a cursor (id of the last loaded top-level comment).
- Replies: **oldest first**, each thread loads with its first 3 replies and a total `replyCount`. A "Show N more replies" button (N = hidden count) loads up to 10 more per click via a fetcher with a cursor (id of the last loaded reply).
- New comments/replies appear optimistically at the end of the loaded list. A new reply bumps `replyCount` but not the "N more" figure. The server cursor is unaffected.

## Deletion

- Deleting a top-level comment deletes its replies; the confirmation dialog states how many replies will be removed.
- Deleting a reply removes only that reply.

## UI

- Comments section below the lesson content in `app/routes/courses.$slug.lessons.$lessonId.tsx`, with a comment count in the heading.
- Each comment shows author name and avatar (if the app has them), relative timestamp, "edited" marker when applicable, and edit/delete controls only for those allowed.
- Empty state: "No comments yet. Start the discussion."
- Mutations go through the route action using an `intent`, validated with zod (like the rate action in `courses.$slug.tsx`).

## Service API (`app/services/commentService.ts`)

Positional parameters, per project convention:

- `getComments(lessonId, cursor, limit)`
- `getReplies(commentId, cursor, limit)`
- `addComment(userId, lessonId, body, parentId?)`
- `editComment(userId, commentId, body)`
- `deleteComment(userId, commentId)`
- `canAccessComments(userId, lessonId)`

Permission checks live in the service. The route action only maps errors to 403 or 400 responses.

## Tests and seed

- `app/services/commentService.test.ts`, in the style of `ratingService.test.ts`. Cover: permissions (enrolled, instructor, admin, unenrolled), pagination cursors for comments and replies, reply-to-reply flattening, edit, cascade delete.
- Add seed comments to `scripts/seed.ts`.
