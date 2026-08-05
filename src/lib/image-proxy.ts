/**
 * Server-side image proxy.
 *
 * Posters and cover art live on backend services (Emby, Radarr, Sonarr, RomM)
 * that are reachable from THIS host over the tailnet but not necessarily from
 * the browser that opens the dashboard — and every one of them needs a
 * credential the browser must never hold. So the browser never talks to them:
 * an adapter emits a same-origin URL (`/api/image?a=radarr&r=…`), the proxy
 * route resolves that adapter's base URL + auth from server config, fetches the
 * image here, and streams it back.
 *
 * Two halves:
 *   - `proxyImage()` runs at adapter-emit time (pure string work) and produces
 *     the browser-facing URL. Safe to import anywhere.
 *   - `resolveImageSource()` runs only in the route; it reads env and is the
 *     single place that knows each backend's host and credential.
 *
 * SSRF is bounded structurally: the host is NEVER taken from the request. The
 * adapter name selects a base URL from server config, and the decoded `ref` is
 * required to be a rooted path with no scheme and no `..`, so a caller cannot
 * steer the fetch at anything but the four configured services.
 */

/** Adapters that actually serve artwork. Anything else gets no proxy URL. */
export type ImageAdapter = "emby" | "radarr" | "sonarr" | "romm";

const IMAGE_ADAPTERS: readonly ImageAdapter[] = ["emby", "radarr", "sonarr", "romm"];

function isImageAdapter(name: string): name is ImageAdapter {
  return (IMAGE_ADAPTERS as readonly string[]).includes(name);
}

/**
 * Reduce a raw adapter image reference to a rooted path + query.
 *
 * Radarr/Sonarr hand out relative `/MediaCover/…`; RomM a relative
 * `image_path`; Emby an absolute `http://<host>:8096/Items/…`. All three
 * collapse to the path (and query) that hangs off the service's own base URL —
 * the host is dropped here and re-attached, from server config, in the route.
 */
function toBackendPath(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  // Strip a leading scheme+host: the proxy re-attaches the CONFIGURED base, so
  // whatever host the adapter recorded is irrelevant (and must not be trusted).
  s = s.replace(/^https?:\/\/[^/]+/i, "");
  if (!s.startsWith("/")) s = "/" + s;
  // A protocol-relative `//host/…` survived the strip above as `//host` — reject
  // it rather than let it read as a path.
  if (s.startsWith("//")) return null;
  if (s.includes("..")) return null;
  return s;
}

/**
 * Browser-facing proxy URL for an adapter image reference, or `undefined` when
 * there is nothing to show. The reference is base64url-encoded so the resulting
 * URL carries none of the characters (`()'"` …) that a CSS `url()` — where this
 * lands via `artBackground()` — or a poster filename could otherwise smuggle in.
 */
export function proxyImage(adapter: string, raw?: string | null): string | undefined {
  if (!raw || !isImageAdapter(adapter)) return undefined;
  const path = toBackendPath(raw);
  if (!path) return undefined;
  const ref = Buffer.from(path, "utf8").toString("base64url");
  return `/api/image?a=${adapter}&r=${ref}`;
}

/** How to reach one backend's images: its base URL and the auth headers. */
export interface ImageSource {
  baseUrl: string;
  headers: Record<string, string>;
}

/**
 * Resolve an adapter name to its image base URL + auth, mirroring exactly the
 * config each adapter uses to authenticate its own API calls. Returns null when
 * the service is unconfigured (the route then 404s and the tile shows its
 * placeholder). Server-only: reads process.env.
 */
export function resolveImageSource(adapter: string): ImageSource | null {
  if (!isImageAdapter(adapter)) return null;

  const env = (k: string) => (process.env[k] || "").trim();
  const stripSlash = (u: string) => u.replace(/\/$/, "");

  switch (adapter) {
    case "emby": {
      const baseUrl = env("EMBY_URL");
      const apiKey = env("EMBY_API_KEY");
      if (!baseUrl) return null;
      // Same token header the Emby adapter sends for its JSON calls.
      return { baseUrl: stripSlash(baseUrl), headers: apiKey ? { "X-MediaBrowser-Token": apiKey } : {} };
    }
    case "radarr":
    case "sonarr": {
      const baseUrl = env(`${adapter.toUpperCase()}_URL`);
      const apiKey = env(`${adapter.toUpperCase()}_API_KEY`);
      if (!baseUrl) return null;
      return { baseUrl: stripSlash(baseUrl), headers: apiKey ? { "X-Api-Key": apiKey } : {} };
    }
    case "romm": {
      const baseUrl = env("ROMM_URL");
      const apiKey = env("ROMM_API_KEY");
      if (!baseUrl) return null;
      // RomM auth is optional (some instances run open); send the key only if set.
      return { baseUrl: stripSlash(baseUrl), headers: apiKey ? { "X-API-Key": apiKey } : {} };
    }
  }
}

/**
 * Decode the base64url `ref` back to a backend path, re-validating that it is a
 * rooted, scheme-less, non-traversing path. The encode side already guarantees
 * this; the route decodes attacker-influenceable input, so it checks again.
 */
export function decodeImageRef(ref: string): string | null {
  let path: string;
  try {
    path = Buffer.from(ref, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (/[\x00-\x1f]/.test(path)) return null;
  if (/:\/\//.test(path) || path.includes("..")) return null;
  return path;
}
