import { createBrayerHooks } from "./hooks.js";
import { setupBrayer } from "./v2.js";

export async function BrayerPlugin() {
  return createBrayerHooks();
}

// One package, two runtimes: V1 calls server() and uses the returned hooks;
// V2 reads id and setup() and registers on the context. Each entry stays on its
// own API — sharing the export does not translate one into the other.
export default { id: "brayer", setup: setupBrayer, server: BrayerPlugin };
