import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import patientRoutes from "./patientRoutes.js";
import { notFound, errorHandler } from "./middleware.js";
import { query } from "./db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.CORS_ORIGIN || "*"
}));

app.use(express.json({ limit: "100kb" }));
app.use(express.static("public"));

app.get("/health", async (req, res) => {
  try {
    await query("SELECT 1");
    res.status(200).json({
      data: {
        status: "ok",
        database: "connected"
      },
      error: null
    });
  } catch (err) {
    console.error("Health check DB error:", err);
    res.status(500).json({
      data: null,
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "Database unavailable"
      }
    });
  }
});

app.use("/patients", patientRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Patient API running on port ${PORT}`);
});