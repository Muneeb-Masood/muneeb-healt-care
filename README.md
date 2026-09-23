
- **Telephony/LLM layer (Vapi):** owns the conversation, decides when to call the `create_patient` tool once the caller confirms their information.
- **Data layer (`db.js`):** thin PostgreSQL wrapper, connection pooling, DATE type parsing pinned to avoid timezone shifting.
- **Validation layer (`validation.js`):** Zod schemas enforcing the required field set, formats, and enums from the spec.
- **API layer (`patientRoutes.js`):** REST endpoints plus a dedicated `/patients/vapi` webhook that unwraps Vapi's tool-call payload format and reuses the same creation/validation logic as `POST /patients`, so validation is never duplicated or bypassed by the voice agent.

## API

### Create patient
`POST /patients`
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "date_of_birth": "1990-05-20",
  "sex": "Male",
  "phone_number": "4155551234",
  "address_line_1": "123 Main Street",
  "city": "San Francisco",
  "state": "CA",
  "zip_code": "94105",
  "email": "john@example.com",
  "preferred_language": "English"
}
```

### Search patients
- `GET /patients?last_name=Doe`
- `GET /patients?date_of_birth=1990-05-20`
- `GET /patients?phone_number=4155551234`

### Get patient
`GET /patients/:id`

### Partial update
`PUT /patients/:id`
```json
{ "phone_number": "4155559999" }
```

### Soft delete
`DELETE /patients/:id`
Sets `deleted_at`; the row is never physically removed.

### Vapi tool webhook
`POST /patients/vapi`
Internal endpoint the voice agent's `create_patient` tool calls. Unwraps Vapi's `message.toolCallList[].function.arguments` payload shape, validates and saves through the same logic as `POST /patients`, and returns a message the agent can speak back to the caller (success, validation error naming the specific fields, or a duplicate-patient notice).

## Validation

- DOB must be a real date and cannot be in the future.
- Phone numbers are normalized and stored as exactly 10 digits.
- State must be a two-letter abbreviation (auto-uppercased).
- ZIP must be `12345` or `12345-6789`.
- Sex must be one of `Male`, `Female`, `Other`, `Decline to Answer` (case-insensitive input is normalized before validation, since the voice agent may say "male" rather than "Male").
- All validation happens server-side with Zod — the voice agent's own field descriptions are a courtesy for the LLM, not the source of truth.

## Response envelope

Success:
```json
{ "data": {}, "error": null }
```
Error:
```json
{
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed" }
}
```

## Vapi integration

- Assistant: "Muneeb Health Services Receptionist," GPT-5 Mini, minimal reasoning effort (cost-saver preset).
- Tool: `create_patient`, a custom function tool with a JSON schema of all 16 patient fields (9 required, matching the spec), pointed at `POST https://muneeb-healt-care-production.up.railway.app/patients/vapi`.
- System prompt (full text in `prompt.md` in this repo) instructs the agent to: collect fields conversationally, accept multiple fields at once, handle corrections, re-prompt on invalid data, read back and get explicit confirmation before saving, wait for the tool's actual response before announcing success or failure, and never claim to perform an action (like appointment booking) it has no tool for.

## Edge cases handled

- **Invalid date of birth / future DOB:** rejected by Zod, agent re-prompts for that field specifically.
- **Malformed phone/ZIP/state:** rejected with a field-specific error message the agent reads back to the caller.
- **Duplicate caller (same phone number):** the API returns a `DUPLICATE_PATIENT` error with the existing patient's name; the agent is instructed to offer updating instead of creating a new record.
- **Tool/database failure:** the agent is explicitly instructed to wait for the tool's response and never assume success — on failure it apologizes and explains rather than pretending the record was saved.
- **Caller wants to start over:** handled by the system prompt (discard collected info, restart collection).

## Known limitations / trade-offs

- No authentication or rate limiting on the API — out of scope for this take-home; a production system would need both plus audit logging and encryption for real PHI.
- No automated test suite (manual curl/browser testing only) due to the 3-hour time limit.
- Appointment scheduling, multi-language support, and call transcript storage were not implemented (bonus items); duplicate-caller detection was implemented.
- The dashboard is a minimal read-only static page, not a full admin UI.
- The voice agent occasionally needs a follow-up prompt to get a clean two-letter state abbreviation from spoken input (e.g. "California" → "CA"); the prompt explicitly handles this but it can take an extra turn.

## Security

- Secrets are stored in environment variables, never committed (`.env` is gitignored).
- All request payloads are validated server-side with Zod, independent of the voice agent.
- SQL is parameterized throughout — no string-built queries.
- Soft deletion is implemented; no data is ever hard-deleted through the API.