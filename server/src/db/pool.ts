import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn("[DB] DATABASE_URL not set - database features disabled");
}

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

export async function query(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<any>> {
  if (!pool) {
    throw new Error("Database not configured");
  }
  return pool.query(text, params);
}

export async function getClient(): Promise<pg.PoolClient> {
  if (!pool) {
    throw new Error("Database not configured");
  }
  return pool.connect();
}

export function isDatabaseEnabled(): boolean {
  return pool !== null;
}
