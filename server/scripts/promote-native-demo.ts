/**
 * Copy a reviewed candidate into the committed native fixture.
 * Does not change factual agent outputs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { inspectProductClearance } from "../src/arena-forge/product-clearance.js";
import { nativeDemoCandidatePath } from "../src/arena-forge/record-native-demo.js";
import {
  nativeRecordedDemoPath,
  resetNativeRecordedDemoCache,
  validateNativeRecordedDemo,
  type NativeRecordedDemo,
} from "../src/arena-forge/native-recorded-demo.js";

const from = process.argv[2] ?? nativeDemoCandidatePath();
const raw = JSON.parse(readFileSync(from, "utf8")) as NativeRecordedDemo;
const demo = validateNativeRecordedDemo(raw);
const clearance = inspectProductClearance(demo.finalMap);
if (clearance.issues.length) {
  const first = clearance.issues[0]!;
  const detail =
    first.code === "narrow-solid-gap"
      ? `${first.a} ↔ ${first.b} gap ${first.gapMeters}m`
      : `${first.solidId} ${first.side} gap ${first.gapMeters}m`;
  throw new Error(`Native demo final map has product clearance issues (${clearance.issues.length}): ${detail}.`);
}
writeFileSync(nativeRecordedDemoPath(), `${JSON.stringify(demo, null, 2)}\n`);
resetNativeRecordedDemoCache();
process.stdout.write(`promoted ${from} -> ${nativeRecordedDemoPath()}\n`);
