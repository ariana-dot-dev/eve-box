# @asciidev/eve-box

Eve sandbox backend for [Ascii Box](https://box.ascii.dev). Run your Eve sandboxes on Box — the backend maps Eve's filesystem and process operations onto the Box API.

New to Eve or Box? The **[zero-to-one guide](https://docs.ascii.dev/box/integrations/eve)** walks through the whole setup from scratch.

## Install

```bash
npm install @asciidev/eve-box eve
```

## Usage

```ts
import { defineSandbox } from "eve/sandbox";
import { asciiBox } from "@asciidev/eve-box";

export default defineSandbox({
  backend: asciiBox({ apiKey: process.env.BOX_API_KEY! }),
});
```

### Options

`asciiBox(options)` accepts:

- `apiKey` — Box API key. Defaults to `process.env.BOX_API_KEY`.
- `baseUrl` — Box API base URL. Defaults to the public Box API.
- `name` — name (or `(input) => string`) for boxes Eve creates.
- `ttlSeconds` — auto-archive TTL for boxes. Defaults to `3600`.
- `forkFromBoxId` — source Box id to fork for each new Eve session. Prepare the source once, stop it so its snapshot completes, then every session starts from an independent clone.
- `noEnv` — withhold your Box account's secrets and credentials from every box (see below). Defaults to `false`.
- `env` — per-box environment variables for every box Eve creates (see below).
- `pollMs` — poll cadence for `spawn()` streams and `wait()`.
- `commandTimeoutMs` — timeout for blocking `run()` commands.
- `networkPolicy` — see below.

### Running agents for other people

By default a box inherits **your** Box account (your secrets, secret files, GitHub-credentialed repos, and SSH identity) — fine for your own agents, unsafe for ones other people drive. For any multi-tenant or public agent, set `noEnv: true` so boxes get none of that and are confined to themselves.

A no-env box starts empty, so you give it exactly what it needs — secrets through `env`, files and setup through Eve's `onSession` hook:

```ts
import { defineSandbox } from "eve/sandbox";
import { asciiBox } from "@asciidev/eve-box";

export default defineSandbox({
  backend: asciiBox({
    apiKey: process.env.BOX_API_KEY!,
    noEnv: true,
    // Scoped secrets — the only env this box gets:
    env: { MY_APP_TOKEN: process.env.MY_APP_TOKEN! },
  }),
  async onSession({ use }) {
    const sandbox = await use();
    // Seed files and run setup with the session API. These wrap Box's
    // file and command APIs, so you don't need `box scp` or `box ssh`.
    await sandbox.writeTextFile({ path: "config/app.json", content: JSON.stringify({ mode: "prod" }) });
    await sandbox.run({ command: "git clone https://github.com/acme/public-repo . && npm ci" });
  },
});
```

`env` keys merge over account variables (per-box wins; ≤100 vars, 64KB total; reserved Box-internal names rejected). `writeFile`/`readFile` move bytes in and out and `run`/`spawn` execute commands — the Eve-native equivalents of `box scp` and `box ssh <id> <cmd>`. A no-env box can't reach your private repos, so clone public ones or have the user authenticate inside the box.

### Reusing a prepared Box snapshot

For faster startup across many Eve sessions, prepare one Box by installing dependencies or cloning repositories, then stop it so Box creates a snapshot. Pass that source Box id as `forkFromBoxId`; each new Eve session forks a fresh independent Box from the snapshot and then reconnects Eve to `/workspace`.

```ts
import { defineSandbox } from "eve/sandbox";
import { asciiBox } from "@asciidev/eve-box";

export default defineSandbox({
  backend: asciiBox({
    apiKey: process.env.BOX_API_KEY!,
    forkFromBoxId: process.env.EVE_BOX_TEMPLATE_ID!,
    name: ({ sessionKey }) => `eve-${sessionKey}`,
    ttlSeconds: 1800,
    noEnv: true,
    env: { MY_APP_TOKEN: process.env.MY_APP_TOKEN! },
  }),
});
```

The source Box must have a completed snapshot (`snapshotAvailable: true`). Forking copies the filesystem, not running processes, so start app servers or workers again in Eve setup if you need them.

### Network policies

Box does not yet support Eve's fine-grained network policies. The backend accepts `"allow-all"` and throws `EveBoxUnsupportedError` for stricter policies, so you don't get a false sense of isolation. Use Eve's Vercel or microsandbox backends if you need firewall-backed policies.

## Documentation

- **[Eve on Box guide](https://docs.ascii.dev/box/integrations/eve)** — a self-contained, zero-to-one walkthrough.
- [`docs/eve-box-backend.md`](./docs/eve-box-backend.md) — full capability mapping and current limitations.

## Development

```bash
npm install
cp .env.example .env   # add your BOX_API_KEY
npm test
```

## License

MIT
