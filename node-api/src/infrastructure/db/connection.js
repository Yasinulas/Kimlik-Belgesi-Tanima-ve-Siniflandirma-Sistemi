const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://kyc:kyc@localhost:5432/kyc_vision";
const pool = new Pool({ connectionString: DATABASE_URL });

async function connectDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analyses (
      id SERIAL PRIMARY KEY,
      status TEXT NOT NULL,
      is_valid_document BOOLEAN NOT NULL,
      document_type TEXT,
      label TEXT,
      document_category TEXT,
      side TEXT,
      confidence REAL,
      total_detections INTEGER NOT NULL,
      detections JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS photocopy_checks (
      id SERIAL PRIMARY KEY,
      is_photocopy BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS screenshot_checks (
      id SERIAL PRIMARY KEY,
      is_screenshot BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  console.log("PostgreSQL bağlantısı kuruldu");
}

function getPool() {
  return pool;
}

module.exports = { connectDB, getPool };
