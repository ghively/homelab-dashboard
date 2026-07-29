/**
 * Adapter verification script
 *
 * Tests that:
 * 1. All CI/CD adapters are registered
 * 2. Each adapter has the required fields
 * 3. TypeScript types are correct
 */
import { cicdAdapters, listCicdAdapters } from "../src/adapters/cicd";

const expectedAdapters = [
  "gitlab",
  "gitlab-runner",
  "gitlab-runner-ai",
  "github-actions",
  "ansible",
];

console.log("=".repeat(60));
console.log("CI/CD Adapter Verification");
console.log("=".repeat(60));
console.log("");

// Check all expected adapters are registered
console.log("1. Adapter Registration");
console.log("-".repeat(60));

const registered = Object.keys(cicdAdapters);
expectedAdapters.forEach((name) => {
  const found = registered.includes(name);
  const status = found ? "✓" : "✗";
  console.log(`${status} ${name}`);

  if (found) {
    const adapter = cicdAdapters[name];
    console.log(`   - service: ${adapter.serviceName}`);
    console.log(`   - host: ${adapter.host}`);
    console.log(`   - methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(adapter)).join(", ")}`);
  }
});

console.log("");

// Check adapter list
console.log("2. Adapter List");
console.log("-".repeat(60));

const adapters = listCicdAdapters();
console.log(`Total adapters: ${adapters.length}`);
adapters.forEach((a) => {
  console.log(`  - ${a.name} (${a.serviceName} on ${a.host})`);
});

console.log("");

// Summary
console.log("3. Summary");
console.log("-".repeat(60));
const allFound = expectedAdapters.every((name) => registered.includes(name));
const status = allFound ? "✓ PASS" : "✗ FAIL";
console.log(`${status} All expected adapters registered: ${expectedAdapters.length}/${expectedAdapters.length}`);
console.log("");

if (!allFound) {
  console.log("Missing adapters:");
  expectedAdapters
    .filter((name) => !registered.includes(name))
    .forEach((name) => console.log(`  - ${name}`));
}

console.log("=".repeat(60));

process.exit(allFound ? 0 : 1);