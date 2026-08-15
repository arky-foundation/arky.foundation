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

## The `@arky/core` dependency

`site/` depends on `@arky/core` as `file:../packages/core`, and the verify page
imports it in a client script. That package's `package.json` points `main` and
`exports` at `./dist/index.js`, but `packages/core/dist/` is gitignored — so a
fresh clone (which is exactly what Cloudflare builds from) has the source but
no built output.

`bun run build` therefore does three steps in order, and the order matters:

```
build:core     build packages/core, producing its dist/
bun install    re-link, so site/node_modules picks up that dist/
astro build    build the site
```

The middle step is not redundant. Bun **copies** `file:` dependencies into
`node_modules` rather than symlinking them, so the copy is a snapshot taken at
install time. Installing before `dist/` exists yields a copy without it, and
building the source afterwards does not update that copy — the site build then
fails with `Rolldown failed to resolve import "@arky/core"`.

A build failure leaves the previous deploy serving, so this fails quietly:
the site stays up on stale content rather than showing an error.

To verify a change will actually deploy, build from a clean clone, never from
your working tree (which has a stale `dist/` lying around that masks the
problem):

```sh
git clone <repo> /tmp/deploycheck && cd /tmp/deploycheck/site
bun install && bun run build
```

## Build output

Astro is configured with `output: "static"` (`astro.config.mjs`), no SSR adapter.
Cloudflare Pages serves `site/dist/` as plain static assets.

`site/dist/` and `site/node_modules/` are gitignored and rebuilt by Cloudflare on
every deploy.
