// dev-link-self.mjs — npm test pretest. The plugin packages import the shared
// formatter through "@igorjpimenta/brayer/plugins/shared/...", which resolves
// inside an installed layout via the declared dependency, but in this repo the
// importing files sit in a nested package scope, so Node cannot self-reference
// the root package. A dev-only symlink at node_modules/@igorjpimenta/brayer
// points back at the repo root to make the specifier resolve for tests.
import { mkdirSync, symlinkSync, existsSync, readlinkSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const link = path.join(root, "node_modules", "@igorjpimenta", "brayer");

if (existsSync(link)) {
  try {
    if (readlinkSync(link) === "../..") process.exit(0);
  } catch {}
  rmSync(link);
}
mkdirSync(path.dirname(link), { recursive: true });
symlinkSync("../..", link, "dir");
