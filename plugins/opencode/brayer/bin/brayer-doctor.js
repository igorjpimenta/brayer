import { runDoctor } from "../doctor.js";

const rest = process.argv.slice(2);
const result = await runDoctor({ rest });
if (result && result.ok === false) process.exitCode = 1;
