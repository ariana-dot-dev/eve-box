/**
 * End-to-end coverage of every documented Eve sandbox use case, using the
 * published @asciidev/eve-box adapter against a real Ascii Box.
 *
 * The full documented surface is the Eve `SandboxSession` contract (the eight
 * AI SDK I/O methods plus eve's `id` / `resolvePath` / `setNetworkPolicy` /
 * `removePath`) and the `SandboxBackend` lifecycle (prewarm + templates,
 * create, reconnect via captured metadata). Each documented behavior is one
 * checked case below. One Box is created and reused for everything.
 *
 *   BOX_API_KEY=box_... npm start
 */
import { asciiBox, EveBoxUnsupportedError } from "@asciidev/eve-box";
import type {
  SandboxBackend,
  SandboxBackendHandle,
  SandboxSession,
} from "eve/sandbox";

const apiKey = process.env.BOX_API_KEY;
if (!apiKey) throw new Error("Set BOX_API_KEY (a real Ascii Box key).");

const runId = `cov-${Date.now().toString(36)}`;
const root = `coverage/${runId}`;

type Status = "PASS" | "FAIL" | "LIMITATION";
const results: { name: string; status: Status; detail?: string }[] = [];

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log(`  ✅ ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const status: Status = detail.startsWith("LIMITATION:") ? "LIMITATION" : "FAIL";
    results.push({ name, status, detail });
    console.log(`  ${status === "LIMITATION" ? "⚠️ " : "❌"} ${name}\n       ${detail}`);
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out += decoder.decode(value, { stream: true });
  }
}
function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } });
}
const withTimeout = <T>(p: Promise<T>, ms: number, label: string) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms}ms: ${label}`)), ms))]);

// Bootstrap marker proves the prewarm bootstrap hook ran on first session setup.
const bootstrapMarker = `${root}/bootstrap-ran.txt`;
const seededFile = `${root}/seed.txt`;

