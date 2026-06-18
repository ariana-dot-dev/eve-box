# Eve sandbox backend for Ascii Box

`@asciidev/eve-box` exports an Eve `SandboxBackend` factory for running Eve sandboxes on Ascii Box (`box.ascii.dev` / the Box public API).

Install from npm:

```bash
npm install @asciidev/eve-box eve
```

```ts title="agent/sandbox.ts"
import { defineSandbox } from "eve/sandbox";
import { asciiBox } from "@asciidev/eve-box";

export default defineSandbox({
  backend: asciiBox({
    apiKey: process.env.BOX_API_KEY!,
    ttlSeconds: 3600,
  }),
});
```

Folder layout with seeded files works too:

```ts title="agent/sandbox/sandbox.ts"
import { defineSandbox } from "eve/sandbox";
import { asciiBox } from "@asciidev/eve-box";

export default defineSandbox({
  backend: asciiBox({
    apiKey: process.env.BOX_API_KEY!,
    name: ({ sessionKey }) => `eve-${sessionKey}`,
  }),
  async onSession({ use }) {
    const sandbox = await use({ networkPolicy: "allow-all" });
    await sandbox.writeTextFile({ path: "SESSION.txt", content: `${sandbox.id}\n` });
  },
});
```

## Capability mapping

- `create`/resume: creates a Box through the v1 API, or reconnects to `metadata.boxId` from Eve's persisted session state.
- `create` uses Box v1 `ttlSeconds`; set `ttlSeconds: 300` for five-minute test boxes or your desired app retention window.
- `run`: maps to `POST /boxes/{boxId}/commands` with `cwd` as a relative path inside the Box work directory, per the current Box API.
- `spawn`: starts a background shell process in the Box and exposes `stdout`, `stderr`, `wait()`, and `kill()` by polling files in `.eve-spawn/`.
- `readTextFile`/`writeTextFile`: map Eve `/workspace/...` paths to Box file API paths relative to the Box work directory (`workspace/...`).
- `readBinaryFile`/`writeBinaryFile`: use Box `base64` file encoding via the current Box v1 API when the client provides binary methods; otherwise fall back to UTF-8.
- `removePath`: maps to `rm` inside the Box workspace.
- `resolvePath`: anchors relative paths to `/workspace`, matching Eve's sandbox contract.

## Current gaps

Ascii Box does not expose Eve's fine-grained network policies. The backend accepts `"allow-all"` and throws `EveBoxUnsupportedError` for stricter policies (`"deny-all"`, allow-lists, subnet rules) so applications do not get a false sense of isolation.

Template prewarming replays your seed files and bootstrap code when each session's box is created, rather than cloning a prebuilt snapshot. If you want fast clones of a fully prepared environment, fork a box directly with the Box API: set it up, stop it so its snapshot completes, then fork it — the clone keeps the whole filesystem.

## Tests

The test suite runs against a live Box and requires `BOX_API_KEY`:

```bash
cp .env.example .env   # add your BOX_API_KEY
npm test
```

It covers command execution and `/workspace` path resolution, text/binary file read/write/slice/remove, `spawn()` streaming and exit codes, reconnecting to an existing box, and network-policy handling.

## Publishing

Release instructions for the first public npm version of `@asciidev/eve-box` live in [`release.md`](./release.md).
