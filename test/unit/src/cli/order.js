import test from "node:test";
import assert from "node:assert/strict";
import { withStore } from "../../../helpers/store.js";
import { readyOrder } from "../../../helpers/fixtures.js";
import { runOrder } from "../../../../src/cli/order.js";

test("order ready lists ready orders bounded by --limit", () => withStore(async (store, _dir, dbPath) => {
  const env = { BRAYER_DB: dbPath };
  readyOrder(store, { title: "low", priority: 10 });
  readyOrder(store, { title: "high", priority: 90 });
  readyOrder(store, { title: "mid", priority: 50 });

  const orders = await runOrder({ rest: ["ready", "--limit", "2"], env });
  assert.equal(orders.length, 2);
  assert.deepEqual(orders.map((o) => o.title), ["high", "mid"]);

  const everything = await runOrder({ rest: ["ready"], env });
  assert.equal(everything.length, 3);

  const claimed = readyOrder(store, { title: "gone" });
  store.claim.claimById({ id: claimed.id, agentId: "claude:worker:s1" });
  const after = await runOrder({ rest: ["ready"], env });
  assert.equal(after.length, 3);

  await assert.rejects(() => runOrder({ rest: ["ready", "--limit", "0"], env }), /--limit/);
}));
