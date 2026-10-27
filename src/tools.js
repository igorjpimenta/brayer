import * as z from "zod/v4-mini";
import { identityKey } from "./identity.js";

const identityShape = {
  brayer_agent: z.optional(z.string()),
  brayer_session: z.optional(z.string()),
  _meta: z.optional(z.unknown()),
};

function json(value) {
  return JSON.stringify(value);
}

export function createToolHandlers(store) {
  const TOOL_DEFS = [
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
        winchTaskId: z.optional(z.string()),
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
      name: "brayer_order_get",
      description:
        "Read a work order and its event trail. Read-only: it never claims, starts an attempt or changes state.",
      shape: {
        ...identityShape,
        orderId: z.string(),
      },
    },
  ];

  async function handle(name, args, identity) {
    switch (name) {
      case "brayer_order_create": {
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
          winchTaskId: args.winchTaskId ?? null,
          actor: identityKey(identity),
        });
        return { order };
      }
      case "brayer_order_next": {
        const res = store.claim.claimNext({
          agentId: identityKey(identity),
          sessionRef: identity.session,
          leaseSeconds: args.leaseSeconds,
        });
        return res;
      }
      case "brayer_order_claim": {
        const res = store.claim.claimById({
          id: args.orderId,
          agentId: identityKey(identity),
          sessionRef: identity.session,
          leaseSeconds: args.leaseSeconds,
        });
        return res;
      }
      case "brayer_order_heartbeat": {
        const order = store.claim.heartbeat({
          id: args.orderId,
          agentId: identityKey(identity),
          sessionRef: identity.session,
          leaseSeconds: args.leaseSeconds,
        });
        return { order };
      }
      case "brayer_order_get": {
        const order = store.order.get(args.orderId);
        if (!order) throw new Error(`order not found: ${args.orderId}`);
        return { order, events: store.event.list({ workOrderId: order.id }) };
      }
      default:
        throw new Error(`unknown tool: ${name}`);
    }
  }

  return { TOOL_DEFS, handle };
}

export { json };
