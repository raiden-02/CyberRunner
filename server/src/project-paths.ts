import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// tsx runs from server/src, tsc emits to server/dist/server/src. A fixed
// "../.." from a module directory therefore lands in two different places,
// so walk up to the checkout root instead.
export function findProjectRoot(from: string): string {
  let dir = from;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, "client")) && fs.existsSync(path.join(dir, "server"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export const PROJECT_ROOT = findProjectRoot(path.dirname(fileURLToPath(import.meta.url)));
export const SERVER_DIR = path.join(PROJECT_ROOT, "server");
