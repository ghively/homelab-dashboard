import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@openuidev/react-ui",
    "@openuidev/react-lang",
    "@openuidev/lang-core",
  ],
  turbopack: {
    root: __dirname,
  },
  // ignoreBuildErrors was set here while ~144 type errors were outstanding.
  // Those are fixed, so the build type-checks again. Do not re-enable it to
  // get a red build green — it hid a real crash (tdarr referencing an
  // undefined `job` in a .map callback) for as long as it was on.
};

export default nextConfig;
