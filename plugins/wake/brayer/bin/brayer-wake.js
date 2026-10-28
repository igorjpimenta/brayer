#!/usr/bin/env node
import { startWakeServer } from "../index.js";

startWakeServer().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
