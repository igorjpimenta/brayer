import * as z from "zod/v4-mini";
import { identityKey } from "../identity.js";
import { identityShape } from "./shared.js";

export const verdictDefs = [
  {
    name: "brayer_verdict_issue",
    description:
      "Record a verdict on an order in review or blocked. Approve requires at least one evidence row; escalate blocks the order; rollback returns it to the queue.",
    shape: {
      ...identityShape,
      orderId: z.string(),
      attemptId: z.optional(z.string()),
      decision: z.enum(["approve", "reject", "escalate", "rollback"]),
      reason: z.optional(z.string()),
      policy: z.optional(z.string()),
      evidenceIds: z.optional(z.array(z.string())),
    },
  },
  {
    name: "brayer_verdict_list",
    description: "List verdicts for an order. Read-only.",
    shape: {
      ...identityShape,
      orderId: z.string(),
    },
  },
];

export const verdictHandlers = {
  brayer_verdict_issue({ store, args, identity }) {
    return store.verdict.issue({
      workOrderId: args.orderId,
      attemptId: args.attemptId ?? null,
      decision: args.decision,
      reason: args.reason ?? null,
      policy: args.policy ?? null,
      evidenceIds: args.evidenceIds ?? null,
      actor: identityKey(identity),
    });
  },

  brayer_verdict_list({ store, args }) {
    return { verdicts: store.verdict.list({ workOrderId: args.orderId }) };
  },
};
