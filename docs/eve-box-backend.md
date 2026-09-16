# Eve sandbox backend for Boat

Box is now Boat (boat.dev). Package names are unchanged.

`@asciidev/eve-box` exports an Eve `SandboxBackend` factory for running Eve sandboxes on Boat (`boat.dev` / the Boat public API).

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

- `create`/resume: creates a Boat sandbox through the v1 API, or reconnects to `metadata.boxId` from Eve's persisted session state.
- `create` uses Boat v1 `ttlSeconds`; set `ttlSeconds: 300` for five-minute test sandboxes or your desired app retention window.
- `run`: maps to `POST /sandboxes/{sandboxId}/commands` with `cwd` as a relative path inside the sandbox work directory, per the current Boat API.
- `spawn`: starts a background shell process in the sandbox and exposes `stdout`, `stderr`, `wait()`, and `kill()` by polling files in `.eve-spawn/`.
- `readTextFile`/`writeTextFile`: map Eve `/workspace/...` paths to Boat file API paths relative to the sandbox work directory (`workspace/...`).
- `readBinaryFile`/`writeBinaryFile`: use Boat `base64` file encoding via the current Boat v1 API when the client provides binary methods; otherwise fall back to UTF-8.
- `removePath`: maps to `rm` inside the sandbox workspace.
- `resolvePath`: anchors relative paths to `/workspace`, matching Eve's sandbox contract.

## Sandboxes for other people: `noEnv` and `env`

By default a sandbox inherits the creating account (secrets, secret files, GitHub-credentialed repos, SSH identity). That is right for your own agents, unsafe for agents other people drive. For any multi-tenant or public agent, set `noEnv: true`: the sandbox gets none of that and is confined to itself. Forks of a no-env sandbox are always no-env.

A no-env sandbox starts empty, so you provision exactly what it needs: secrets through `env`, files and setup through Eve's `onSession` (or `bootstrap` for templates):

```ts
export default defineSandbox({
  backend: asciiBox({
    apiKey: process.env.BOX_API_KEY!,
    noEnv: true,
    env: { MY_APP_TOKEN: process.env.MY_APP_TOKEN! }, // scoped secrets, the only env this sandbox gets
  }),
  async onSession({ use }) {
    const sandbox = await use();
    // The session API wraps Boat's file and command APIs, so no `boat scp` / `boat ssh` is needed.
    await sandbox.writeTextFile({ path: "config/app.json", content: JSON.stringify({ mode: "prod" }) });
    await sandbox.run({ command: "git clone https://github.com/acme/public-repo . && npm ci" });
  },
});
```

- `env`: per-sandbox variables, merged over account variables (per-sandbox wins). At most 100 variables, 64KB total; reserved Boat-internal names are rejected. With `noEnv: true` this is the only way to give a sandbox a secret.
- Use `writeFile`/`writeTextFile`/`writeBinaryFile` and `readFile` to move files in and out, and `run`/`spawn` to execute, the Eve-native equivalents of `boat scp` and `boat ssh <id> <cmd>`.
- A no-env sandbox can't reach your private repos; clone public ones or have the user authenticate inside the sandbox.

## Current gaps

Boat does not expose Eve's fine-grained network policies. The backend accepts `"allow-all"` and throws `EveBoxUnsupportedError` for stricter policies (`"deny-all"`, allow-lists, subnet rules) so applications do not get a false sense of isolation.

Template prewarming replays your seed files and bootstrap code when each session's sandbox is created, rather than cloning a prebuilt snapshot. If you want fast clones of a fully prepared environment, fork a sandbox directly with the Boat API: set it up, stop it so its snapshot completes, then fork it. The clone keeps the whole filesystem.

## Tests

The test suite runs against a live Boat sandbox and requires `BOX_API_KEY`:

```bash
cp .env.example .env   # add your BOX_API_KEY
npm test
```

It covers command execution and `/workspace` path resolution, text/binary file read/write/slice/remove, `spawn()` streaming and exit codes, reconnecting to an existing sandbox, and network-policy handling.

## Publishing

Release instructions for the first public npm version of `@asciidev/eve-box` live in [`release.md`](./release.md).
