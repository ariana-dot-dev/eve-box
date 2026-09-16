# @asciidev/eve-box

Box is now Boat (boat.dev). Package names are unchanged.

Eve sandbox backend for [Boat](https://boat.dev). Run your Eve sandboxes on Boat: the backend maps Eve's filesystem and process operations onto the Boat API.

New to Eve or Boat? The **[zero-to-one guide](https://docs.boat.dev/integrations/eve)** walks through the whole setup from scratch.

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

- `apiKey`: Boat API key. Defaults to `process.env.BOX_API_KEY`.
- `baseUrl`: Boat API base URL. Defaults to the public Boat API.
- `name`: name (or `(input) => string`) for sandboxes Eve creates.
- `ttlSeconds`: auto-archive TTL for sandboxes. Defaults to `3600`.
- `noEnv`: withhold your Boat account's secrets and credentials from every sandbox (see below). Defaults to `false`.
- `env`: per-sandbox environment variables for every sandbox Eve creates (see below).
- `pollMs`: poll cadence for `spawn()` streams and `wait()`.
- `commandTimeoutMs`: timeout for blocking `run()` commands.
- `networkPolicy`: see below.

### Running agents for other people

By default a sandbox inherits **your** Boat account (your secrets, secret files, GitHub-credentialed repos, and SSH identity). That is fine for your own agents, unsafe for ones other people drive. For any multi-tenant or public agent, set `noEnv: true` so sandboxes get none of that and are confined to themselves.

A no-env sandbox starts empty, so you give it exactly what it needs: secrets through `env`, files and setup through Eve's `onSession` hook:

```ts
import { defineSandbox } from "eve/sandbox";
import { asciiBox } from "@asciidev/eve-box";

export default defineSandbox({
  backend: asciiBox({
    apiKey: process.env.BOX_API_KEY!,
    noEnv: true,
    // Scoped secrets, the only env this sandbox gets:
    env: { MY_APP_TOKEN: process.env.MY_APP_TOKEN! },
  }),
  async onSession({ use }) {
    const sandbox = await use();
    // Seed files and run setup with the session API. These wrap Boat's
    // file and command APIs, so you don't need `boat scp` or `boat ssh`.
    await sandbox.writeTextFile({ path: "config/app.json", content: JSON.stringify({ mode: "prod" }) });
    await sandbox.run({ command: "git clone https://github.com/acme/public-repo . && npm ci" });
  },
});
```

`env` keys merge over account variables (per-sandbox wins; ≤100 vars, 64KB total; reserved Boat-internal names rejected). `writeFile`/`readFile` move bytes in and out and `run`/`spawn` execute commands, the Eve-native equivalents of `boat scp` and `boat ssh <id> <cmd>`. A no-env sandbox can't reach your private repos, so clone public ones or have the user authenticate inside the sandbox.

### Network policies

Boat does not yet support Eve's fine-grained network policies. The backend accepts `"allow-all"` and throws `EveBoxUnsupportedError` for stricter policies, so you don't get a false sense of isolation. Use Eve's Vercel or microsandbox backends if you need firewall-backed policies.

## Documentation

- **[Eve on Boat guide](https://docs.boat.dev/integrations/eve)**: a self-contained, zero-to-one walkthrough.
- [`docs/eve-box-backend.md`](./docs/eve-box-backend.md): full capability mapping and current limitations.

## Development

```bash
npm install
cp .env.example .env   # add your BOX_API_KEY
npm test
```

## License

MIT
