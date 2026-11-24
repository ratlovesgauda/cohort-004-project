import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { UserAvatar } from "~/components/user-avatar";
import { COMMENT_MAX_LENGTH, formatRelativeTime } from "~/lib/comments";
import type { CommentThread, CommentView } from "~/services/commentService";

type Viewer = {
  id: number;
  name: string;
  avatarUrl: string | null;
  isInstructor: boolean;
};

type RawComment = {
  id: number;
  lessonId: number;
  userId: number;
  parentId: number | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

type MutationData = { comment?: RawComment; deletedId?: number; error?: string };

type Thread = CommentThread;

function toView(raw: RawComment, viewer: Viewer): CommentView {
  return {
    ...raw,
    edited: raw.updatedAt !== raw.createdAt,
    authorName: viewer.name,
    authorAvatarUrl: viewer.avatarUrl,
    isInstructor: viewer.isInstructor,
  };
}

function mergeById<T extends { id: number }>(existing: T[], incoming: T[]) {
  const seen = new Set(existing.map((c) => c.id));
  const merged = [...existing, ...incoming.filter((c) => !seen.has(c.id))];
  // ids are monotonic, so id order is chronological order
  return merged.sort((a, b) => a.id - b.id);
}

export function LessonComments({
  courseSlug,
  lessonId,
  viewer,
  canModerate,
  initialCount,
  initialComments,
  initialHasMore,
}: {
  courseSlug: string;
  lessonId: number;
  viewer: Viewer;
  canModerate: boolean;
  initialCount: number;
  initialComments: Thread[];
  initialHasMore: boolean;
}) {
  const [threads, setThreads] = useState<Thread[]>(initialComments);
  const [count, setCount] = useState(initialCount);
  const [hasMore, setHasMore] = useState(initialHasMore);
  // Server cursor: last top-level comment loaded from the server. Optimistic
  // additions don't move it.
  const [cursor, setCursor] = useState<number | null>(
    initialComments.at(-1)?.id ?? null
  );
  const loader = useFetcher<{ comments: Thread[]; hasMore: boolean }>();
  const base = `/courses/${courseSlug}/lessons/${lessonId}/comments`;

  useEffect(() => {
    const d = loader.data;
    if (!d || !("comments" in d)) return;
    setThreads((prev) => mergeById(prev, d.comments));
    setHasMore(d.hasMore);
    if (d.comments.length > 0) setCursor(d.comments.at(-1)!.id);
  }, [loader.data]);

  function updateThread(id: number, fn: (t: Thread) => Thread) {
    setThreads((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }

  return (
    <section className="mb-8" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="mb-4 text-xl font-semibold">
        Comments ({count})
      </h2>

      <CommentForm
        placeholder="Add a comment..."
        submitLabel="Comment"
        onSuccess={(raw) => {
          setThreads((prev) => [
            ...prev,
            { ...toView(raw, viewer), replyCount: 0, replies: [] },
          ]);
          setCount((c) => c + 1);
        }}
      />

      {threads.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No comments yet. Start the discussion.
        </p>
      ) : (
        <ul className="mt-6 space-y-6">
          {threads.map((thread) => (
            <ThreadView
              key={thread.id}
              thread={thread}
              viewer={viewer}
              canModerate={canModerate}
              base={base}
              onChange={(fn) => updateThread(thread.id, fn)}
              onDeleteThread={() => {
                setThreads((prev) => prev.filter((t) => t.id !== thread.id));
                setCount((c) => c - 1 - thread.replyCount);
              }}
              onReplyAdded={() => setCount((c) => c + 1)}
              onReplyDeleted={() => setCount((c) => c - 1)}
            />
          ))}
        </ul>
      )}

      {hasMore && (
        <Button
          variant="outline"
          className="mt-6"
          disabled={loader.state !== "idle"}
          onClick={() => loader.load(`${base}?cursor=${cursor ?? ""}`)}
        >
          {loader.state !== "idle" ? "Loading..." : "Load more comments"}
        </Button>
      )}
    </section>
  );
}

function ThreadView({
  thread,
  viewer,
  canModerate,
  base,
  onChange,
  onDeleteThread,
  onReplyAdded,
  onReplyDeleted,
}: {
  thread: Thread;
  viewer: Viewer;
  canModerate: boolean;
  base: string;
  onChange: (fn: (t: Thread) => Thread) => void;
  onDeleteThread: () => void;
  onReplyAdded: () => void;
  onReplyDeleted: () => void;
}) {
  const [replying, setReplying] = useState<number | null>(null);
  const [replyCursor, setReplyCursor] = useState<number | null>(
    thread.replies.at(-1)?.id ?? null
  );
  const loader = useFetcher<{ replies: CommentView[]; hasMore: boolean }>();

  useEffect(() => {
    const d = loader.data;
    if (!d || !("replies" in d)) return;
    onChange((t) => ({ ...t, replies: mergeById(t.replies, d.replies) }));
    if (d.replies.length > 0) setReplyCursor(d.replies.at(-1)!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loader.data]);

  // A new reply bumps replyCount and the shown list equally, so this figure
  // only changes when more replies are loaded from the server.
  const hidden = Math.max(0, thread.replyCount - thread.replies.length);

  return (
    <li>
      <CommentItem
        comment={thread}
        viewer={viewer}
        canModerate={canModerate}
        deleteWarning={
          thread.replyCount > 0
            ? `This will also delete ${thread.replyCount} ${thread.replyCount === 1 ? "reply" : "replies"}.`
            : null
        }
        onReply={() => setReplying(thread.id)}
        onEdited={(raw) =>
          onChange((t) => ({ ...t, body: raw.body, updatedAt: raw.updatedAt, edited: true }))
        }
        onDeleted={onDeleteThread}
      />

      {(thread.replies.length > 0 || replying !== null) && (
        <ul className="mt-4 ml-11 space-y-4 border-l pl-4">
          {thread.replies.map((reply) => (
            <li key={reply.id}>
              <CommentItem
                comment={reply}
                viewer={viewer}
                canModerate={canModerate}
                deleteWarning={null}
                onReply={() => setReplying(reply.id)}
                onEdited={(raw) =>
                  onChange((t) => ({
                    ...t,
                    replies: t.replies.map((r) =>
                      r.id === reply.id
                        ? { ...r, body: raw.body, updatedAt: raw.updatedAt, edited: true }
                        : r
                    ),
                  }))
                }
                onDeleted={() => {
                  onChange((t) => ({
                    ...t,
                    replyCount: t.replyCount - 1,
                    replies: t.replies.filter((r) => r.id !== reply.id),
                  }));
                  onReplyDeleted();
                }}
              />
            </li>
          ))}

          {hidden > 0 && (
            <li>
              <Button
                variant="ghost"
                size="sm"
                disabled={loader.state !== "idle"}
                onClick={() =>
                  loader.load(
                    `${base}?parentId=${thread.id}&cursor=${replyCursor ?? ""}`
                  )
                }
              >
                {loader.state !== "idle"
                  ? "Loading..."
                  : `Show ${hidden} more ${hidden === 1 ? "reply" : "replies"}`}
              </Button>
            </li>
          )}

          {replying !== null && (
            <li>
              <CommentForm
                parentId={replying}
                placeholder="Write a reply..."
                submitLabel="Reply"
                autoFocus
                onCancel={() => setReplying(null)}
                onSuccess={(raw) => {
                  // Appended at the end of the loaded list; replyCount grows
                  // with it, so "Show N more" is unchanged.
                  onChange((t) => ({
                    ...t,
                    replyCount: t.replyCount + 1,
                    replies: [
                      ...t.replies,
                      toView({ ...raw, parentId: t.id }, viewer),
                    ],
                  }));
                  onReplyAdded();
                  setReplying(null);
                }}
              />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

function CommentItem({
  comment,
  viewer,
  canModerate,
  deleteWarning,
  onReply,
  onEdited,
  onDeleted,
}: {
  comment: CommentView;
  viewer: Viewer;
  canModerate: boolean;
  deleteWarning: string | null;
  onReply: () => void;
  onEdited: (raw: RawComment) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const deleter = useFetcher<MutationData>();
  const isAuthor = comment.userId === viewer.id;

  useEffect(() => {
    if (deleter.data?.deletedId === comment.id) onDeleted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleter.data]);

  function handleDelete() {
    const message = `Delete this comment? ${deleteWarning ?? ""}`.trim();
    if (!confirm(message)) return;
    deleter.submit(
      { intent: "delete-comment", commentId: String(comment.id) },
      { method: "post" }
    );
  }

  return (
    <div className="flex gap-3">
      <UserAvatar
        name={comment.authorName}
        avatarUrl={comment.authorAvatarUrl}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{comment.authorName}</span>
          {comment.isInstructor && (
            <span className="rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
              Instructor
            </span>
          )}
          <span className="text-muted-foreground" suppressHydrationWarning>
            {formatRelativeTime(comment.createdAt)}
          </span>
          {comment.edited && (
            <span className="text-xs text-muted-foreground">(edited)</span>
          )}
        </div>

        {editing ? (
          <CommentForm
            commentId={comment.id}
            initialBody={comment.body}
            placeholder="Edit your comment..."
            submitLabel="Save"
            autoFocus
            onCancel={() => setEditing(false)}
            onSuccess={(raw) => {
              onEdited(raw);
              setEditing(false);
            }}
          />
        ) : (
          <p className="mt-1 text-sm whitespace-pre-wrap break-words">
            {comment.body}
          </p>
        )}

        {!editing && (
          <div className="mt-1 flex gap-1">
            <Button variant="ghost" size="xs" onClick={onReply}>
              Reply
            </Button>
            {isAuthor && (
              <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {(isAuthor || canModerate) && (
              <Button
                variant="ghost"
                size="xs"
                disabled={deleter.state !== "idle"}
                onClick={handleDelete}
              >
                Delete
              </Button>
            )}
          </div>
        )}
        {deleter.data?.error && (
          <p className="mt-1 text-xs text-destructive">{deleter.data.error}</p>
        )}
      </div>
    </div>
  );
}

function CommentForm({
  parentId,
  commentId,
  initialBody = "",
  placeholder,
  submitLabel,
  autoFocus,
  onCancel,
  onSuccess,
}: {
  parentId?: number;
  commentId?: number;
  initialBody?: string;
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  onSuccess: (raw: RawComment) => void;
}) {
  const fetcher = useFetcher<MutationData>();
  const [body, setBody] = useState(initialBody);
  const isEdit = commentId !== undefined;
  const submitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.comment) {
      onSuccess(fetcher.data.comment);
      if (!isEdit) setBody("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  return (
    <fetcher.Form method="post" className="mt-2 space-y-2">
      <input
        type="hidden"
        name="intent"
        value={isEdit ? "edit-comment" : "add-comment"}
      />
      {isEdit && <input type="hidden" name="commentId" value={commentId} />}
      {parentId !== undefined && (
        <input type="hidden" name="parentId" value={parentId} />
      )}
      <Textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={COMMENT_MAX_LENGTH}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={3}
        aria-label={placeholder}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {body.length}/{COMMENT_MAX_LENGTH}
        </span>
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={submitting || body.trim().length === 0}
          >
            {submitting ? "Posting..." : submitLabel}
          </Button>
        </div>
      </div>
      {fetcher.data?.error && (
        <p className="text-xs text-destructive">{fetcher.data.error}</p>
      )}
    </fetcher.Form>
  );
}
