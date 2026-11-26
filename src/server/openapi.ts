/**
 * A small OpenAPI 3.1 description served at /api/openapi.
 *
 * Written by hand on purpose: it documents the contract the SDK and the CLI
 * both consume, so the two cannot drift apart silently.
 */
export function openapiDocument(origin: string) {
  const intentRef = { $ref: "#/components/schemas/Intent" };
  return {
    openapi: "3.1.0",
    info: {
      title: "Provenance API",
      version: "1.0.0",
      description:
        "Decision records with a hash-linked history and a confidence-weighted exposure ledger. " +
        "Integrity is checkable offline: see GET /v1/cases/{ref}/export and the `provenance verify` command.",
    },
    servers: [{ url: origin }],
    paths: {
      "/api/v1/cases": {
        get: { summary: "List your cases", responses: { "200": { description: "Cases owned by the session user" }, "401": { description: "Not signed in" } } },
        post: {
          summary: "Open a case",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title"],
                  properties: {
                    title: { type: "string", maxLength: 160 },
                    kind: { type: "string", enum: ["decision", "incident", "forecast", "hire"] },
                    policy: { type: "string", enum: ["none", "zero", "half"] },
                    windowDays: { type: "integer", minimum: 1, maximum: 90 },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Case opened" } },
        },
      },
      "/api/v1/cases/{ref}": {
        parameters: [{ name: "ref", in: "path", required: true, schema: { type: "string" } }],
        get: { summary: "Read a case with its intents and verification status", responses: { "200": { description: "Case" }, "403": { description: "Not the owner" } } },
      },
      "/api/v1/cases/{ref}/intents": {
        parameters: [{ name: "ref", in: "path", required: true, schema: { type: "string" } }],
        post: {
          summary: "Append an intent",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["body"],
                  properties: {
                    body: { type: "string", maxLength: 4000 },
                    confidence: { type: "string", enum: ["low", "medium", "high"] },
                    evidence: { type: "array", items: { type: "string" } },
                    tags: { type: "array", items: { type: "string" } },
                    supersedes: { oneOf: [{ type: "integer" }, { type: "string" }] },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Intent appended", content: { "application/json": { schema: { type: "object", properties: { intent: intentRef } } } } } },
        },
      },
      "/api/v1/cases/{ref}/flag/{n}": {
        parameters: [
          { name: "ref", in: "path", required: true, schema: { type: "string" } },
          { name: "n", in: "path", required: true, schema: { type: "integer" } },
        ],
        post: {
          summary: "Flag an intent as a wrong decision (costs 1.5x its confidence)",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["reason"], properties: { reason: { type: "string" } } } } } },
          responses: { "201": { description: "Flag recorded" } },
        },
      },
      "/api/v1/cases/{ref}/seal": {
        parameters: [{ name: "ref", in: "path", required: true, schema: { type: "string" } }],
        post: { summary: "Freeze a case and publish its head", responses: { "200": { description: "Sealed with anchor" }, "409": { description: "Already sealed or chain broken" } } },
      },
      "/api/v1/cases/{ref}/verify": {
        parameters: [{ name: "ref", in: "path", required: true, schema: { type: "string" } }],
        get: { summary: "Recompute the chain (public)", responses: { "200": { description: "Verification result" } } },
      },
      "/api/v1/cases/{ref}/slip": {
        parameters: [{ name: "ref", in: "path", required: true, schema: { type: "string" } }],
        get: { summary: "Read the Share Slip (public)", responses: { "200": { description: "Slip" } } },
      },
      "/api/v1/cases/{ref}/export": {
        parameters: [{ name: "ref", in: "path", required: true, schema: { type: "string" } }],
        get: { summary: "Export every link for offline verification (public)", responses: { "200": { description: "Verification bundle" } } },
      },
      "/api/v1/cases/{ref}/anchor": {
        parameters: [{ name: "ref", in: "path", required: true, schema: { type: "string" } }],
        get: { summary: "Anchor document with manual verification steps (public)", responses: { "200": { description: "Anchor" } } },
      },
      "/api/v1/passport/{handle}": {
        parameters: [{ name: "handle", in: "path", required: true, schema: { type: "string" } }],
        get: { summary: "A person's public commitment record", responses: { "200": { description: "Passport" }, "404": { description: "No such handle" } } },
      },
      "/api/v1/autopilot": {
        get: { summary: "Read this visitor's autopilot run", responses: { "200": { description: "Run state" } } },
        post: { summary: "Advance the autopilot by one step", responses: { "200": { description: "Next state" } } },
      },
      "/feed.xml": { get: { summary: "Sealed cases as RSS", responses: { "200": { description: "RSS" } } } },
      "/api/status": { get: { summary: "Runtime and storage backend", responses: { "200": { description: "Status" } } } },
    },
    components: {
      schemas: {
        Intent: {
          type: "object",
          properties: {
            n: { type: "integer" },
            body: { type: "string" },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            evidence: { type: "array", items: { type: "string" } },
            tags: { type: "array", items: { type: "string" } },
            status: { type: "string", enum: ["active", "superseded", "withdrawn", "flagged"] },
            hash: { type: "string", description: "sha256 of the canonical link" },
            byDouble: { type: "string" },
            source: { type: "string", enum: ["human", "agent", "import", "git"] },
            createdAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
  };
}
