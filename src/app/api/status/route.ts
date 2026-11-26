import { errorResponse, json } from "@/server/http";
import { getStore } from "@/server/store";


export async function GET() {
  try {
    const store = getStore();
    return json({
      ok: true,
      store: store.kind,
      node: process.version,
      sqlite: typeof process.versions.sqlite === "string" ? process.versions.sqlite : null,
      protocol: "pv.intent/1",
      time: new Date().toISOString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
