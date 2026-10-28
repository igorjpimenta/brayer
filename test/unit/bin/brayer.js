import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { VERSION } from "../../../src/version.js";

const bin = fileURLToPath(new URL("../../../bin/brayer.js", import.meta.url));

test("version flag prints the package version", () => {
  const out = execFileSync(process.execPath, [bin, "--version"], { encoding: "utf8" }).trim();
  assert.equal(out, VERSION);
});

test("no command prints usage", () => {
  const out = execFileSync(process.execPath, [bin], { encoding: "utf8" });
  assert.match(out, /Usage:/);
});
