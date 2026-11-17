import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

/** Read-only display of an average rating, with count. */
export function StarRatingDisplay({
  average,
  count,
  className,
}: {
  average: number | null;
  count: number;
  className?: string;
}) {
  if (average === null) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        No ratings yet
      </span>
    );
  }
  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      aria-label={`Rated ${average} out of 5 from ${count} ${count === 1 ? "rating" : "ratings"}`}
    >
      <Star className="size-4 fill-yellow-400 text-yellow-400" />
      <span className="font-medium text-foreground">{average.toFixed(1)}</span>
      <span className="text-muted-foreground">({count})</span>
    </span>
  );
}
