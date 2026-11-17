import { useState } from "react";
import { useFetcher } from "react-router";
import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

const STARS = [1, 2, 3, 4, 5];

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className="inline-flex items-center" aria-hidden="true">
      {STARS.map((star) => {
        const fill = Math.max(0, Math.min(1, value - (star - 1)));
        return (
          <span key={star} className="relative inline-block">
            <Star className={cn("text-muted-foreground/30", className)} />
            {fill > 0 && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star className={cn("fill-amber-400 text-amber-400", className)} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Read-only average rating, e.g. ★★★★☆ 4.3 (12). */
export function RatingSummary({
  average,
  count,
  size = "sm",
  className,
}: {
  average: number | null;
  count: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const starClass = size === "md" ? "size-5" : "size-3.5";
  const textClass = size === "md" ? "text-sm" : "text-xs";

  if (average === null || count === 0) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-muted-foreground", textClass, className)}>
        <Stars value={0} className={starClass} />
        No ratings yet
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", textClass, className)}
      aria-label={`Rated ${average.toFixed(1)} out of 5 from ${count} ${count === 1 ? "rating" : "ratings"}`}
    >
      <Stars value={average} className={starClass} />
      <span className="font-semibold text-foreground">{average.toFixed(1)}</span>
      <span className="text-muted-foreground">({count})</span>
    </span>
  );
}

/** Interactive 1–5 star picker that submits to the current route's action. */
export function RatingInput({ currentRating }: { currentRating: number | null }) {
  const fetcher = useFetcher<{ error?: string }>();
  const [hovered, setHovered] = useState<number | null>(null);

  // Optimistic: show the submitted value while the request is in flight
  const pending = fetcher.formData?.get("rating");
  const selected = pending ? Number(pending) : currentRating;
  const shown = hovered ?? selected ?? 0;

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="rate" />
      <div
        className="flex items-center gap-1"
        role="radiogroup"
        aria-label="Rate this course"
        onMouseLeave={() => setHovered(null)}
      >
        {STARS.map((star) => (
          <button
            key={star}
            type="submit"
            name="rating"
            value={star}
            role="radio"
            aria-checked={selected === star}
            aria-label={`${star} star${star === 1 ? "" : "s"}`}
            onMouseEnter={() => setHovered(star)}
            onFocus={() => setHovered(star)}
            onBlur={() => setHovered(null)}
            className="rounded-sm p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Star
              className={cn(
                "size-6",
                star <= shown
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/40"
              )}
            />
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {fetcher.data?.error
          ? <span className="text-destructive">{fetcher.data.error}</span>
          : selected
            ? `You rated this ${selected} star${selected === 1 ? "" : "s"}. Click to change.`
            : "Click a star to rate this course."}
      </p>
    </fetcher.Form>
  );
}
