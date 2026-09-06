#!/bin/sh
# Full build on start and after every change under content/. Full builds, not
# --watch: the theme indexes search once per watch process, and a full build
# per change keeps search current after every post.
set -eu
: "${SITE_URL:?SITE_URL is required}"
printf '{"url":"%s","indiekit":"%s"}\n' "$SITE_URL" "$SITE_URL" > /tmp/site.url.json
export SITE_FIXTURE="/config/site.json,/tmp/site.url.json"
build() {
	npx @11ty/eleventy --quiet --output=/site/_site && echo "site: built $(date -u +%FT%TZ)"
}
build
while inotifywait -q -r -e close_write,create,delete,move,moved_to /site/content >/dev/null 2>&1; do
	sleep 2
	build || echo "site: build failed, keeping the previous output"
done
