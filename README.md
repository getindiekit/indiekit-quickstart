# indiekit-quickstart

Clone this repo, run `./bootstrap` and `docker compose up`, and you have an
IndieWeb site running the
[Indiekit reference Eleventy theme](https://github.com/getindiekit/indiekit-theme-eleventy)
with [Indiekit](https://getindiekit.com/) behind it, over HTTPS, on any
Docker host.

## Two steps

1. Clone with the theme submodule:

   ```sh
   git clone --recurse-submodules https://github.com/getindiekit/indiekit-quickstart
   cd indiekit-quickstart
   ```

2. Answer a few questions, then start:

   ```sh
   ./bootstrap
   docker compose up -d
   ```

   `bootstrap` asks for your site URL, a password for the admin interface, and
   who you are. It writes `.env` (filling in `.env.example`, generating the
   signing secret and hashing your password) and `site.json` (filling in
   `site.example.json` with your answers). It never overwrites either without
   `--force`.

   Open `SITE_URL` for your site, and `SITE_URL/posts` to write. To set it up
   without a terminal, set `INDIEKIT_PASSWORD` (and optionally
   `INDIEKIT_SITE_URL` and `INDIEKIT_AUTHOR_NAME`) and run `./bootstrap` from
   a script. Passing `INDIEKIT_PASSWORD` inline on the command line puts it in
   your shell history — export it in the script instead.

   Until `ghcr.io/getindiekit/indiekit:beta` is published (see below),
   `./bootstrap` needs to know to use the locally-built image too:

   ```sh
   COMPOSE_FILE=compose.yml:compose.local.yml ./bootstrap
   COMPOSE_FILE=compose.yml:compose.local.yml docker compose up -d
   ```

## Before the image is published

`ghcr.io/getindiekit/indiekit:beta` is what `compose.yml` expects. Until it's
published — or to test a local build of it — build the image yourself and
point the stack at it with the local override:

```sh
docker build -t indiekit:local /path/to/getindiekit/indiekit
docker compose -f compose.yml -f compose.local.yml up -d
```

`compose.local.yml` swaps the `indiekit` service's image for `indiekit:local`
and changes nothing else.

## Post from a client

Indiekit speaks [Micropub](https://micropub.spec.indieweb.org/), so any
Micropub client works, not just the built-in editor. Sign in to a client with
your `SITE_URL` and it will discover the endpoints on its own.

## Update

```sh
git pull --recurse-submodules
docker compose up -d --build
```

## Where things live

- `content/` is yours: one directory per post type (`articles`, `bookmarks`,
  `likes`, `notes`, `photos`, `replies`) and `media` for uploads. Indiekit
  writes there; the site is built from there. Back it up.
- `site/` is the theme (a git submodule). Customise your site through
  `site.json` here, or through the theme's own `_data/site.json` keys — see
  the [theme README](https://github.com/getindiekit/indiekit-theme-eleventy#readme)
  for the full list.
- The built site itself lives in a Docker volume, not on disk — it's
  regenerated from `content/` and the theme on every start and after every
  change.

## Local try-out

To run this on your own machine with no domain and no certificate, accept
`bootstrap`'s default site URL — `http://quickstart.localhost` — by pressing
Enter at the first question. It derives `SITE_HOST` from whatever you answer,
so the two can never disagree.

Any name ending in `.localhost` resolves to your machine in browsers and on
most systems, and unlike plain `localhost` it can also be reached from inside
the Indiekit container, which sign-in needs.

If port 80 or 443 is already taken, set `HTTP_PORT` / `HTTPS_PORT` in `.env`
after bootstrapping, and give `bootstrap` a site URL carrying the same port
(e.g. `http://quickstart.localhost:8088` with `HTTP_PORT=8088`).

## Demo

To see the theme with content before you have any, set `DEMO=1` in `.env`
(with the local try-out values above) and start the stack. The theme's
sample posts are copied into `content/`, the site builds with the theme's
demo identity and sample webmentions, and `site.json` is left unread. Posting
still works: sign in at `SITE_URL/posts` and your note appears next to the
samples.

Back to your own site: set `DEMO=0`, delete `content/*/fixture-*`, and
restart the `site` service. With `DEMO=0` the samples are hidden even if
the files are still there.

## Development

### Running the tests

```sh
COMPOSE_FILE=compose.yml:compose.local.yml node test/kit.mjs
```

There is no `package.json` and nothing to install: the checks use Node's
built-ins only, so Docker stays the single prerequisite.

`COMPOSE_FILE` is needed until `ghcr.io/getindiekit/indiekit:beta` is
published. Two checks start a real container — one hashes a password and
verifies the hash, the other runs `bootstrap` in a fresh clone — so build
`indiekit:local` first, as "Before the image is published" describes. Without
it those checks fail on the image, not on your change.

The suite is idempotent: run it twice in a row and `git status` should be
clean both times. If it is not, something wrote into the working tree that
should have used a temporary directory.

### How `bootstrap` is put together

`bootstrap` is the command; `bootstrap.lib.mjs` holds the parts with no
input, output or Docker in them — generating the secret, deriving the host
from the URL, rendering `.env` and `site.json`. That split is what lets the
checks assert them directly, without a terminal or a container. Logic worth
testing belongs in the library; prompts, files and subprocesses belong in the
command.

Every prompt goes through the `ask` and `askList` helpers. They own two things
that are easy to get wrong separately: falling back to the default when there
is no terminal, and turning Ctrl-D into a clean exit rather than a stack
trace. Add a prompt by calling them — a bare `rl.question` reintroduces both
bugs.

### `site.example.json`

The pristine copy of `site.json`, and **the baseline `bootstrap` compares
against** to decide whether you have customised your identity. It is not a
file to edit. If it drifts from the shipped `site.json`, every fresh clone
looks "already edited", `bootstrap` declines to write identity, and the site
publishes with no h-card — silently. Change `site.json` and `site.example.json`
together, or not at all.

## Images

The stack runs four images. Two are stock, two are Indiekit's:

| Image | Size |
|---|---|
| `ghcr.io/getindiekit/indiekit:beta` | 718 MB when built locally from the pull request that adds it; not yet published |
| `site` (built from `site.Dockerfile`) | 488 MB, of which the `node:24-alpine` base is 234MB and the theme's dependencies 175 MB |
| `mongo:8` | stock image |
| `caddy:2-alpine` | stock image |
