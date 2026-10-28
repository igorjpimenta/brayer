import { attemptDefs, attemptHandlers } from "./attempts.js";
import { handoffDefs, handoffHandlers } from "./handoff.js";
import { orderDefs, orderHandlers } from "./orders.js";
import { verdictDefs, verdictHandlers } from "./verdicts.js";

const TOOL_DEFS = [
  ...orderDefs,
  ...attemptDefs,
  ...handoffDefs,
  ...verdictDefs,
];

const HANDLERS = {
  ...orderHandlers,
  ...attemptHandlers,
  ...handoffHandlers,
  ...verdictHandlers,
};

export function createToolHandlers(store) {
  async function handle(name, args, identity) {
    if (!Object.hasOwn(HANDLERS, name)) throw new Error(`unknown tool: ${name}`);
    const handler = HANDLERS[name];
    return handler({ store, args, identity });
  }

  return { TOOL_DEFS, handle };
}
