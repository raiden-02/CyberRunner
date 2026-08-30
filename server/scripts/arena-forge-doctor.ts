import { config } from "dotenv";
import { resolve } from "node:path";
import { buildForgeDoctorReport } from "../src/arena-forge/forge-doctor.js";

config({ path: resolve(import.meta.dirname, "../.env") });

const report = buildForgeDoctorReport(process.env, {
  databaseAvailable: Boolean(process.env.DATABASE_URL?.trim()),
});

console.log(report.lines.join("\n"));
process.exit(report.ok ? 0 : 1);
