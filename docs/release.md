# Releasing `@asciidev/eve-box`

This package ships on npm as the public scoped package `@asciidev/eve-box`. The source lives in the public [`ariana-dot-dev/eve-box`](https://github.com/ariana-dot-dev/eve-box) repository.

Publish from a maintainer's local computer. Do **not** publish from an agent or CI unless release automation is added later.

## First public npm release

From a fresh local checkout of `main`:

```bash
# 1. Update the local checkout.
git checkout main
git pull --ff-only origin main

# 2. Verify npm auth. If this fails, run `npm login` and then retry `npm whoami`.
npm whoami
npm ping

# 3. Install exactly from the lockfile.
npm ci

# 4. Run the real Box-backed Eve adapter tests.
# Use a real key from the Box dashboard/API keys tab.
# These are the Eve correctness tests; they require BOX_API_KEY and use one shared Box with ttlSeconds=300.
export BOX_API_KEY=box_your_real_key_here
npm run test:eve-box

# 5. Build the package artifacts.
npm run build

# 6. Packaging safety check only: inspect package contents without publishing.
# This is not an Eve correctness test.
npm pack --dry-run

# 7. Packaging safety check only: exercise npm publish validation without publishing.
# This is not an Eve correctness test.
npm publish --dry-run --access public

# 8. Publish the first public scoped version.
npm publish --access public

# 9. Confirm npm now serves the released version.
npm view @asciidev/eve-box version
```

Notes:

- Keep the package name exactly `@asciidev/eve-box` (all lowercase), matching npm scoped-package rules and the `package.json` name.
- The first publish of a scoped package must include `--access public`; `publishConfig.access` is also set to `public` as a safeguard.
- The Eve correctness step is only `npm run test:eve-box` with a real `BOX_API_KEY`. Do not present `npm pack --dry-run`, `npm publish --dry-run`, or any generic test command as Eve correctness evidence.
- The Eve adapter tests are `test/eve-box-backend.test.ts`; they require `BOX_API_KEY`, create one shared Box with `ttlSeconds: 300`, and use no fake Box client, mocks, stubs, or dry-run path.
- Never commit a real `BOX_API_KEY`. Keep it in a git-ignored `.env` or your shell environment only.
- Do not rotate secrets, change live infrastructure, or run live migrations as part of the release.
- If `npm view @asciidev/eve-box version` returns a version before the first publish, choose a new unpublished semver version in `package.json` before publishing.
