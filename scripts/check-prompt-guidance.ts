import assert from "node:assert/strict";
import { promptOptions } from "@/lib/prompt-options";

const rules = (promptOptions.additionalRules ?? []).join("\n");
const examples = (promptOptions.toolExamples ?? []).join("\n");

assert.match(rules, /Media visual hierarchy/);
assert.match(rules, /feature.*dominant/i);
assert.match(rules, /rail.*resumable/i);
assert.match(examples, /ArtworkWall\(null, 12, null, recentData\.title, recentData\.subtitle, recentData\.state, recentData\.items, false, "feature"\)/);
assert.match(examples, /ArtworkWall\(null, 12, null, resumeData\.title, resumeData\.subtitle, resumeData\.state, resumeData\.items, false, "rail"\)/);

console.log("PASS — generated media guidance includes feature and rail layouts");
