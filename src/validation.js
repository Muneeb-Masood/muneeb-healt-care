import { z } from "zod";

const phoneRegex = /^\d{10}$/;
const zipRegex = /^\d{5}(?:-\d{4})?$/;
const stateRegex = /^[A-Z]{2}$/;

function isValidDateOfBirth(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;

  const [year, month, day] = value.split("-").map(Number);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) return false;

  const today = new Date();
  const todayUTC = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );

  return date <= todayUTC;
}

const patientFields = {
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isValidDateOfBirth, "date_of_birth must be a valid date that is not in the future"),
  sex: z.enum(["Male", "Female", "Other", "Decline to Answer"]),
  phone_number: z.string().regex(phoneRegex, "phone_number must contain exactly 10 digits"),
  address_line_1: z.string().trim().min(1).max(255),
  address_line_2: z.string().trim().max(255).optional().nullable(),
  city: z.string().trim().min(1).max(100),
  state: z.string().transform(v => v.toUpperCase()).pipe(
    z.string().regex(stateRegex, "state must be a 2-letter US abbreviation")
  ),
  zip_code: z.string().regex(zipRegex, "zip_code must be 5 digits or ZIP+4"),
  email: z.string().trim().email().max(255).optional().nullable(),
  insurance_provider: z.string().trim().max(255).optional().nullable(),
  insurance_member_id: z.string().trim().max(100).optional().nullable(),
  preferred_language: z.string().trim().min(1).max(100).default("English"),
  emergency_contact_name: z.string().trim().max(200).optional().nullable(),
  emergency_contact_phone: z.string().regex(phoneRegex, "emergency_contact_phone must contain exactly 10 digits").optional().nullable()
};

export const createPatientSchema = z.object(patientFields);

export const updatePatientSchema = z.object({
  ...Object.fromEntries(
    Object.entries(patientFields).map(([key, schema]) => [key, schema.optional()])
  )
}).refine(
  data => Object.keys(data).length > 0,
  "At least one field is required"
);