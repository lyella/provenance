#!/usr/bin/env node
/**
 * Build the app, then serve it — and, with --watch, do both again whenever a
 * source file changes.
 *
 * This exists because rebuilding rewrites `.next` underneath a running server,
 * which leaves it serving stale HTML and 500ing on chunks that no longer exist
 * (the symptom: the page arrives unstyled, or a CSS chunk returns 500).
 *
 * Usage:
 *   node scripts/preview.mjs            # build + serve once
 *   node scripts/preview.mjs --watch    # rebuild + restart on change
 */
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const port = Number(process.env.PORT ?? 3000);
const watchMode = process.argv.includes("--watch");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

let server = null;
let rebuilding = false;
let queued = false;

function waitForBuild() {
  return new Promise((resolve, reject) => {
    const build = spawn(process.execPath, [nextBin, "build"], { cwd: root, stdio: "inherit" });
    build.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build exited with ${code}`))));
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server || server.exitCode !== null) return resolve();
    server.once("exit", () => resolve());
    server.kill();
    server = null;
  });
}

function startServer() {
  server = spawn(process.execPath, [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PROVENANCE_ORIGIN: process.env.PROVENANCE_ORIGIN ?? `http://127.0.0.1:${port}` },
  });
  server.on("exit", (code) => {
    if (!rebuilding) console.log(`[preview] server exited with ${code}`);
  });
}

async function cycle(reason) {
  if (rebuilding) {
    queued = true;
    return;
  }
  rebuilding = true;
  console.log(`[preview] ${reason} — stopping server`);
  await stopServer();
  try {
    await waitForBuild();
    startServer();
  } catch (err) {
    console.error(`[preview] build failed: ${err.message}`);
  }
  rebuilding = false;
  if (queued) {
    queued = false;
    await cycle("change queued during build");
  }
}

await cycle("initial build");

if (watchMode) {
  let timer = null;
  const onChange = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void cycle("source changed"), 350);
  };
  watch(path.join(root, "src"), { recursive: true }, onChange);
  watch(path.join(root, "next.config.ts"), onChange);
  console.log("[preview] watching src/ — edit and the preview rebuilds");
}
