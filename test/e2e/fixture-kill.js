import { createStore } from "../../src/store.js";
import { attachSession, checkpointSession } from "../../plugins/shared/contract.js";

const harness = process.env.BRAYER_TEST_HARNESS;
const orderId = process.env.BRAYER_TEST_ORDER;
const session = { harness, agent: "worker", session: "s1" };

const store = createStore({ dbPath: process.env.BRAYER_DB });
const attached = attachSession({ store, session, orderId });
checkpointSession({
  store,
  session,
  orderId,
  attemptId: attached.attempt.id,
  trigger: "idle",
  state: { next_step: "continue" },
  treeHash: "e2e-tree",
  summary: "killed after checkpoint",
});

process.exit(0);
