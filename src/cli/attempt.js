import { createStore } from "../store.js";
import { flagMap } from "./args.js";

export async function runAttempt({ rest = [], env = process.env, logger = console } = {}) {
  const [sub, ...attemptArgs] = rest;
  const values = flagMap(attemptArgs);
  const store = createStore({ dbPath: env.BRAYER_DB || undefined });
  try {
    if (sub === "running") {
      if (!values.session) throw new Error("brayer: attempt running requires --session");
      const attempt = store.attempt.forSession(values.session);
      console.log(JSON.stringify({ attempt }, null, 2));
      return attempt;
    }

    throw new Error("brayer: attempt requires running");
  } finally {
    store.close();
  }
}
