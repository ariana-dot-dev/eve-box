# @asciidev/eve-box

Eve sandbox backend for [Ascii Box](https://ascii.dev). Run your Eve sandboxes on Box — the backend maps Eve's filesystem and process operations onto the Box API.

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
- `pollMs` — poll cadence for `spawn()` streams and `wait()`.
- `commandTimeoutMs` — timeout for blocking `run()` commands.
- `networkPolicy` — see below.

### Network policies

Box does not yet support Eve's fine-grained network policies. The backend accepts `"allow-all"` and throws `EveBoxUnsupportedError` for stricter policies, so you don't get a false sense of isolation. Use Eve's Vercel or microsandbox backends if you need firewall-backed policies.

## Documentation

See [`docs/eve-box-backend.md`](./docs/eve-box-backend.md) for the full capability mapping and current limitations.

## Development

```bash
npm install
cp .env.example .env   # add your BOX_API_KEY
npm test
```

## License

MIT
