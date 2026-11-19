import { openDatabase } from "./db.js";
import { resolveConfig } from "./config.js";
import { createEventApi } from "./store/events.js";
import { createOrderApi } from "./store/orders.js";
import { createClaimApi } from "./store/claims.js";
import { createWebhookApi } from "./store/webhooks.js";
import { claimPayload, notifyClaim, webhookConfig } from "./claim-webhook.js";
import { createAttemptApi } from "./store/attempts.js";
import { createCheckpointApi } from "./store/checkpoints.js";
import { createEvidenceApi } from "./store/evidence.js";
import { createVerdictApi } from "./store/verdicts.js";
import { createResumeApi } from "./store/resume.js";
import { createAdoptionApi } from "./store/adoption.js";

export function createStore({ dbPath, logger, config } = {}) {
  const cfg = resolveConfig({ explicit: config ?? {} });
  const finalPath = dbPath || cfg.dbPath;
  const { sqlite: db } = openDatabase({ dbPath: finalPath, logger });

  const { insertEvent, eventApi } = createEventApi({ db });
  const order = createOrderApi({ db, insertEvent });
  const webhook = createWebhookApi({ db });
  const claim = createClaimApi({
    db,
    cfg,
    insertEvent,
    orderApi: order,
    logger,
    claimGate: (harness) => {
      if (webhookConfig(cfg, harness, webhook.get(harness))) return;
      throw new Error(
        `brayer: harness "${harness}" has no claim wake route — a claimed order could never be delivered. ` +
        `Register one: brayer webhook set --harness ${harness} --url <wake-url> [--bearer], ` +
        `or set BRAYER_CLAIM_WEBHOOKS / BRAYER_CLAIM_WEBHOOK_URL.`
      );
    },
    notifyClaim: (payload) => {
      const body = claimPayload(payload);
      return notifyClaim(cfg, body, { logger, dbEntry: webhook.get(body.session.harness) });
    },
  });
  claim.startup?.();
  const attempt = createAttemptApi({ db, cfg, insertEvent, orderApi: order, clearExpiry: claim.clearExpiry });
  const checkpoint = createCheckpointApi({ db, insertEvent, attemptApi: attempt });
  const evidence = createEvidenceApi({ db, insertEvent, attemptApi: attempt });
  const verdict = createVerdictApi({ db, insertEvent, orderApi: order, evidenceApi: evidence });
  const resume = createResumeApi({ db, insertEvent, orderApi: order, checkpointApi: checkpoint });
  const adoption = createAdoptionApi({ db });

  return {
    db,
    config: cfg,
    order,
    claim,
    attempt,
    checkpoint,
    evidence,
    verdict,
    resume,
    adoption,
    webhook,
    event: eventApi,
    insertEvent,
    close() { claim.closeTimers?.(); db.close(); },
  };
}
