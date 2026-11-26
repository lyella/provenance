import { connection } from "next/server";
import { summarize } from "@/server/engine";
import { errorResponse, requestOrigin } from "@/server/http";
import { getStore } from "@/server/store";


const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The Provenance Feed: sealed cases as immutable RSS items. A slip is an item.
 *
 * Publishing this makes the discipline legible outside the app — a syndicated
 * record of what was committed to, when, and by whom, that any reader can check
 * against the anchor endpoint.
 */
export async function GET(request: Request) {
  // Reading request headers needs request time; declare it explicitly under
  // Cache Components. Called outside the try/catch so the prerender
  // control-flow is never swallowed.
  await connection();
  try {
    const store = getStore();
    const origin = requestOrigin(request);
    const rows = await store.listPublicCases(30);
    const items = [];

    for (const row of rows) {
      const summary = await summarize(store, row);
      const link = `${origin}/c/${row.ref}`;
      const status = summary.slipped ? "slipped" : summary.verified.valid ? "verified" : "unverified";
      items.push(`    <item>
      <title>${esc(`${row.ref} · ${row.title}`)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(`${row.ref}@${row.head.slice(0, 12)}`)}</guid>
      <pubDate>${new Date(row.sealedAt ?? row.createdAt).toUTCString()}</pubDate>
      <category>${esc(status)}</category>
      <description>${esc(
        `${row.intentCount} intents · head ${row.head.slice(0, 12)} · chain ${summary.verified.valid ? "verified" : "BROKEN"}${
          summary.slipped ? ` · slipped on ${summary.slippedOn}` : ""
        }`,
      )}</description>
    </item>`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Provenance · sealed cases</title>
    <link>${esc(origin)}</link>
    <description>Decision records whose integrity anyone can verify.</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items.join("\n")}
  </channel>
</rss>`;
    return new Response(xml, {
      headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=60" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
