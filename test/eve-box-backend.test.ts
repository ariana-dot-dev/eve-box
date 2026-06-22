import assert from "node:assert/strict";
import test from "node:test";
import { asciiBox, BoxHttpClient, EveBoxUnsupportedError } from "../src/index.js";
import type { SandboxSession } from "eve/sandbox";
import type { BoxClient, BoxInfo, CommandResult } from "../src/types.js";

const requiredApiKey = process.env.BOX_API_KEY;
const realTest = requiredApiKey ? test : test.skip;
const apiKey: string = requiredApiKey ?? "";

const runId = `eve-box-adapter-${Date.now()}-${process.pid}`;
const testRoot = `real-tests/${runId}`;

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

let sharedPromise: Promise<{
  backend: ReturnType<typeof asciiBox>;
  boxId: string;
  session: SandboxSession;
}> | undefined;

async function sharedRealBox() {
  sharedPromise ??= (async () => {
    const backend = asciiBox({
      apiKey,
      name: `ariana-eve-adapter-test-${runId}`,
      ttlSeconds: 300,
      pollMs: 250,
      networkPolicy: "allow-all",
    });
    const handle = await backend.create({
      templateKey: null,
      sessionKey: `${runId}-shared-session`,
      runtimeContext: { appRoot: process.cwd() },
      tags: { test: "eve-box-adapter", runId },
    });
    const state = await handle.captureState();
    const boxId = String(state.metadata.boxId);
    const session = await handle.useSessionFn({ networkPolicy: "allow-all" });
    await session.removePath({ path: testRoot, recursive: true, force: true });
    await session.run({ command: `mkdir -p ${testRoot}` });
    return { backend, boxId, session };
  })();
  return sharedPromise;
}

realTest("real asciiBox session runs commands and resolves /workspace paths", async () => {
  const { session } = await sharedRealBox();
  assert.equal(session.resolvePath("repo/file.txt"), "/workspace/repo/file.txt");

  await session.run({ command: `mkdir -p ${testRoot}/cmd`, workingDirectory: "." });
  const result = await session.run({
    command: "printf \"$EVE_BOX_TEST:$PWD\" > result.txt && cat result.txt",
    workingDirectory: `${testRoot}/cmd`,
    env: { EVE_BOX_TEST: "real-api" },
  });

  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /^real-api:/);
  assert.match(result.stdout, /workspace/);
  assert.equal(await session.readTextFile({ path: `${testRoot}/cmd/result.txt` }), result.stdout);

  const absoluteWorkspace = await session.run({ command: `cat /workspace/${testRoot}/cmd/result.txt` });
  assert.equal(absoluteWorkspace.exitCode, 0, absoluteWorkspace.stderr);
  assert.equal(absoluteWorkspace.stdout, result.stdout);
});

realTest("real asciiBox session reads, writes, slices, and removes text and binary files", async () => {
  const { session } = await sharedRealBox();
  const textPath = `${testRoot}/files/text.txt`;
  const binaryPath = `${testRoot}/files/binary.dat`;

  await session.writeTextFile({ path: textPath, content: "one\ntwo\nthree\n" });
  assert.equal(await session.readTextFile({ path: `/workspace/${textPath}`, startLine: 2, endLine: 2 }), "two\n");

  await session.writeBinaryFile({ path: binaryPath, content: new Uint8Array([0, 1, 2, 253, 254, 255]) });
  assert.deepEqual([...(await session.readBinaryFile({ path: binaryPath }) ?? [])], [0, 1, 2, 253, 254, 255]);

  await session.removePath({ path: `${testRoot}/files`, recursive: true, force: true });
  assert.equal(await session.readTextFile({ path: textPath }), null);
});

realTest("real asciiBox spawn streams stdout/stderr, waits, and reports exit code", async () => {
  const { session } = await sharedRealBox();
  const proc = await session.spawn({
    command: "printf out; printf err >&2; exit 3",
    workingDirectory: testRoot,
  });

  const [stdout, stderr, exit] = await Promise.all([
    streamToText(proc.stdout),
    streamToText(proc.stderr),
    proc.wait(),
  ]);

  assert.equal(stdout, "out");
  assert.equal(stderr, "err");
  assert.equal(exit.exitCode, 3);
});

