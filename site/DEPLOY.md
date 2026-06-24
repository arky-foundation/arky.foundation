# Deploy

The Arky static site deploys to **Cloudflare Pages** via the Cloudflare dashboard.
The repository is connected in the Cloudflare Pages UI — there is no CI workflow
and no `wrangler.toml` in this repo by design.

## Cloudflare Pages project settings

| Setting               | Value                        |
|-----------------------|------------------------------|
| Framework preset      | Astro (or `None`)            |
| Build command         | `bun run build`              |
| Build output directory| `dist`                       |
| Root directory        | `site`                       |
| Package manager       | Bun (auto-detected via `bun.lock`) |

If Bun version pinning is needed, set the env var `BUN_VERSION` in the
Cloudflare Pages dashboard.

## Local equivalent

```sh
cd site && bun install && bun run build
# output: site/dist/
```

## Build output

Astro is configured with `output: "static"` (`astro.config.mjs`), no SSR adapter.
Cloudflare Pages serves `site/dist/` as plain static assets.

`site/dist/` and `site/node_modules/` are gitignored and rebuilt by Cloudflare on
every deploy.
