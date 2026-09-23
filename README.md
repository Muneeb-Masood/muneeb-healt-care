# Patient Registration API

Voice AI patient registration system for the take-home technical assessment. A caller dials a real phone number, speaks naturally with a voice agent to register as a new patient, and the record persists to a database accessible through a REST API and a simple web dashboard.

## Live Demo

- **Phone number:** +1 (513) 901-0605
- **API base URL:** https://muneeb-healt-care-production.up.railway.app
- **Dashboard:** https://muneeb-healt-care-production.up.railway.app/
- **Repository:** https://github.com/Muneeb-Masood/muneeb-healt-care

## How to Test

**Fastest way — call the number:**
1. Dial `+1 (513) 901 0605` from any phone.
2. The agent will greet you and ask for your details. You can answer one field at a time, or give several at once (e.g. "My name is John Doe, born May 20th 1990, male, phone 4155551234").
3. The agent will read everything back and ask you to confirm before saving.
4. After confirmation, the agent saves the record and confirms registration is complete.

**Verify the record was saved:**
```bash
curl https://muneeb-healt-care-production.up.railway.app/patients
```
or open the dashboard in a browser to see all registered patients in a table.

**Test the API directly (no phone call needed):**
```bash
curl -X POST https://muneeb-healt-care-production.up.railway.app/patients \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "date_of_birth": "1990-05-20",
    "sex": "Male",
    "phone_number": "4155551234",
    "address_line_1": "123 Main Street",
    "city": "San Francisco",
    "state": "CA",
    "zip_code": "94105"
  }'
```

**Test persistence across calls:** register a patient, then call again with the same phone number — the agent will detect the existing record and offer to update it instead of creating a duplicate.

## Stack

- Node.js + Express
- PostgreSQL (Supabase, via connection pooler)
- Zod for request validation
- Vapi for telephony, speech-to-text, LLM, and text-to-speech
- Railway for hosting

**Why this stack:** Vapi abstracts telephony/STT/TTS so the assessment time goes into prompt engineering, tool design, and backend correctness rather than reimplementing speech infrastructure. Supabase gives a managed Postgres instance with zero setup time. Railway deploys straight from GitHub with no manual server management, which matters since the system needs to stay live and callable independent of any local machine.

## Setup (running locally)

### 1. Install
```bash
npm install
```

### 2. Create the database
Run `schema.sql` in your Supabase SQL Editor (or any PostgreSQL client).

### 3. Environment
Copy `.env.example` to `.env` and set:
```env
PORT=3000
DATABASE_URL=your_postgres_connection_string
CORS_ORIGIN=*
NODE_ENV=development
```
Note: if using Supabase, use the **connection pooler** string (port 6543, `pooler.supabase.com` host), not the direct connection — the direct host is IPv6-only and fails to resolve on many local networks.

### 4. Run
```bash
npm run dev
```
Health check:
```
GET http://localhost:3000/health
```

## Architecture

```
Phone Call → Vapi (STT + LLM + TTS) → Tool call (POST /patients/vapi)
                                              ↓
                                     Express API → Zod validation → PostgreSQL
                                              ↓
                              GET/POST/PUT/DELETE /patients (REST API)
                                              ↓
                                    Dashboard (static HTML, fetches /patients)
```

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
- System prompt (full text in `prompt.md` in this repo) instructs the agent to: collect fields conversationally, accept multiple fields at once, handle corrections, re-prompt on invalid data, read back and get explicit confirmation before saving (once, not repeatedly), wait for the tool's actual response before announcing success or failure, and never claim to perform an action (like appointment booking) it has no tool for.

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