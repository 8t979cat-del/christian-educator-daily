/* Check an environment file before deploying:
 *   node --env-file=.env.production scripts/check-env.mjs
 * Prints each variable's NAME and a verdict, never a value. Exits 1 if any check is an error.
 * Uses the same rules as the app's launch page (src/lib/ops/env-check.ts). Needs Node 22.18+ (runs TypeScript directly). */
import { checkEnvironment } from "../src/lib/ops/env-check.ts";

const report = checkEnvironment(process.env);
const mark = { ok: "  ok     ", warning: "  WARN   ", error: "  ERROR  " };
console.log(`Environment: ${report.environment}`);
for (const c of report.checks) console.log(`${mark[c.level]}${c.key}: ${c.message}`);
console.log(`\n${report.errors} error(s), ${report.warnings} warning(s).`);
process.exit(report.ok ? 0 : 1);
