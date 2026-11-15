/** Fixed choices shown in onboarding and settings. Values match database check constraints. */

export const EDUCATIONAL_ROLES = [
  { value: "elementary_teacher", label: "Elementary teacher" },
  { value: "middle_school_teacher", label: "Middle school teacher" },
  { value: "high_school_teacher", label: "High school teacher" },
  { value: "administrator", label: "School administrator" },
  { value: "counselor", label: "Counselor" },
  { value: "coach", label: "Coach" },
  { value: "homeschool", label: "Homeschool educator" },
  { value: "other", label: "Other" },
] as const;

export const GRADE_LEVELS = [
  { value: "k2", label: "Kindergarten to grade 2" },
  { value: "g35", label: "Grades 3 to 5" },
  { value: "g68", label: "Grades 6 to 8" },
  { value: "g912", label: "Grades 9 to 12" },
] as const;

export const SUBJECTS = [
  "Bible",
  "Language arts",
  "Mathematics",
  "Science",
  "Social studies",
  "Fine arts",
  "Physical education",
  "World languages",
  "Technology",
  "Special education",
  "Counseling",
  "Other",
] as const;

export const TRANSLATIONS = [
  { value: "web", label: "World English Bible (WEB)" },
  { value: "kjv", label: "King James Version (KJV)" },
] as const;

export const EMAIL_FREQUENCIES = [
  { value: "weekdays", label: "Weekdays only" },
  { value: "daily", label: "Every day" },
  { value: "off", label: "No devotional emails" },
] as const;

export const SCHOOL_ROLE_CHOICES = [
  { value: "faculty", label: "Faculty" },
  { value: "staff", label: "Staff" },
  { value: "admin", label: "Administrator" },
] as const;

const values = <T extends readonly { value: string }[]>(list: T) => list.map((item) => item.value) as [string, ...string[]];

export const EDUCATIONAL_ROLE_VALUES = values(EDUCATIONAL_ROLES);
export const GRADE_LEVEL_VALUES = values(GRADE_LEVELS);
export const TRANSLATION_VALUES = values(TRANSLATIONS);
export const EMAIL_FREQUENCY_VALUES = values(EMAIL_FREQUENCIES);
