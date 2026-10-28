import * as z from "zod/v4-mini";
import { storeFile } from "../evidence.js";
import { identityKey } from "../identity.js";
import { identityShape } from "./shared.js";

export const handoffDefs = [
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
];

export const handoffHandlers = {
  brayer_checkpoint_write({ store, args, identity }) {
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
  },

  brayer_checkpoint_get({ store, args }) {
    if (args.checkpointId) {
      const checkpoint = store.checkpoint.get(args.checkpointId);
      if (!checkpoint) throw new Error(`checkpoint not found: ${args.checkpointId}`);
      return { checkpoint };
    }
    if (!args.orderId) throw new Error("checkpointId or orderId is required");
    return { checkpoint: store.checkpoint.latest({ workOrderId: args.orderId }) };
  },

  brayer_evidence_attach({ store, args, identity }) {
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
  },

  brayer_evidence_list({ store, args }) {
    if (!args.orderId && !args.attemptId) throw new Error("orderId or attemptId is required");
    return { evidence: store.evidence.list({ workOrderId: args.orderId, attemptId: args.attemptId }) };
  },
};
