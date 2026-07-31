/**
 * Measure the generated system prompt for the homelab component library.
 *
 * Usage:  npx tsx scripts/measure-prompt.ts
 *
 * Hard gate: estimated tokens (chars / 4) must be UNDER 30,000.
 * If over, schemas are too wide — narrow them before proceeding.
 */
import { promptLibrary } from "@/lib/prompt-library";
import { promptOptions } from "@/lib/prompt-options";

const prompt = promptLibrary.prompt(promptOptions);
const charCount = prompt.length;
const tokenEstimate = Math.round(charCount / 4);

console.log(`System prompt: ${charCount.toLocaleString()} chars`);
console.log(`Estimated tokens: ${tokenEstimate.toLocaleString()} (chars / 4)`);

if (tokenEstimate < 30000) {
  console.log(`\nPASS — under 30,000 tokens (budget used: ${((tokenEstimate / 30000) * 100).toFixed(1)}%)`);
} else {
  console.log(`\nFAIL — OVER 30,000 tokens by ${(tokenEstimate - 30000).toLocaleString()}. Schemas need narrowing.`);
  process.exit(1);
}
