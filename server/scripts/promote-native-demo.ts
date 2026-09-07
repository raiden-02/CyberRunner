/**
 * Copy a reviewed candidate into the committed native fixture.
 * Does not change factual agent outputs.
 */
import { readFileSync, writeFileSync } from "node:fs";
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
writeFileSync(nativeRecordedDemoPath(), `${JSON.stringify(demo, null, 2)}\n`);
resetNativeRecordedDemoCache();
process.stdout.write(`promoted ${from} -> ${nativeRecordedDemoPath()}\n`);
