import { openDatabase } from "./db.js";
import { resolveConfig } from "./config.js";
import { createEventApi } from "./store/events.js";
import { createOrderApi } from "./store/orders.js";
import { createClaimApi } from "./store/claims.js";
import { createAttemptApi } from "./store/attempts.js";
import { createCheckpointApi } from "./store/checkpoints.js";
import { createEvidenceApi } from "./store/evidence.js";
import { createVerdictApi } from "./store/verdicts.js";
import { createResumeApi } from "./store/resume.js";

export function createStore({ dbPath, logger, config } = {}) {
  const cfg = resolveConfig({ explicit: config ?? {} });
  const finalPath = dbPath || cfg.dbPath;
  const { sqlite: db } = openDatabase({ dbPath: finalPath, logger });

  const { insertEvent, eventApi } = createEventApi({ db });
  const order = createOrderApi({ db, insertEvent });
  const claim = createClaimApi({ db, cfg, insertEvent, orderApi: order });
  const attempt = createAttemptApi({ db, insertEvent, orderApi: order });
  const checkpoint = createCheckpointApi({ db, insertEvent, attemptApi: attempt });
  const evidence = createEvidenceApi({ db, insertEvent, attemptApi: attempt });
  const verdict = createVerdictApi({ db, insertEvent, orderApi: order, evidenceApi: evidence });
  const resume = createResumeApi({ db, insertEvent, orderApi: order, checkpointApi: checkpoint });

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
    event: eventApi,
    insertEvent,
    close() { db.close(); },
  };
}
