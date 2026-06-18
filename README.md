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
- `noEnv` — withhold your Box account's secrets and credentials from every box (see below). Defaults to `false`.
- `env` — per-box environment variables for every box Eve creates (see below).
- `pollMs` — poll cadence for `spawn()` streams and `wait()`.
- `commandTimeoutMs` — timeout for blocking `run()` commands.
- `networkPolicy` — see below.

### Running agents for other people (important)

By default, every box this backend creates inherits **your** Box account: your dashboard environment variables and secret files, your selected repositories (cloned in with your GitHub credentials), and your SSH identity. That is convenient for your own personal agents, but it means **anyone who can drive the agent can read your secrets and act as you on GitHub and your other boxes**.

If your Eve agent is exposed to anyone but you (a multi-tenant or public agent), create boxes with `noEnv: true`. A no-env box gets none of your account secrets, files, credentials, or private repos, and is confined so it cannot act on your account or other boxes:

```ts
import { defineSandbox } from "eve/sandbox";
import { asciiBox } from "@asciidev/eve-box";

export default defineSandbox({
  backend: asciiBox({
    apiKey: process.env.BOX_API_KEY!,
    noEnv: true, // hand boxes to untrusted users safely
    // Give boxes only the secrets they actually need:
    env: { MY_APP_TOKEN: process.env.MY_APP_TOKEN! },
  }),
});
```

`env` injects per-box environment variables (merged over account variables, per-box wins; ≤100 vars, 64KB total; reserved Box-internal names are rejected). With `noEnv: true` it is the only way to give boxes a secret. A no-env box can still SSH, stream a desktop, snapshot, and expose public URLs; it just can't reach private repos — clone public ones, or have the user sign in with their own credentials inside the box.

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
