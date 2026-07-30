/**
 * Measure the system prompt size for the homelab library.
 *
 * Usage: npx tsx scripts/measure-prompt.ts
 *
 * Hard gate: under 30,000 estimated tokens (chars / 4).
 */
import { promptLibrary } from "../src/lib/prompt-library";
import { promptOptions } from "../src/lib/prompt-options";

const prompt = promptLibrary.prompt(promptOptions);
const chars = prompt.length;
const estimatedTokens = Math.round(chars / 4);

console.log(`System prompt:`);
console.log(`  Characters:       ${chars.toLocaleString()}`);
console.log(`  Estimated tokens: ${estimatedTokens.toLocaleString()} (chars / 4)`);
console.log(`  Hard gate (30k):  ${estimatedTokens < 30000 ? "PASS ✓" : "FAIL ✗ — trim schemas or reduce tool count"}`);
console.log();
console.log(`For reference, the old 905-component prompt was ~350,000 tokens.`);
