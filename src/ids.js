import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

function suffix(len = 8) {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function newOrderId() { return `WO-${suffix()}`; }
export function newAttemptId() { return `ATT-${suffix()}`; }
export function newCheckpointId() { return `CP-${suffix()}`; }
export function newEvidenceId() { return `EV-${suffix()}`; }
export function newVerdictId() { return `VD-${suffix()}`; }
export function newPlaybookId() { return `PB-${suffix()}`; }
