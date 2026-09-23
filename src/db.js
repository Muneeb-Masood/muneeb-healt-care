import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

// Prevent pg from converting DATE columns to JS Date objects
// (avoids timezone shift bugs — keep date_of_birth as plain "YYYY-MM-DD" string)
pg.types.setTypeParser(1082, (val) => val);

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function query(text, params = []) {
  return pool.query(text, params);
}