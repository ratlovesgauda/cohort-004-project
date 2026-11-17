import { Star } from "lucide-react";
import { useState } from "react";

interface StarRatingBase {
  size?: number;
  color?: string;
}

interface StarRatingDisplayProps extends StarRatingBase {
  rating: number;
  maxRating?: number;
  showLabel?: boolean;
  labelPosition?: "left" | "right";
}

export function StarRatingDisplay({
  rating,
  maxRating = 5,
  size = 16,
  color = "text-yellow-400",
  showLabel = false,
  labelPosition = "right",
}: StarRatingDisplayProps) {
  const roundedRating = Math.round(rating * 2) / 2; // round to nearest 0.5

  return (
    <span className="inline-flex items-center gap-0.5">
      {labelPosition === "left" && showLabel && (
        <span className="text-sm font-medium text-foreground">{rating.toFixed(1)}</span>
      )}
      <div className="flex items-center gap-0.5">
        {Array.from({ length: maxRating }, (_, i) => {
          const fillValue = i + 1;
          let fillClass = "text-muted-foreground/30";

          if (roundedRating >= fillValue) {
            fillClass = color;
          } else if (roundedRating > i) {
            fillClass = "text-yellow-200";
          }

          return (
            <Star
              key={i}
              size={size}
              className={`${fillClass} fill-current`}
            />
          );
        })}
      </div>
      {labelPosition === "right" && showLabel && (
        <span className="ml-1 text-sm font-medium text-foreground">
          {rating.toFixed(1)}
        </span>
      )}
    </span>
  );
}

interface StarRatingInputProps extends StarRatingBase {
  rating: number;
  onRate: (rating: number) => void;
  size?: number;
  disabled?: boolean;
}

export function StarRatingInput({
  rating,
  onRate,
  size = 24,
  disabled = false,
}: StarRatingInputProps) {
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = hoverRating !== null ? star <= hoverRating : star <= rating;

        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => onRate(star)}
            onMouseEnter={() => !disabled && setHoverRating(star)}
            onMouseLeave={() => setHoverRating(null)}
            className={`rounded-sm p-0.5 transition-colors ${
              disabled ? "cursor-default" : "cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
            }`}
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
            role="radio"
            aria-checked={isFilled}
            tabIndex={disabled ? -1 : 0}
          >
            <Star
              size={size}
              className={`transition-colors ${
                isFilled ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
