/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");

const artwork = fs.readFileSync(".design-export/components/ArtworkWall.html", "utf8");
const artworkRail = fs.readFileSync(".design-export/components/ArtworkWallRail.html", "utf8");
const playback = fs.readFileSync(".design-export/components/PlaybackSessions.html", "utf8");
const line = fs.readFileSync(".design-export/components/LineChart.html", "utf8");
const network = fs.readFileSync(".design-export/components/NodeGraph.html", "utf8");

assert.match(artwork, /data-art="image"/);
assert.match(artwork, /media-demo\/dune\.svg/);
assert.match(artwork, /cnv-posters-layout-grid/);
assert.match(artwork, /cnv-media-meta/);
assert.match(artworkRail, /cnv-posters-layout-rail/);
assert.doesNotMatch(playback, />direct</);
assert.match(line, /pathLength="1"/);
assert.match(line, /cnv-chart-line-reveal/);
assert.match(line, /cnv-chart-endpoint/);
assert.match(network, /cnv-network-flow/);
console.log("PASS — artwork, playback honesty, and chart motion");