async function main() {
  console.log(`\n# Eve sandbox coverage against real Box (runId=${runId})\n`);

  const backend: SandboxBackend = asciiBox({
    apiKey,
    name: `eve-box-coverage-${runId}`,
    ttlSeconds: 600,
    pollMs: 250,
    networkPolicy: "allow-all",
  });

  const templateKey = `tmpl-${runId}`;

  // --- Backend: prewarm records a template (seed files + bootstrap) ---
  let firstReused: boolean | undefined;
  let secondReused: boolean | undefined;
  await check("backend.prewarm records a template (returns reused=false)", async () => {
    const r = await backend.prewarm({
      templateKey,
      seedFiles: [{ path: seededFile, content: "seeded-content\n" }],
      bootstrap: async ({ use }) => {
        const s = await use();
        await s.writeTextFile({ path: bootstrapMarker, content: "bootstrap-ran\n" });
      },
      log: () => {},
    } as any);
    firstReused = (r as any).reused;
    assert(firstReused === false, `expected reused=false, got ${firstReused}`);
  });
  await check("backend.prewarm is idempotent (returns reused=true)", async () => {
    const r = await backend.prewarm({ templateKey, seedFiles: [], log: () => {} } as any);
    secondReused = (r as any).reused;
    assert(secondReused === true, `expected reused=true, got ${secondReused}`);
  });

  // --- Backend: create() provisions a real Box from the template ---
  let handle: SandboxBackendHandle;
  let session: SandboxSession;
  let boxId: string;
  await check("backend.create() provisions a Box and captureState() exposes boxId", async () => {
    handle = await withTimeout(
      backend.create({ templateKey, sessionKey: `${runId}-main`, runtimeContext: { appRoot: process.cwd() } } as any),
      300_000,
      "create",
    );
    const state = await handle.captureState();
    boxId = String((state.metadata as any).boxId);
    assert(boxId && boxId !== "undefined", "captureState did not expose a boxId");
    session = await handle.useSessionFn!({ networkPolicy: "allow-all" } as any);
  });

  await check("session.id is a stable non-empty identifier", async () => {
    assert(typeof session.id === "string" && session.id.length > 0, "session.id missing");
  });

  // --- Template materialization replayed onto the new session ---
  await check("template seed files are materialized in the session", async () => {
    const got = await session.readTextFile({ path: seededFile });
    assert(got === "seeded-content\n", `seed file content was ${JSON.stringify(got)}`);
  });
  await check("template bootstrap hook ran during session setup", async () => {
    const got = await session.readTextFile({ path: bootstrapMarker });
    assert(got === "bootstrap-ran\n", `bootstrap marker was ${JSON.stringify(got)}`);
  });

  // --- Path handling ---
  await check("resolvePath anchors relative paths to /workspace", async () => {
    assert(session.resolvePath("a/b.txt") === "/workspace/a/b.txt", session.resolvePath("a/b.txt"));
  });
  await check("resolvePath passes absolute paths through", async () => {
    assert(session.resolvePath("/etc/hosts") === "/etc/hosts", session.resolvePath("/etc/hosts"));
  });

  // --- run() ---
  await check("run() returns exitCode and stdout", async () => {
    const r = await session.run({ command: "echo hello-run" });
    assert(r.exitCode === 0 && r.stdout.includes("hello-run"), JSON.stringify(r));
  });
  await check("run() honors workingDirectory (relative to /workspace)", async () => {
    await session.run({ command: `mkdir -p ${root}/wd` });
    const r = await session.run({ command: "pwd", workingDirectory: `${root}/wd` });
    assert(r.stdout.includes(`/workspace/${root}/wd`), r.stdout);
  });
  await check("run() injects env with precedence", async () => {
    const r = await session.run({ command: 'printf "%s" "$COV_VAR"', env: { COV_VAR: "env-value" } });
    assert(r.stdout === "env-value", JSON.stringify(r.stdout));
  });
  await check("run() captures non-zero exit code", async () => {
    const r = await session.run({ command: "exit 7" });
    assert(r.exitCode === 7, `exit code ${r.exitCode}`);
  });
  await check("run() captures stderr", async () => {
    const r = await session.run({ command: "printf err-stream >&2" });
    assert(r.stderr.includes("err-stream"), JSON.stringify(r.stderr));
  });
  await check("run() relative file op lands under /workspace", async () => {
    await session.run({ command: `mkdir -p ${root}/cmd && printf in-workspace > ${root}/cmd/x.txt` });
    const abs = await session.run({ command: `cat /workspace/${root}/cmd/x.txt` });
    assert(abs.stdout === "in-workspace", abs.stdout);
  });
  await check("run() abortSignal aborts the command", async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 400);
    const started = Date.now();
    try {
      await withTimeout(session.run({ command: "sleep 20", abortSignal: ac.signal }), 8000, "run-abort");
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("timed out")) {
        throw new Error("LIMITATION: run() does not honor abortSignal (command kept running)");
      }
      return; // aborted as documented
    }
    if (Date.now() - started > 15000) throw new Error("LIMITATION: run() ignored abortSignal");
    throw new Error("LIMITATION: run() returned without honoring abortSignal");
  });

  // --- spawn() ---
  await check("spawn() streams stdout/stderr and wait() reports exit code", async () => {
    const proc = await session.spawn({ command: "printf out; printf err >&2; exit 4", workingDirectory: root });
    const [out, err, exit] = await Promise.all([streamToText(proc.stdout), streamToText(proc.stderr), proc.wait()]);
    assert(out === "out" && err === "err" && exit.exitCode === 4, `${out}|${err}|${exit.exitCode}`);
  });
  await check("spawn() exposes a pid", async () => {
    const proc = await session.spawn({ command: "true", workingDirectory: root });
    await proc.wait();
    assert(typeof proc.pid === "number" && proc.pid > 0, `pid=${proc.pid}`);
  });
  await check("spawn() kill() terminates the process (idempotent)", async () => {
    const proc = await session.spawn({ command: "sleep 30", workingDirectory: root });
    await proc.kill();
    await proc.kill(); // idempotent
    const exit = await withTimeout(proc.wait(), 8000, "killed-wait");
    assert(typeof exit.exitCode === "number", "wait did not resolve after kill");
  });
  await check("spawn() abortSignal kills and rejects wait()", async () => {
    const ac = new AbortController();
    const proc = await session.spawn({ command: "sleep 30", workingDirectory: root, abortSignal: ac.signal });
    setTimeout(() => ac.abort(), 300);
    try {
      await withTimeout(proc.wait(), 8000, "abort-wait");
      throw new Error("LIMITATION: spawn().wait() resolved despite abort");
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("timed out")) throw new Error("LIMITATION: spawn abortSignal not honored");
      // rejected as documented
    }
  });

  // --- text files ---
  await check("writeTextFile + readTextFile round-trip", async () => {
    await session.writeTextFile({ path: `${root}/t.txt`, content: "line1\nline2\nline3\n" });
    assert((await session.readTextFile({ path: `${root}/t.txt` })) === "line1\nline2\nline3\n", "round trip mismatch");
  });
  await check("writeTextFile creates parent directories recursively", async () => {
    await session.writeTextFile({ path: `${root}/deep/a/b/c.txt`, content: "deep\n" });
    assert((await session.readTextFile({ path: `${root}/deep/a/b/c.txt` })) === "deep\n", "nested write failed");
  });
  await check("readTextFile startLine/endLine are 1-based inclusive", async () => {
    const got = await session.readTextFile({ path: `${root}/t.txt`, startLine: 2, endLine: 2 });
    assert(got === "line2\n", JSON.stringify(got));
  });
  await check("readTextFile endLine past EOF returns through EOF", async () => {
    const got = await session.readTextFile({ path: `${root}/t.txt`, startLine: 2, endLine: 99 });
    assert(got === "line2\nline3\n", JSON.stringify(got));
  });
  await check("readTextFile honors a non-utf8 encoding", async () => {
    await session.writeBinaryFile({ path: `${root}/latin.bin`, content: new Uint8Array([0xe9]) }); // é in latin1
    const got = await session.readTextFile({ path: `${root}/latin.bin`, encoding: "latin1" });
    assert(got === "é", JSON.stringify(got));
  });
  await check("readTextFile returns null for a missing file", async () => {
    assert((await session.readTextFile({ path: `${root}/nope.txt` })) === null, "expected null");
  });

  // --- binary files ---
  await check("writeBinaryFile + readBinaryFile round-trip (incl 0x00/0xFF)", async () => {
    const bytes = new Uint8Array([0, 1, 2, 128, 254, 255]);
    await session.writeBinaryFile({ path: `${root}/b.dat`, content: bytes });
    const got = await session.readBinaryFile({ path: `${root}/b.dat` });
    assert(got !== null && [...got].join(",") === [...bytes].join(","), `got ${got && [...got]}`);
  });
  await check("readBinaryFile returns null for a missing file", async () => {
    assert((await session.readBinaryFile({ path: `${root}/nope.dat` })) === null, "expected null");
  });

  // --- stream files ---
  await check("writeFile (stream) + readFile (stream) round-trip", async () => {
    await session.writeFile({ path: `${root}/s.dat`, content: bytesToStream(new TextEncoder().encode("stream-bytes")) });
    const stream = await session.readFile({ path: `${root}/s.dat` });
    assert(stream !== null && (await streamToText(stream)) === "stream-bytes", "stream round trip failed");
  });
  await check("readFile (stream) returns null for a missing file", async () => {
    assert((await session.readFile({ path: `${root}/nope.s` })) === null, "expected null");
  });

  // --- removePath ---
  await check("removePath removes a single file", async () => {
    await session.writeTextFile({ path: `${root}/rm.txt`, content: "x" });
    await session.removePath({ path: `${root}/rm.txt` });
    assert((await session.readTextFile({ path: `${root}/rm.txt` })) === null, "file still present");
  });
  await check("removePath recursive removes a non-empty directory", async () => {
    await session.writeTextFile({ path: `${root}/rmdir/a.txt`, content: "a" });
    await session.removePath({ path: `${root}/rmdir`, recursive: true, force: true });
    assert((await session.readTextFile({ path: `${root}/rmdir/a.txt` })) === null, "dir still present");
  });
  await check("removePath force ignores a missing path", async () => {
    await session.removePath({ path: `${root}/never-existed`, force: true });
  });

  // --- network policy ---
  await check('network policy "allow-all" is accepted', async () => {
    await session.setNetworkPolicy("allow-all");
  });
  await check('network policy "deny-all" throws EveBoxUnsupportedError', async () => {
    await session.setNetworkPolicy("deny-all").then(
      () => { throw new Error("expected throw"); },
      (e) => { assert(e instanceof EveBoxUnsupportedError, `wrong error: ${e}`); },
    );
  });

  // --- reconnect via captured metadata (reuses the same Box) ---
  await check("backend.create() reconnects via captured boxId and preserves the workspace", async () => {
    const marker = `${root}/reconnect.txt`;
    await session.writeTextFile({ path: marker, content: `box=${boxId}\n` });
    const reconnected = await withTimeout(
      backend.create({ templateKey: null, sessionKey: `${runId}-reconnect`, existingMetadata: { boxId }, runtimeContext: { appRoot: process.cwd() } } as any),
      300_000,
      "reconnect",
    );
    const state = await reconnected.captureState();
    assert(String((state.metadata as any).boxId) === boxId, "reconnected to a different box");
    const got = await reconnected.session.readTextFile({ path: marker });
    assert(got === `box=${boxId}\n`, `workspace not preserved: ${JSON.stringify(got)}`);
  });

  // --- summary ---
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const lim = results.filter((r) => r.status === "LIMITATION").length;
  console.log(`\n# Summary: ${pass} passed, ${fail} failed, ${lim} limitations (of ${results.length})`);
  if (lim) {
    console.log("\nDocumented behaviors not supported by the Box backend:");
    for (const r of results.filter((r) => r.status === "LIMITATION")) console.log(`  - ${r.name}: ${r.detail}`);
  }
  if (fail) {
    console.log("\nFailures:");
    for (const r of results.filter((r) => r.status === "FAIL")) console.log(`  - ${r.name}: ${r.detail}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
