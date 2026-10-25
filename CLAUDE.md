# cf-worker-mta-sts

Cloudflare Worker serving MTA-STS policies (RFC 8461) for every domain stored as a key in Workers KV. See README.md for the KV value format and deployment setup.

## Tech Stack
- JavaScript ES modules on Cloudflare Workers, deployed with wrangler 4
- Workers KV namespace bound as `KV_DOMAIN`; keys are lowercase domains without the `mta-sts.` prefix
- Node 22 in CI; ESLint 10 flat config; tests use Node's built-in `node:test` (no vitest or miniflare)

## Development Commands
- Install: `npm ci`
- Lint: `npm run lint`
- Test: `npm test`
- Bundle check (no Cloudflare credentials needed): `npx wrangler deploy --dry-run --outdir dist`

## Gotchas
- `wrangler.toml` holds only the local-dev KV binding. The `[env.prd]` binding and routes are generated in CI (`.github/workflows/ci.yml:60`) from the `KV_NAMESPACE_ID` environment variable and the namespace's keys. Don't commit an `[env.prd]` section and don't deploy from a local machine; deploys happen only on push to `main`.
- The production worker is `mta-sts-worker-prd` (wrangler's `<name>-<env>`), and the custom domains are attached to it. Renaming `name` or the `prd` environment would deploy a new, empty worker.
- KV values are validated per request by `validatePolicy` (`src/index.js:95`). An invalid value returns 500 rather than a broken policy, so keep that function and README.md's format section in sync.
- The worker reads the raw KV value and parses it itself, so a missing key (404) is distinct from a stored value that isn't a policy (500). Tests call `worker.fetch` directly with a fake KV (`test/index.test.js:8`) that returns raw strings.
- The policy body must use CRLF line endings; the tests assert exact bodies.

## Development Standards

### Git Workflow
- Branch names: `feature/description` or `fix/description`
- Commit messages: Follow conventional commits
- PR required before merge
- All CI/CD checks must pass
- Minimum 1 approval required

### GitHub Actions
- Pin every action to a full commit SHA, with the release tag in a comment:
  `uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`. Never use a tag or branch
  (`@v7`, `@main`), which can be moved to different code
- Look up a release's SHA with `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`, and update the
  SHA and the comment together

### Testing Requirements
- Minimum 80% code coverage
- All critical paths must have tests
