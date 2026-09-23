# Patient Registration API

REST API for the Voice AI Patient Registration assessment.

## Stack

- Node.js
- Express
- PostgreSQL / Supabase
- Zod
- REST API

## Setup

### 1. Install

```bash
npm install
```

### 2. Create PostgreSQL database

Run `schema.sql` in your Supabase SQL Editor or PostgreSQL client.

### 3. Environment

Copy `.env.example` to `.env` and set:

```env
PORT=3000
DATABASE_URL=your_postgres_connection_string
CORS_ORIGIN=*
NODE_ENV=development
```

### 4. Run

```bash
npm run dev
```

or:

```bash
npm start
```

Health check:

```text
GET http://localhost:3000/health
```

## API

### Create patient

`POST /patients`

Example:

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

`GET /patients?last_name=Doe`

`GET /patients?date_of_birth=1990-05-20`

`GET /patients?phone_number=4155551234`

### Get patient

`GET /patients/:id`

### Partial update

`PUT /patients/:id`

```json
{
  "phone_number": "4155559999"
}
```

### Soft delete

`DELETE /patients/:id`

This sets `deleted_at` and does not physically remove the row.

## Validation

- DOB must be a real date and cannot be in the future.
- Phone numbers are stored as exactly 10 digits.
- State must be a two-letter abbreviation.
- ZIP must be `12345` or `12345-6789`.
- Sex is one of:
  - Male
  - Female
  - Other
  - Decline to Answer

## Response envelope

Success:

```json
{
  "data": {},
  "error": null
}
```

Error:

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed"
  }
}
```

## Vapi integration

Create a Vapi custom function/tool named `create_patient`.

Configure it to call:

```text
POST https://YOUR_DEPLOYED_API/patients
```

The tool body should contain the patient fields from the POST example.

The assistant should only call the tool after the caller explicitly confirms the read-back information.

## Security / limitations

- Secrets are stored in environment variables.
- Request payloads are validated with Zod.
- SQL uses parameterized queries.
- Soft deletion is implemented.
- Authentication/rate limiting are not included because they were not required for the take-home scope.
- For production healthcare use, additional security, access control, audit logging, encryption and compliance controls would be required.
