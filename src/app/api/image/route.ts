import { NextRequest } from "next/server";
import { resolveImageSource, decodeImageRef } from "@/lib/image-proxy";

// Node runtime: this fetches http backends on the tailnet and streams binary
// bodies — neither is a fit for the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Images are larger and slower than JSON, so a more generous budget than the
// 4s adapter timeout — but still bounded, so a stalled backend cannot pin a
// server connection open.
const IMAGE_TIMEOUT_MS = 6000;
// A poster is tens to low hundreds of KB. Anything past this is not artwork;
// refuse it rather than stream an unbounded body through the server.
const MAX_BYTES = 8 * 1024 * 1024;

/** A 1×1 transparent GIF — returned on any failure so the tile falls to its
 *  CSS placeholder instead of showing a broken-image glyph. */
const BLANK = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function blank(status: number): Response {
  return new Response(BLANK, {
    status,
    headers: {
      "Content-Type": "image/gif",
      // Briefly cache the miss so a dead poster does not re-hammer the backend
      // on every re-render, but not so long that a fixed service stays broken.
      "Cache-Control": "public, max-age=60",
    },
  });
}

// GET /api/image?a=<adapter>&r=<base64url path> — proxy one backend image.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const adapter = sp.get("a") ?? "";
  const ref = sp.get("r") ?? "";

  const source = resolveImageSource(adapter);
  const path = ref && decodeImageRef(ref);
  // Unknown adapter, unconfigured service, or a malformed/traversing ref: 404
  // to the placeholder. Never reveal which of these it was.
  if (!source || !path) return blank(404);

  const target = source.baseUrl + path;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

  try {
    const upstream = await fetch(target, {
      headers: { ...source.headers, Accept: "image/*" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!upstream.ok || !upstream.body) return blank(502);

    const type = upstream.headers.get("content-type") ?? "";
    // Only pass through actual images. A backend that answers a bad image path
    // with an HTML error page or a JSON 401 must not be streamed as if it were
    // artwork.
    if (!type.startsWith("image/")) return blank(502);

    const len = Number(upstream.headers.get("content-length") ?? "0");
    if (len && len > MAX_BYTES) return blank(502);

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return blank(502);

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": type,
        // Posters are effectively immutable; cache hard so the browser and any
        // shared cache stop asking. The proxy path itself carries the tag/id, so
        // a changed poster is a different URL.
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    // Timeout, connection refused, DNS — all become the placeholder.
    return blank(504);
  } finally {
    clearTimeout(timer);
  }
}