realTest("real asciiBox reconnects to the same Box metadata and preserves workspace", async () => {
  const { backend, boxId, session } = await sharedRealBox();
  const markerPath = `${testRoot}/reconnect-marker.txt`;
  await session.writeTextFile({ path: markerPath, content: `box=${boxId}\n` });

  const reconnected = await backend.create({
    templateKey: null,
    sessionKey: `${runId}-reconnected-session`,
    existingMetadata: { boxId },
    runtimeContext: { appRoot: process.cwd() },
  });

  const state = await reconnected.captureState();
  assert.equal(state.metadata.boxId, boxId);
  assert.equal(await reconnected.session.readTextFile({ path: markerPath }), `box=${boxId}\n`);
});

realTest("real asciiBox explicitly rejects unsupported Eve network policies", async () => {
  const { session } = await sharedRealBox();
  await assert.rejects(() => session.setNetworkPolicy("deny-all"), EveBoxUnsupportedError);
});

realTest("BoxHttpClient talks to the same real Box API used by the adapter", async () => {
  const { boxId } = await sharedRealBox();
  const client = new BoxHttpClient({ apiKey });
  const box = await client.get(boxId);
  assert.equal(box.id, boxId);
  assert.match(box.state, /^(ready|idle|running)$/);
});


class FakeForkClient implements BoxClient {
  readonly calls: Array<{ method: string; args: unknown[] }> = [];
  private readonly boxes = new Map<string, BoxInfo>([
    ["bx_template", { id: "bx_template", state: "archived", name: "template" }],
    ["bx_forked", { id: "bx_forked", state: "ready", name: "fork" }],
  ]);

  async create(input: { name?: string; ttlSeconds?: number | null; env?: Record<string, string>; noEnv?: boolean }): Promise<BoxInfo> {
    this.calls.push({ method: "create", args: [input] });
    throw new Error("create should not be called when forkFromBoxId is set");
  }

  async fork(boxId: string, input?: { env?: Record<string, string>; noEnv?: boolean }): Promise<BoxInfo | { id?: string; ok: boolean }> {
    this.calls.push({ method: "fork", args: [boxId, input] });
    assert.equal(boxId, "bx_template");
    return { id: "bx_forked", ok: true };
  }

  async get(boxId: string): Promise<BoxInfo> {
    this.calls.push({ method: "get", args: [boxId] });
    const box = this.boxes.get(boxId);
    if (!box) throw new Error(`missing fake box ${boxId}`);
    return box;
  }

  async update(boxId: string, input: { name?: string; ttlSeconds?: number | null }): Promise<BoxInfo> {
    this.calls.push({ method: "update", args: [boxId, input] });
    const current = await this.get(boxId);
    const updated = { ...current, ...input };
    this.boxes.set(boxId, updated);
    return updated;
  }

  async stop(boxId: string): Promise<BoxInfo | { ok: boolean }> {
    this.calls.push({ method: "stop", args: [boxId] });
    return { ok: true };
  }

  async resume(boxId: string): Promise<BoxInfo | { ok: boolean }> {
    this.calls.push({ method: "resume", args: [boxId] });
    return { ok: true };
  }

  async command(boxId: string, input: { command: string; cwd?: string; timeoutMs?: number; env?: Record<string, string>; signal?: AbortSignal }): Promise<CommandResult> {
    this.calls.push({ method: "command", args: [boxId, input] });
    return { exitCode: 0, stdout: "", stderr: "" };
  }

  async readFile(): Promise<string> {
    return "";
  }

  async writeFile(): Promise<void> {}
}

test("asciiBox forks a prepared source box for new Eve sessions", async () => {
  const client = new FakeForkClient();
  const backend = asciiBox({
    client,
    forkFromBoxId: "bx_template",
    name: (input) => `eve-${input.sessionKey}`,
    ttlSeconds: 900,
    noEnv: true,
    env: { EVE_SCOPED_TOKEN: "secret" },
  });

  const handle = await backend.create({
    templateKey: null,
    sessionKey: "forked-session",
    runtimeContext: { appRoot: process.cwd() },
  });

  const state = await handle.captureState();
  assert.equal(state.metadata.boxId, "bx_forked");
  assert.deepEqual(client.calls.find((call) => call.method === "fork"), {
    method: "fork",
    args: ["bx_template", { env: { EVE_SCOPED_TOKEN: "secret" }, noEnv: true }],
  });
  assert.deepEqual(client.calls.find((call) => call.method === "update"), {
    method: "update",
    args: ["bx_forked", { name: "eve-forked-session", ttlSeconds: 900 }],
  });
  assert.equal(client.calls.some((call) => call.method === "create"), false);
});
