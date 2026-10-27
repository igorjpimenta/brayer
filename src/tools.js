import * as z from "zod/v4-mini";
import { identityKey } from "./identity.js";
import { storeFile } from "./evidence.js";

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
    {
      name: "brayer_checkpoint_write",
      description:
        "Write the structured handoff for a running attempt. The state is an object, not a transcript; treeHash pins the workspace the state describes.",
      shape: {
        ...identityShape,
        orderId: z.string(),
        attemptId: z.string(),
        kind: z.optional(z.enum(["auto", "manual", "pre_compact", "stop", "error"])),
        goal: z.optional(z.string()),
        state: z.unknown(),
        summary: z.optional(z.string()),
        confidence: z.optional(z.number()),
        resumeRecipe: z.optional(z.string()),
        treeHash: z.string(),
      },
    },
    {
      name: "brayer_checkpoint_get",
      description:
        "Read a checkpoint by id, or the latest checkpoint for an order. Read-only.",
      shape: {
        ...identityShape,
        checkpointId: z.optional(z.string()),
        orderId: z.optional(z.string()),
      },
    },
    {
      name: "brayer_evidence_attach",
      description:
        "Attach typed evidence to a running attempt. Pass a local path and Brayer stores a content-addressed blob; or pass uri + sha256 for an existing blob.",
      shape: {
        ...identityShape,
        orderId: z.string(),
        attemptId: z.string(),
        kind: z.enum(["diff", "test", "lint", "screenshot", "artifact", "log"]),
        path: z.optional(z.string()),
        uri: z.optional(z.string()),
        sha256: z.optional(z.string()),
        summary: z.optional(z.string()),
        command: z.optional(z.string()),
        exitCode: z.optional(z.int()),
        status: z.optional(z.string()),
        verifier: z.optional(z.string()),
      },
    },
    {
      name: "brayer_evidence_list",
      description: "List evidence for an order or an attempt. Read-only.",
      shape: {
        ...identityShape,
        orderId: z.optional(z.string()),
        attemptId: z.optional(z.string()),
      },
    },
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
      case "brayer_attempt_start": {
        return store.attempt.start({
          workOrderId: args.orderId,
          harness: identity.harness,
          agent: identityKey(identity),
          sessionRef: identity.session,
          model: args.model ?? null,
        });
      }
      case "brayer_attempt_finish": {
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
      }
      case "brayer_attempt_get": {
        const attempt = store.attempt.get(args.attemptId);
        if (!attempt) throw new Error(`attempt not found: ${args.attemptId}`);
        return { attempt };
      }
      case "brayer_checkpoint_write": {
        const checkpoint = store.checkpoint.write({
          workOrderId: args.orderId,
          attemptId: args.attemptId,
          kind: args.kind ?? "manual",
          goal: args.goal ?? null,
          state: args.state,
          summary: args.summary ?? null,
          confidence: args.confidence ?? null,
          resumeRecipe: args.resumeRecipe ?? null,
          treeHash: args.treeHash,
          actor: identityKey(identity),
        });
        return { checkpoint };
      }
      case "brayer_checkpoint_get": {
        if (args.checkpointId) {
          const checkpoint = store.checkpoint.get(args.checkpointId);
          if (!checkpoint) throw new Error(`checkpoint not found: ${args.checkpointId}`);
          return { checkpoint };
        }
        if (!args.orderId) throw new Error("checkpointId or orderId is required");
        return { checkpoint: store.checkpoint.latest({ workOrderId: args.orderId }) };
      }
      case "brayer_evidence_attach": {
        let uri = args.uri;
        let sha256 = args.sha256;
        if (args.path) {
          const stored = storeFile({ root: store.config.blobsPath, filePath: args.path });
          uri = stored.uri;
          sha256 = stored.sha256;
        }
        if (!uri || !sha256) throw new Error("path or uri + sha256 is required");
        const evidence = store.evidence.attach({
          workOrderId: args.orderId,
          attemptId: args.attemptId,
          kind: args.kind,
          uri,
          sha256,
          summary: args.summary ?? null,
          command: args.command ?? null,
          exitCode: args.exitCode ?? null,
          status: args.status ?? null,
          verifier: args.verifier ?? null,
          actor: identityKey(identity),
        });
        return { evidence };
      }
      case "brayer_evidence_list": {
        if (!args.orderId && !args.attemptId) throw new Error("orderId or attemptId is required");
        return { evidence: store.evidence.list({ workOrderId: args.orderId, attemptId: args.attemptId }) };
      }
      case "brayer_verdict_issue": {
        return store.verdict.issue({
          workOrderId: args.orderId,
          attemptId: args.attemptId ?? null,
          decision: args.decision,
          reason: args.reason ?? null,
          policy: args.policy ?? null,
          evidenceIds: args.evidenceIds ?? null,
          actor: identityKey(identity),
        });
      }
      case "brayer_verdict_list": {
        return { verdicts: store.verdict.list({ workOrderId: args.orderId }) };
      }
      case "brayer_order_resume": {
        return store.resume.resume({
          workOrderId: args.orderId,
          reason: args.reason ?? "resumed",
          actor: identityKey(identity),
        });
      }
      case "brayer_order_get": {
        const order = store.order.get(args.orderId);
        if (!order) throw new Error(`order not found: ${args.orderId}`);
        return {
          order,
          events: store.event.list({ workOrderId: order.id }),
          checkpoint: store.checkpoint.latest({ workOrderId: order.id }),
          evidence: store.evidence.list({ workOrderId: order.id }),
          verdicts: store.verdict.list({ workOrderId: order.id }),
        };
      }
      default:
        throw new Error(`unknown tool: ${name}`);
    }
  }

  return { TOOL_DEFS, handle };
}

export { json };
