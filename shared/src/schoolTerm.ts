import { analysisDayOf } from "./analysisDay.js";

// The school term a class section runs in. An EDP code is a per-semester identifier, so the same code may
// come back next term but never twice in one. Layout and labels only: nothing here is read by scoring.

export const SEMESTERS = ["FIRST", "SECOND", "SUMMER"] as const;
export type Semester = (typeof SEMESTERS)[number];

export const SEMESTER_LABEL: Record<Semester, string> = {
  FIRST: "1st semester",
  SECOND: "2nd semester",
  SUMMER: "Summer",
};

export interface SchoolTerm {
  schoolYear: string; // "2026-2027"
  semester: Semester;
}

export const EDP_TAKEN_MESSAGE = "This EDP code is already used this semester. If this is your class, contact the admin.";

/** Aug-Dec = 1st semester of that year; Jan-May = 2nd semester and Jun-Jul = Summer of the year that began last August. */
export function termOf(date: Date | string | number): SchoolTerm {
  const day = analysisDayOf(date) ?? analysisDayOf(new Date()) ?? "1970-01-01";
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  if (month >= 8) return { schoolYear: `${year}-${year + 1}`, semester: "FIRST" };
  return { schoolYear: `${year - 1}-${year}`, semester: month <= 5 ? "SECOND" : "SUMMER" };
}

/** "2026-2027" where the second year follows the first. */
export function isValidSchoolYear(value: string): boolean {
  const m = /^(\d{4})-(\d{4})$/.exec(value);
  return !!m && Number(m[2]) === Number(m[1]) + 1;
}

export function termLabel(t: SchoolTerm): string {
  return `${t.schoolYear}, ${SEMESTER_LABEL[t.semester]}`;
}
