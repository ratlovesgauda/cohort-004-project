import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  setRating,
  getUserRating,
  getCourseRatingSummary,
} from "./ratingService";

function addStudent(email: string) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

describe("ratingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  it("returns null average and zero count when unrated", () => {
    expect(getCourseRatingSummary(base.course.id)).toEqual({
      average: null,
      count: 0,
    });
    expect(getUserRating(base.user.id, base.course.id)).toBeNull();
  });

  it("stores a rating for a user", () => {
    setRating(base.user.id, base.course.id, 4);
    expect(getUserRating(base.user.id, base.course.id)).toBe(4);
  });

  it("replaces a user's previous rating instead of adding another", () => {
    setRating(base.user.id, base.course.id, 2);
    setRating(base.user.id, base.course.id, 5);
    expect(getUserRating(base.user.id, base.course.id)).toBe(5);
    expect(getCourseRatingSummary(base.course.id)).toEqual({
      average: 5,
      count: 1,
    });
  });

  it("computes the average rounded to one decimal", () => {
    const b = addStudent("b@example.com");
    const c = addStudent("c@example.com");
    setRating(base.user.id, base.course.id, 5);
    setRating(b.id, base.course.id, 4);
    setRating(c.id, base.course.id, 4);
    expect(getCourseRatingSummary(base.course.id)).toEqual({
      average: 4.3,
      count: 3,
    });
  });

  it("only counts ratings for the requested course", () => {
    const other = testDb
      .insert(schema.courses)
      .values({
        title: "Other",
        slug: "other",
        description: "Other",
        instructorId: base.instructor.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Published,
      })
      .returning()
      .get();
    setRating(base.user.id, base.course.id, 5);
    setRating(base.user.id, other.id, 1);
    expect(getCourseRatingSummary(base.course.id).average).toBe(5);
    expect(getCourseRatingSummary(other.id).average).toBe(1);
  });

  it.each([0, 6, 3.5, NaN])("rejects invalid rating %s", (value) => {
    expect(() => setRating(base.user.id, base.course.id, value)).toThrow();
  });
});
