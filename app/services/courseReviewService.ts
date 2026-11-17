import { eq, and, sql } from "drizzle-orm";
import { db } from "~/db";
import { courseReviews, courses, users } from "~/db/schema";

export interface CourseReviewStats {
  averageRating: number;
  reviewCount: number;
}

export function getCourseReviewStats(courseId: number): CourseReviewStats {
  const result = db
    .select({
      averageRating:
        sql<number>`COALESCE(AVG(${courseReviews.rating}), 0)`.mapWith(Number),
      reviewCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(courseReviews)
    .where(eq(courseReviews.courseId, courseId))
    .get();

  return {
    averageRating: result?.averageRating ?? 0,
    reviewCount: result?.reviewCount ?? 0,
  };
}

export function getUserReview(
  userId: number,
  courseId: number,
): typeof courseReviews.$inferSelect | null {
  const result = db
    .select()
    .from(courseReviews)
    .where(
      and(
        eq(courseReviews.userId, userId),
        eq(courseReviews.courseId, courseId),
      ),
    )
    .get();

  return result ?? null;
}

export function upsertReview(
  userId: number,
  courseId: number,
  rating: number,
): typeof courseReviews.$inferSelect {
  const existing = getUserReview(userId, courseId);

  if (existing) {
    return db
      .update(courseReviews)
      .set({ rating, updatedAt: new Date().toISOString() })
      .where(eq(courseReviews.id, existing.id))
      .returning()
      .get()!;
  }

  return db
    .insert(courseReviews)
    .values({
      userId,
      courseId,
      rating,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .returning()
    .get()!;
}

export function getCourseReviewWithDetails(courseId: number) {
  return db
    .select({
      id: courseReviews.id,
      userId: courseReviews.userId,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
      rating: courseReviews.rating,
      createdAt: courseReviews.createdAt,
      updatedAt: courseReviews.updatedAt,
    })
    .from(courseReviews)
    .innerJoin(users, eq(courseReviews.userId, users.id))
    .where(eq(courseReviews.courseId, courseId))
    .orderBy(sql`${courseReviews.createdAt} DESC`)
    .all();
}
