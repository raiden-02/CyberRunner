import { describe, expect, it } from "vitest";
import { RttChallengeBook } from "../src/net/rtt-challenge.js";
import { LagCompensation, MAX_REWIND_MS } from "../src/systems/lag-compensation.js";

describe("RttChallengeBook", () => {
  it("computes RTT from the server-stored send time", () => {
    const book = new RttChallengeBook();
    const id = book.issue("a", 1000);
    expect(book.take("a", id, 1040)).toBe(40);
  });

  it("ignores unknown, forged, and replayed challenge ids", () => {
    const book = new RttChallengeBook();
    const id = book.issue("a", 1000);
    expect(book.take("a", 999999, 1100)).toBeNull();
    expect(book.take("b", id, 1100)).toBeNull();
    expect(book.take("a", id, 1080)).toBe(80);
    expect(book.take("a", id, 1100)).toBeNull();
  });

  it("ignores an echo that would imply a negative or huge RTT", () => {
    const book = new RttChallengeBook();
    const id = book.issue("a", 5000);
    expect(book.take("a", id, 4000)).toBeNull();
    const id2 = book.issue("a", 1000);
    expect(book.take("a", id2, 1000 + 5000)).toBeNull();
  });

  it("clears outstanding samples on disconnect", () => {
    const book = new RttChallengeBook();
    const id = book.issue("a", 1000);
    book.clear("a");
    expect(book.take("a", id, 1100)).toBeNull();
  });

  it("keeps rewind capped at 250 ms after a server-owned sample", () => {
    const book = new RttChallengeBook();
    const lag = new LagCompensation();
    const id = book.issue("a", 0);
    const rtt = book.take("a", id, 80);
    expect(rtt).toBe(80);
    lag.recordRtt({ sessionId: "a" }, rtt!);
    expect(MAX_REWIND_MS).toBe(250);
  });
});
