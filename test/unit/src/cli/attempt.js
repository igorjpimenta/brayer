import test from "node:test";
import assert from "node:assert/strict";
import { withStore } from "../../../helpers/store.js";
import { runningAttempt } from "../../../helpers/fixtures.js";
import { runAttempt } from "../../../../src/cli/attempt.js";

test("attempt running resolves the running attempt by session ref", () => withStore(async (store, _dir, dbPath) => {
  const env = { BRAYER_DB: dbPath };
  const { attempt } = runningAttempt(store);

  const found = await runAttempt({ rest: ["running", "--session", "s1"], env });
  assert.equal(found.id, attempt.id);

  const missing = await runAttempt({ rest: ["running", "--session", "ses_other"], env });
  assert.equal(missing, null);

  await assert.rejects(() => runAttempt({ rest: ["running"], env }), /--session/);
}));

test("attempt running ignores finished attempts", () => withStore(async (store, _dir, dbPath) => {
  const env = { BRAYER_DB: dbPath };
  const { attempt } = runningAttempt(store);
  await store.attempt.finish({ attemptId: attempt.id, status: "finished", summary: "done" });
  const none = await runAttempt({ rest: ["running", "--session", "s1"], env });
  assert.equal(none, null);
}));
