#!/bin/sh
# Full build on start and after every change under content/. Full builds, not
# --watch: the theme indexes search once per watch process, and a full build
# per change keeps search current after every post.
set -eu
: "${SITE_URL:?SITE_URL is required}"
printf '{"url":"%s","indiekit":"%s"}\n' "$SITE_URL" "$SITE_URL" > /tmp/site.url.json
export SITE_FIXTURE="/config/site.json,/tmp/site.url.json"

# DEMO=1: a showcase anyone can boot. The theme's sample posts are seeded
# into the store from the copy the image keeps (never overwriting a file
# that is already there), sample posts stop being ignored, and the build
# uses the theme's demo identity and demo webmentions instead of site.json.
if [ "${DEMO:-0}" = "1" ]; then
	# File by file: busybox cp -n given a directory skips it whole once the
	# destination directory exists, which every store directory does.
	for d in articles bookmarks likes notes photos replies media; do
		for f in "/site/.demo/$d"/*; do
			[ -e "$f" ] || continue
			[ -e "/site/content/$d/${f##*/}" ] || cp -a "$f" "/site/content/$d/"
		done
	done
	unset THEME_SAMPLE_POSTS
	export WEBMENTIONS_FIXTURE=/site/test/fixtures/webmentions-demo.json
	export SITE_FIXTURE="/site/test/fixtures/site-demo.json,/tmp/site.url.json"
	echo "site: demo mode, sample posts seeded into content/"
fi

# Built into a staging directory inside the output volume, then swapped in
# with one delete and one move, so the page of a deleted post (or of a demo
# sample after DEMO=0) does not linger: Eleventy never removes output files
# it no longer writes. The swap is a few milliseconds on the same filesystem.
OUT=/site/_site
build() {
	rm -rf "$OUT/.next"
	npx @11ty/eleventy --quiet --output="$OUT/.next" || return 1
	find "$OUT" -mindepth 1 -maxdepth 1 ! -name .next -exec rm -rf {} +
	for f in "$OUT/.next"/* "$OUT/.next"/.[!.]*; do
		[ -e "$f" ] && mv "$f" "$OUT/"
	done
	rmdir "$OUT/.next"
	echo "site: built $(date -u +%FT%TZ)"
}

# The first build must succeed: a broken site should fail loudly at start.
build

# Every later change triggers a build. A change that lands while a build is
# running is not seen by inotifywait (it is not watching then), so after each
# build the tree is compared with the build's start time and rebuilt until
# nothing newer remains.
while inotifywait -q -r -e close_write,create,delete,move,moved_to /site/content >/dev/null 2>&1; do
	sleep 2
	touch /tmp/build-start
	build || echo "site: build failed, keeping the previous output"
	while [ -n "$(find /site/content -newer /tmp/build-start -print -quit 2>/dev/null)" ]; do
		touch /tmp/build-start
		sleep 1
		build || echo "site: build failed, keeping the previous output"
	done
done
