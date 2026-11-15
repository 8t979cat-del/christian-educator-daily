import { z } from "zod";
import {
  EDUCATIONAL_ROLE_VALUES,
  EMAIL_FREQUENCY_VALUES,
  GRADE_LEVEL_VALUES,
  SUBJECTS,
  TRANSLATION_VALUES,
} from "./options";

/** Validation for every account-related form. Used on the server; never trust the browser. */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(254, "That email address is too long."));

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use 128 characters or fewer.")
  .refine((value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value), {
    message: "Include at least one letter and one number.",
  });

const nameSchema = (label: string) =>
  z.string().trim().min(1, `Enter your ${label}.`).max(80, `Your ${label} must be 80 characters or fewer.`);

export const signUpSchema = z.object({
  firstName: nameSchema("first name"),
  lastName: nameSchema("last name"),
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(128),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords do not match.",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords do not match.",
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password you have not used here before.",
  });

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .transform((value) => (value === "" ? null : value));

export const profileSchema = z.object({
  firstName: nameSchema("first name"),
  lastName: nameSchema("last name"),
  educationalRole: z.enum(EDUCATIONAL_ROLE_VALUES, "Choose your role."),
  gradeLevels: z.array(z.enum(GRADE_LEVEL_VALUES)).min(1, "Choose at least one grade level.").max(4),
  subjects: z.array(z.enum(SUBJECTS)).max(12),
  schoolAffiliation: optionalText(120, "School name"),
  denomination: optionalText(80, "Denomination"),
  defaultTranslation: z.enum(TRANSLATION_VALUES, "Choose a Bible translation."),
});

export const notificationSchema = z.object({
  emailFrequency: z.enum(EMAIL_FREQUENCY_VALUES, "Choose how often to receive email."),
  notifyAssignments: z.boolean(),
  notifyCommunity: z.boolean(),
  notifyProduct: z.boolean(),
});

export const onboardingSchema = profileSchema.extend(notificationSchema.shape);

export const createSchoolSchema = z.object({
  name: z.string().trim().min(2, "Enter the school's name.").max(120, "Use 120 characters or fewer."),
});

export const inviteSchema = z.object({
  schoolId: z.uuid(),
  email: emailSchema,
  role: z.enum(["faculty", "staff", "admin"], "Choose a role."),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm.").max(128),
  confirmation: z.literal("DELETE", { message: "Type DELETE to confirm." }),
});

export const grantRoleSchema = z.object({
  email: emailSchema,
  role: z.enum(["platform_admin", "content_editor", "moderator"], "Choose a role."),
});

export const uuidSchema = z.uuid();
