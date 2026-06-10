import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { beforeAll, afterAll } from "vitest";

// Create isolated test directory before any server module loads.
// The top-level env assignments run during setup-file evaluation,
// which vitest guarantees happens before the test file begins.
const TEST_DIR = path.join(
  os.tmpdir(),
  `akari-test-${randomUUID().slice(0, 8)}`
);
process.env.AKARI_DATA_DIR = TEST_DIR;
process.env.AKARI_TEST = "1";

beforeAll(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});
