/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");

const artwork = fs.readFileSync(".design-export/components/ArtworkWall.html", "utf8");
const artworkRail = fs.readFileSync(".design-export/components/ArtworkWallRail.html", "utf8");
const playback = fs.readFileSync(".design-export/components/PlaybackSessions.html", "utf8");

assert.match(artwork, /data-art="image"/);
assert.match(artwork, /media-demo\/dune\.svg/);
assert.match(artwork, /cnv-posters-layout-grid/);
assert.match(artwork, /cnv-media-meta/);
assert.match(artworkRail, /cnv-posters-layout-rail/);
assert.doesNotMatch(playback, />direct</);
console.log("PASS — poster-rich media preview");
