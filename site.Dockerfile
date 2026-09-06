# Builds the site with Eleventy, once on start and again after every change
# under content/. A builder by nature: Eleventy and its tooling ARE the job,
# so there is no smaller runtime stage to split out. Kept light: alpine, one
# apk package, no cache.
#
# The theme's package-lock.json is gitignored in the theme repo, so there is
# no lockfile to COPY here; npm install resolves fresh each build.
FROM node:24-alpine
RUN apk add --no-cache inotify-tools
WORKDIR /site
COPY site/package.json ./
RUN npm install --no-audit --no-fund && npm cache clean --force
COPY site/ ./
COPY site.entrypoint.sh /usr/local/bin/site-entrypoint
RUN chmod +x /usr/local/bin/site-entrypoint && chown -R node:node /site
# The container runs as whatever uid compose gives it (UID_GID), which is not
# the image's node user, so the two places Eleventy writes are made
# world-writable: the build output (a named volume, seeded from this
# directory mode included, and only ever mounted read-only elsewhere) and
# Eleventy's image cache.
RUN mkdir -p /site/_site /site/.cache && chmod 1777 /site/_site /site/.cache
USER node
ENTRYPOINT ["site-entrypoint"]
