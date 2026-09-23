import express from "express";
import { query } from "./db.js";
import { createPatientSchema, updatePatientSchema } from "./validation.js";
import { asyncHandler } from "./middleware.js";

const router = express.Router();

const columns = `
  patient_id,
  first_name,
  last_name,
  date_of_birth,
  sex,
  phone_number,
  address_line_1,
  address_line_2,
  city,
  state,
  zip_code,
  email,
  insurance_provider,
  insurance_member_id,
  preferred_language,
  emergency_contact_name,
  emergency_contact_phone,
  created_at,
  updated_at,
  deleted_at
`;

function normalizePhone(value) {
  return value ? String(value).replace(/\D/g, "") : value;
}

function cleanPayload(body) {
  const payload = { ...body };
  if (payload.phone_number) payload.phone_number = normalizePhone(payload.phone_number);
  if (payload.emergency_contact_phone) {
    payload.emergency_contact_phone = normalizePhone(payload.emergency_contact_phone);
  }
  return payload;
}

function validationError(res, error) {
  return res.status(422).json({
    data: null,
    error: {
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: error.issues
    }
  });
}

// Shared creation logic — used by both POST /patients and the Vapi tool webhook
async function createPatientRecord(rawBody) {
  const parsed = createPatientSchema.safeParse(cleanPayload(rawBody));

  if (!parsed.success) {
    const err = new Error("Validation failed");
    err.validationIssues = parsed.error.issues;
    throw err;
  }

  const p = parsed.data;

  // Duplicate check by phone number (bonus: returning caller detection)
  const existing = await query(
    `SELECT patient_id, first_name, last_name
     FROM patients
     WHERE phone_number = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [p.phone_number]
  );

  if (existing.rowCount > 0) {
    const err = new Error("Duplicate patient");
    err.duplicate = existing.rows[0];
    throw err;
  }

  const result = await query(
    `INSERT INTO patients (
      first_name, last_name, date_of_birth, sex, phone_number,
      address_line_1, address_line_2, city, state, zip_code,
      email, insurance_provider, insurance_member_id,
      preferred_language, emergency_contact_name, emergency_contact_phone
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
    )
    RETURNING ${columns}`,
    [
      p.first_name, p.last_name, p.date_of_birth, p.sex, p.phone_number,
      p.address_line_1, p.address_line_2 ?? null, p.city, p.state, p.zip_code,
      p.email ?? null, p.insurance_provider ?? null, p.insurance_member_id ?? null,
      p.preferred_language ?? "English",
      p.emergency_contact_name ?? null, p.emergency_contact_phone ?? null
    ]
  );

  console.log("PATIENT_CREATED", {
    patient_id: result.rows[0].patient_id,
    ...p
  });

  return result.rows[0];
}

// GET /patients
router.get("/", asyncHandler(async (req, res) => {
  const { last_name, date_of_birth, phone_number } = req.query;

  const conditions = ["deleted_at IS NULL"];
  const params = [];

  if (last_name) {
    params.push(String(last_name).trim().toLowerCase());
    conditions.push(`LOWER(last_name) = $${params.length}`);
  }

  if (date_of_birth) {
    params.push(String(date_of_birth));
    conditions.push(`date_of_birth = $${params.length}`);
  }

  if (phone_number) {
    params.push(normalizePhone(phone_number));
    conditions.push(`phone_number = $${params.length}`);
  }

  const result = await query(
    `SELECT ${columns}
     FROM patients
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC`,
    params
  );

  res.status(200).json({
    data: result.rows,
    error: null
  });
}));

// GET /patients/:id
router.get("/:id", asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT ${columns}
     FROM patients
     WHERE patient_id = $1 AND deleted_at IS NULL`,
    [req.params.id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({
      data: null,
      error: {
        code: "PATIENT_NOT_FOUND",
        message: "Patient not found"
      }
    });
  }

  res.status(200).json({
    data: result.rows[0],
    error: null
  });
}));

// POST /patients
router.post("/", asyncHandler(async (req, res) => {
  try {
    const patient = await createPatientRecord(req.body);
    res.status(201).json({
      data: patient,
      error: null
    });
  } catch (err) {
    if (err.validationIssues) {
      return res.status(422).json({
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: err.validationIssues
        }
      });
    }
    if (err.duplicate) {
      return res.status(409).json({
        data: null,
        error: {
          code: "DUPLICATE_PATIENT",
          message: `A record already exists for ${err.duplicate.first_name} ${err.duplicate.last_name}`,
          patient_id: err.duplicate.patient_id
        }
      });
    }
    throw err;
  }
}));

// PUT /patients/:id
router.put("/:id", asyncHandler(async (req, res) => {
  const parsed = updatePatientSchema.safeParse(cleanPayload(req.body));

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const entries = Object.entries(parsed.data);

  const setClauses = [];
  const params = [];

  for (const [key, value] of entries) {
    params.push(value);
    setClauses.push(`${key} = $${params.length}`);
  }

  params.push(req.params.id);

  const result = await query(
    `UPDATE patients
     SET ${setClauses.join(", ")}
     WHERE patient_id = $${params.length}
       AND deleted_at IS NULL
     RETURNING ${columns}`,
    params
  );

  if (result.rowCount === 0) {
    return res.status(404).json({
      data: null,
      error: {
        code: "PATIENT_NOT_FOUND",
        message: "Patient not found"
      }
    });
  }

  res.status(200).json({
    data: result.rows[0],
    error: null
  });
}));

// DELETE /patients/:id
router.delete("/:id", asyncHandler(async (req, res) => {
  const result = await query(
    `UPDATE patients
     SET deleted_at = NOW()
     WHERE patient_id = $1
       AND deleted_at IS NULL
     RETURNING patient_id, deleted_at`,
    [req.params.id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({
      data: null,
      error: {
        code: "PATIENT_NOT_FOUND",
        message: "Patient not found"
      }
    });
  }

  res.status(200).json({
    data: result.rows[0],
    error: null
  });
}));

// POST /vapi — webhook for Vapi tool calls
router.post("/vapi", asyncHandler(async (req, res) => {
  console.log("VAPI_WEBHOOK", JSON.stringify(req.body, null, 2));

  const toolCalls = req.body.message?.toolCallList || [];
  const results = [];

  for (const call of toolCalls) {
    try {
      const patient = await createPatientRecord(call.arguments);
      results.push({
        toolCallId: call.id,
        result: `Patient registered successfully. ${patient.first_name} ${patient.last_name}, patient ID ${patient.patient_id}.`
      });
    } catch (err) {
      if (err.validationIssues) {
        const fields = err.validationIssues.map(i => i.path.join(".")).join(", ");
        results.push({
          toolCallId: call.id,
          result: `Some information was invalid or missing: ${fields}. Please ask the caller to repeat or correct these fields.`
        });
      } else if (err.duplicate) {
        results.push({
          toolCallId: call.id,
          result: `A record already exists for ${err.duplicate.first_name} ${err.duplicate.last_name} with this phone number. Ask the caller if they would like to update their existing information instead.`
        });
      } else {
        console.error("VAPI_TOOL_ERROR", err);
        results.push({
          toolCallId: call.id,
          result: "There was a problem saving the patient record. Please let the caller know we are having a technical issue and to try again shortly."
        });
      }
    }
  }

  res.status(200).json({ results });
}));

export default router;