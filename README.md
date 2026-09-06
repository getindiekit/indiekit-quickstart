# indiekit-quickstart

Clone this repo, edit two files, run `docker compose up`, set a password, and
you have an IndieWeb site running the
[Indiekit reference Eleventy theme](https://github.com/getindiekit/indiekit-theme-eleventy)
with [Indiekit](https://getindiekit.com/) behind it, over HTTPS, on any
Docker host.

## Five steps

1. Clone with the theme submodule and make somewhere for your posts to live:

   ```sh
   git clone --recurse-submodules https://github.com/getindiekit/indiekit-quickstart
   cd indiekit-quickstart
   ```

2. Edit `site.json`: your site's name, description, timezone and author.

3. Copy the env file and fill it in:

   ```sh
   cp .env.example .env
   ```

   Set `SITE_URL` (your domain, e.g. `https://example.com`), `SITE_HOST` (the
   same domain without the scheme, e.g. `example.com`), `SECRET` (any long
   random string), and `UID_GID` (`id -u`, `id -g` — so files written under
   `content/` belong to you, not root).

4. Start the stack and open your site:

   ```sh
   docker compose up -d
   ```

   Then open `SITE_URL` in a browser. The first build of the site takes a few
   seconds after the containers start; if you see a 404, wait and refresh.

5. Set your password and post something:

   Open `SITE_URL/auth/new-password`, choose a password, and copy the hash
   it gives you into `PASSWORD_SECRET` in `.env`. Then:

   ```sh
   docker compose up -d indiekit
   ```

   Sign in at `SITE_URL/session/login`, post a note, and see it on your
   homepage.

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

To run this on your own machine with no domain and no certificate, set
`SITE_URL=http://quickstart.localhost` and `SITE_HOST=quickstart.localhost`
in `.env`. Any name ending in `.localhost` resolves to your machine in
browsers and on most systems, and unlike plain `localhost` it can also be
reached from inside the Indiekit container, which sign-in needs. If port 80
or 443 is already taken, set `HTTP_PORT` / `HTTPS_PORT` in `.env` to
something free and put that port in `SITE_URL` too
(e.g. `SITE_URL=http://quickstart.localhost:8088`, `HTTP_PORT=8088`).

## Images

Three images make up the stack, alongside stock `mongo:8` and `caddy:2-alpine`:

| Image | Size |
|---|---|
| `ghcr.io/getindiekit/indiekit:beta` | not yet published |
| `site` (built from `site.Dockerfile`) | Measured in the proof: see below. |
| `caddy:2-alpine` | stock image |
