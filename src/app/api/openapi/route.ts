import { connection } from "next/server";
import { openapiDocument } from "@/server/openapi";
import { errorResponse, json, requestOrigin } from "@/server/http";

export async function GET(request: Request) {
  // Request-time: the server origin comes from headers. Called outside the
  // try/catch so the prerender control-flow is never swallowed.
  await connection();
  try {
    return json(openapiDocument(requestOrigin(request)));
  } catch (err) {
    return errorResponse(err);
  }
}
