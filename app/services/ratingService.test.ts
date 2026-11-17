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

// Import after mock so the module picks up our test db
import {
  rateCourse,
  getUserRatingForCourse,
  getCourseRatingSummary,
  getRatingSummariesForCourses,
} from "./ratingService";
import { enrollUser } from "./enrollmentService";

function createStudent(email: string) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

function createCourse(slug: string) {
  return testDb
    .insert(schema.courses)
    .values({
      title: slug,
      slug,
      description: "Another course",
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

describe("ratingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("rateCourse", () => {
    it("records a rating for an enrolled student", () => {
      enrollUser(base.user.id, base.course.id, false, false);

      const rating = rateCourse(base.user.id, base.course.id, 4);

      expect(rating.rating).toBe(4);
      expect(getUserRatingForCourse(base.user.id, base.course.id)?.rating).toBe(4);
    });

    it("replaces an existing rating instead of adding a second one", () => {
      enrollUser(base.user.id, base.course.id, false, false);

      rateCourse(base.user.id, base.course.id, 2);
      rateCourse(base.user.id, base.course.id, 5);

      const summary = getCourseRatingSummary(base.course.id);
      expect(summary).toEqual({ average: 5, count: 1 });
    });

    it("rejects students who are not enrolled", () => {
      expect(() => rateCourse(base.user.id, base.course.id, 5)).toThrowError(
        "Only enrolled students can rate this course"
      );
    });

    it.each([0, 6, 3.5, NaN])("rejects invalid rating %s", (value) => {
      enrollUser(base.user.id, base.course.id, false, false);

      expect(() => rateCourse(base.user.id, base.course.id, value)).toThrowError(
        "Rating must be a whole number between 1 and 5"
      );
    });
  });

  describe("getUserRatingForCourse", () => {
    it("returns undefined when the user has not rated", () => {
      expect(getUserRatingForCourse(base.user.id, base.course.id)).toBeUndefined();
    });
  });

  describe("getCourseRatingSummary", () => {
    it("returns a null average when there are no ratings", () => {
      expect(getCourseRatingSummary(base.course.id)).toEqual({
        average: null,
        count: 0,
      });
    });

    it("averages ratings across students, rounded to one decimal", () => {
      const students = [base.user, createStudent("a@x.com"), createStudent("b@x.com")];
      const values = [5, 4, 4];
      students.forEach((s, i) => {
        enrollUser(s.id, base.course.id, false, false);
        rateCourse(s.id, base.course.id, values[i]);
      });

      expect(getCourseRatingSummary(base.course.id)).toEqual({
        average: 4.3,
        count: 3,
      });
    });
  });

  describe("getRatingSummariesForCourses", () => {
    it("returns summaries for each requested course, including unrated ones", () => {
      const other = createCourse("other-course");
      enrollUser(base.user.id, base.course.id, false, false);
      rateCourse(base.user.id, base.course.id, 3);

      const summaries = getRatingSummariesForCourses([base.course.id, other.id]);

      expect(summaries.get(base.course.id)).toEqual({ average: 3, count: 1 });
      expect(summaries.get(other.id)).toEqual({ average: null, count: 0 });
    });

    it("returns an empty map for an empty list", () => {
      expect(getRatingSummariesForCourses([]).size).toBe(0);
    });
  });
});
