import { eq, and, sql } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings } from "~/db/schema";

// ─── Rating Service ───
// Handles star ratings (1-5) for courses. One rating per user per course;
// rating again replaces the previous value.
// Uses positional parameters (project convention).

export function isValidRating(rating: number) {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

export function getUserRating(userId: number, courseId: number) {
  const row = db
    .select({ rating: courseRatings.rating })
    .from(courseRatings)
    .where(
      and(eq(courseRatings.userId, userId), eq(courseRatings.courseId, courseId))
    )
    .get();
  return row?.rating ?? null;
}

export function setRating(userId: number, courseId: number, rating: number) {
  if (!isValidRating(rating)) {
    throw new Error("Rating must be an integer between 1 and 5");
  }

  const now = new Date().toISOString();
  return db
    .insert(courseRatings)
    .values({ userId, courseId, rating })
    .onConflictDoUpdate({
      target: [courseRatings.userId, courseRatings.courseId],
      set: { rating, updatedAt: now },
    })
    .returning()
    .get();
}

/** Average (rounded to 1 decimal) and count; average is null when unrated. */
export function getCourseRatingSummary(courseId: number) {
  const row = db
    .select({
      average: sql<number | null>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .get();

  const count = row?.count ?? 0;
  return {
    average: count > 0 && row?.average != null ? Math.round(row.average * 10) / 10 : null,
    count,
  };
}
