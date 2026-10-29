#!/usr/bin/env node
import { startWakeServer } from "../wake.js";

startWakeServer().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
