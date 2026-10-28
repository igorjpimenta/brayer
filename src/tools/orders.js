import * as z from "zod/v4-mini";
import { identityKey } from "../identity.js";
import { identityShape } from "./shared.js";

export const orderDefs = [
  {
    name: "brayer_order_create",
    description:
      "Create a work order. The acceptance criteria are required: a worker must be able to verify completion without reading the planner's transcript.",
    shape: {
      ...identityShape,
      title: z.string(),
      goal: z.string(),
      acceptance: z.string(),
      constraints: z.optional(z.string()),
      workspace: z.optional(z.string()),
      repo: z.optional(z.string()),
      branch: z.optional(z.string()),
      priority: z.optional(z.int()),
      status: z.optional(z.enum(["draft", "ready"])),
      budgetTokens: z.optional(z.int()),
      budgetUsd: z.optional(z.number()),
      modelPolicy: z.optional(z.unknown()),
      approvalMode: z.optional(z.enum(["auto", "evidence", "human"])),
      parentId: z.optional(z.string()),
    },
  },
  {
    name: "brayer_order_next",
    description:
      "Atomically claim the highest-priority ready order for this agent. A race loser gets an empty result, never a partial claim.",
    shape: {
      ...identityShape,
      leaseSeconds: z.optional(z.int()),
    },
  },
  {
    name: "brayer_order_claim",
    description:
      "Atomically claim one ready order by id. The order must be ready and unassigned, or assigned to this agent.",
    shape: {
      ...identityShape,
      orderId: z.string(),
      leaseSeconds: z.optional(z.int()),
    },
  },
  {
    name: "brayer_order_heartbeat",
    description:
      "Renew the lease on an order this agent holds. Returns null when the lease is no longer held.",
    shape: {
      ...identityShape,
      orderId: z.string(),
      leaseSeconds: z.optional(z.int()),
    },
  },
  {
    name: "brayer_order_resume",
    description:
      "Resume a rejected or blocked order. Returns the order and its latest checkpoint so the next attempt can continue without a re-brief.",
    shape: {
      ...identityShape,
      orderId: z.string(),
      reason: z.optional(z.string()),
    },
  },
  {
    name: "brayer_order_get",
    description:
      "Read a work order and its event trail. Read-only: it never claims, starts an attempt or changes state.",
    shape: {
      ...identityShape,
      orderId: z.string(),
    },
  },
];

export const orderHandlers = {
  brayer_order_create({ store, args, identity }) {
    const order = store.order.create({
      title: args.title,
      goal: args.goal,
      acceptance: args.acceptance,
      constraints: args.constraints ?? null,
      workspace: args.workspace ?? null,
      repo: args.repo ?? null,
      branch: args.branch ?? null,
      priority: args.priority ?? 50,
      status: args.status ?? "draft",
      budgetTokens: args.budgetTokens ?? null,
      budgetUsd: args.budgetUsd ?? null,
      modelPolicy: args.modelPolicy ?? null,
      approvalMode: args.approvalMode ?? "human",
      parentId: args.parentId ?? null,
      actor: identityKey(identity),
    });
    return { order };
  },

  brayer_order_next({ store, args, identity }) {
    return store.claim.claimNext({
      agentId: identityKey(identity),
      sessionRef: identity.session,
      leaseSeconds: args.leaseSeconds,
    });
  },

  brayer_order_claim({ store, args, identity }) {
    return store.claim.claimById({
      id: args.orderId,
      agentId: identityKey(identity),
      sessionRef: identity.session,
      leaseSeconds: args.leaseSeconds,
    });
  },

  brayer_order_heartbeat({ store, args, identity }) {
    const order = store.claim.heartbeat({
      id: args.orderId,
      agentId: identityKey(identity),
      sessionRef: identity.session,
      leaseSeconds: args.leaseSeconds,
    });
    return { order };
  },

  brayer_order_resume({ store, args, identity }) {
    return store.resume.resume({
      workOrderId: args.orderId,
      reason: args.reason ?? "resumed",
      actor: identityKey(identity),
    });
  },

  brayer_order_get({ store, args }) {
    const order = store.order.get(args.orderId);
    if (!order) throw new Error(`order not found: ${args.orderId}`);
    return {
      order,
      events: store.event.list({ workOrderId: order.id }),
      checkpoint: store.checkpoint.latest({ workOrderId: order.id }),
      evidence: store.evidence.list({ workOrderId: order.id }),
      verdicts: store.verdict.list({ workOrderId: order.id }),
    };
  },
};
