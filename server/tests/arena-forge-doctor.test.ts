import { describe, expect, it } from "vitest";
import { buildForgeDoctorReport } from "../src/arena-forge/forge-doctor.js";

describe("forge doctor", () => {
  it("reports ready self-host OpenAI without printing the key", () => {
    const report = buildForgeDoctorReport(
      {
        ARENA_FORGE_ACCESS_MODE: "self_host",
        ARENA_FORGE_LIVE_AGENT_ENABLED: "true",
        ARENA_FORGE_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-secret-should-never-print",
      },
      { databaseAvailable: false },
    );
    expect(report.ok).toBe(true);
    const text = report.lines.join("\n");
    expect(text).toMatch(/Access mode: self_host/);
    expect(text).toMatch(/Provider: OpenAI/);
    expect(text).toMatch(/Model: gpt-5\.6/);
    expect(text).toMatch(/Provider key: configured/);
    expect(text).toMatch(/Database: not required/);
    expect(text).toMatch(/Live flag: enabled/);
    expect(text).toMatch(/Live design configuration is ready/);
    expect(text).not.toMatch(/sk-secret-should-never-print/);
    expect(text).not.toMatch(/sk-secret/);
  });

  it("fails when Anthropic is selected without its key", () => {
    const report = buildForgeDoctorReport(
      {
        ARENA_FORGE_ACCESS_MODE: "self_host",
        ARENA_FORGE_LIVE_AGENT_ENABLED: "true",
        ARENA_FORGE_PROVIDER: "anthropic",
        OPENAI_API_KEY: "sk-other-provider",
      },
      { databaseAvailable: false },
    );
    expect(report.ok).toBe(false);
    expect(report.lines.join("\n")).toMatch(
      /Provider is anthropic but ANTHROPIC_API_KEY is not configured/,
    );
    expect(report.lines.join("\n")).not.toMatch(/sk-other-provider/);
  });

  it("fails when the live flag is off", () => {
    const report = buildForgeDoctorReport(
      {
        ARENA_FORGE_ACCESS_MODE: "self_host",
        OPENAI_API_KEY: "test-placeholder",
      },
      { databaseAvailable: false },
    );
    expect(report.ok).toBe(false);
    expect(report.lines.at(-1)).toBe("Live flag is disabled.");
  });

  it("fails hosted mode without a database", () => {
    const report = buildForgeDoctorReport(
      {
        ARENA_FORGE_LIVE_AGENT_ENABLED: "true",
        ARENA_FORGE_PROVIDER: "openai",
        OPENAI_API_KEY: "test-placeholder",
      },
      { databaseAvailable: false },
    );
    expect(report.ok).toBe(false);
    const text = report.lines.join("\n");
    expect(text).toMatch(/Access mode: hosted/);
    expect(text).toMatch(/Database: missing/);
    expect(text).toMatch(/Quota: required/);
    expect(text).toMatch(/Hosted mode requires database-backed quota storage/);
  });

  it("reports ready hosted Anthropic when the database is present", () => {
    const report = buildForgeDoctorReport(
      {
        ARENA_FORGE_LIVE_AGENT_ENABLED: "true",
        ARENA_FORGE_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "sk-ant-secret-should-never-print",
      },
      { databaseAvailable: true },
    );
    expect(report.ok).toBe(true);
    const text = report.lines.join("\n");
    expect(text).toMatch(/Provider: Anthropic/);
    expect(text).toMatch(/Model: claude-sonnet-5/);
    expect(text).toMatch(/Database: configured/);
    expect(text).not.toMatch(/sk-ant-secret-should-never-print/);
  });
});
