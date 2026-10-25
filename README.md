# cf-worker-mta-sts

Cloudflare Worker that serves [MTA-STS](https://www.rfc-editor.org/rfc/rfc8461) policies at
`https://mta-sts.<domain>/.well-known/mta-sts.txt` for every domain stored in Workers KV.

## Policies

Each domain is a key in the `KV_DOMAIN` namespace (lowercase, no `mta-sts.` prefix) whose value is JSON:

```json
{ "mode": "enforce", "mx": ["mail.example.com", "*.example.net"], "max_age": 604800 }
```

- `mode`: `enforce`, `testing` or `none`
- `mx`: hostnames, optionally with a leading `*.`; required unless `mode` is `none`
- `max_age`: optional, seconds (0–31557600), defaults to 604800 (one week)

An invalid value returns a 500 and logs the reason.

Changes to an existing domain's value take effect without a redeploy, but KV can take a minute or more to
reach every Cloudflare location. Wait at least two minutes after editing a value before changing the domain's
`_mta-sts` DNS TXT `id`. Otherwise a sender that re-fetches straight away can get the old policy and cache it
for up to `max_age`.

## Development

```sh
npm ci
npm run lint
npm test
npm start   # wrangler dev with a local KV namespace
```

## Deployment

`.github/workflows/ci.yml` runs the linter and tests on every push and pull request. Pushes to `main` also deploy
to the `prd` GitHub environment, which needs the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
and the variable `KV_NAMESPACE_ID` (the id of the `KV_DOMAIN` namespace).
The API token needs these permissions:

- Entire account:
  - Account Settings Read
  - Workers KV Storage Read
  - Workers Admin
- Zones:
  - Workers Routes Write

Workers Admin lets the deploy create the worker when it doesn't exist yet, and covers deploying an existing
one, so Workers Editor isn't needed.

The deploy job adds the KV binding and one custom-domain route per key to `wrangler.toml`, then runs
`wrangler deploy --env prd`. Routes are only generated at deploy time, so a domain newly added to KV isn't
served until the next push to `main` (or a re-run of the latest workflow run on `main`).
