# Eve sandbox coverage example

Exercises every documented Eve `SandboxSession` capability and `SandboxBackend`
lifecycle step against a real Ascii Box, using the **published**
`@asciidev/eve-box` package. One Box is created and reused for all checks.

```bash
npm install
BOX_API_KEY=box_... npm start
```

It prints a `PASS` / `FAIL` / `LIMITATION` line per documented behavior and a
summary. `LIMITATION` marks contract behavior the Box backend does not yet
support.
