/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");

const artwork = fs.readFileSync(".design-export/components/ArtworkWall.html", "utf8");

assert.match(artwork, /data-art="image"/);
assert.match(artwork, /media-demo\/dune\.svg/);
console.log("PASS — poster-rich media preview");
