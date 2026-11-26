import { errorResponse, json } from "@/server/http";
import { getStore } from "@/server/store";

export async function GET() {
  try {
    const store = getStore();
    return json({
      ok: true,
      store: store.kind,
      // Say plainly what a visitor is getting, rather than leaving them to
      // work out what "memory" means for their data.
      durable: store.kind === "sqlite",
      note:
        store.kind === "sqlite"
          ? "Records persist in a SQLite file on this host."
          : "Running on an in-memory store: records created here reset when the instance recycles. Verification is unaffected — chains remain valid.",
      node: process.version,
      sqlite: typeof process.versions.sqlite === "string" ? process.versions.sqlite : null,
      protocol: "pv.intent/1",
      time: new Date().toISOString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
