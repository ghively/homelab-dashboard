/**
 * Measures the system prompt token count for the homelab library.
 *
 * Hard gate: must be under 30,000 estimated tokens (chars / 4).
 * Re-run after any schema, component, or prompt-options change.
 *
 * Usage: npx tsx scripts/measure-prompt.ts
 */
import { buildSystemPrompt } from "../src/lib/prompt-library";
import { promptOptions } from "../src/lib/prompt-options";

const promptText = buildSystemPrompt(promptOptions);
const chars = promptText.length;
const estimatedTokens = Math.ceil(chars / 4);

console.log("─".repeat(60));
console.log("System prompt measurement");
console.log("─".repeat(60));
console.log(`  Characters:      ${chars.toLocaleString()}`);
console.log(`  Est. tokens:     ${estimatedTokens.toLocaleString()}  (chars / 4)`);
console.log(`  Gate (30,000):   ${estimatedTokens < 30_000 ? "PASS ✓" : "FAIL ✗ — schemas too wide"}`);
console.log("─".repeat(60));

if (estimatedTokens >= 30_000) {
  console.error("\nERROR: Prompt exceeds the 30,000-token gate. Narrow the schemas.");
  process.exit(1);
}
