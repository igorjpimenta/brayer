import * as z from "zod/v4-mini";
import { identityKey } from "../identity.js";
import { identityShape } from "./shared.js";

export const attemptDefs = [
  {
    name: "brayer_attempt_start",
    description:
      "Open an attempt on an order this agent holds. One live attempt per order; the order moves claimed → running.",
    shape: {
      ...identityShape,
      orderId: z.string(),
      model: z.optional(z.string()),
    },
  },
  {
    name: "brayer_attempt_finish",
    description:
      "Close a running attempt. finished moves the order to review; failed returns it to the ready queue.",
    shape: {
      ...identityShape,
      attemptId: z.string(),
      status: z.enum(["finished", "failed"]),
      summary: z.optional(z.string()),
      tokensIn: z.optional(z.int()),
      tokensOut: z.optional(z.int()),
      cacheRead: z.optional(z.int()),
      costUsd: z.optional(z.number()),
      toolCalls: z.optional(z.int()),
      error: z.optional(z.string()),
      checkpointId: z.optional(z.string()),
    },
  },
  {
    name: "brayer_attempt_get",
    description: "Read one attempt. Read-only.",
    shape: {
      ...identityShape,
      attemptId: z.string(),
    },
  },
];

export const attemptHandlers = {
  brayer_attempt_start({ store, args, identity }) {
    return store.attempt.start({
      workOrderId: args.orderId,
      harness: identity.harness,
      agent: identityKey(identity),
      sessionRef: identity.session,
      model: args.model ?? null,
    });
  },

  brayer_attempt_finish({ store, args }) {
    return store.attempt.finish({
      attemptId: args.attemptId,
      status: args.status,
      summary: args.summary ?? null,
      tokensIn: args.tokensIn ?? 0,
      tokensOut: args.tokensOut ?? 0,
      cacheRead: args.cacheRead ?? 0,
      costUsd: args.costUsd ?? 0,
      toolCalls: args.toolCalls ?? 0,
      error: args.error ?? null,
      checkpointId: args.checkpointId ?? null,
    });
  },

  brayer_attempt_get({ store, args }) {
    const attempt = store.attempt.get(args.attemptId);
    if (!attempt) throw new Error(`attempt not found: ${args.attemptId}`);
    return { attempt };
  },
};
