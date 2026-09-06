# Builds the site with Eleventy, once on start and again after every change
# under content/. A builder by nature: Eleventy and its tooling ARE the job
# (the theme lists them as devDependencies, so this is a plain npm install),
# and there is no smaller runtime stage to split out. Kept light: alpine, one
# apk package, no npm cache, and every file is put in place already owned by
# node, because a chown -R afterwards would copy all of node_modules into a
# second layer.
#
# The theme's package-lock.json is gitignored in the theme repo, so there is
# no lockfile to COPY here; npm install resolves fresh each build.
FROM node:24-alpine
RUN apk add --no-cache inotify-tools && mkdir /site && chown node:node /site
USER node
WORKDIR /site
COPY --chown=node:node site/package.json ./
RUN npm install --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node site/ ./
COPY --chmod=755 site.entrypoint.sh /usr/local/bin/site-entrypoint
# The container runs as whatever uid compose gives it (UID_GID), which is not
# the image's node user, so the two places Eleventy writes are made
# world-writable: the build output (a named volume, seeded from this
# directory mode included, and only ever mounted read-only elsewhere) and
# Eleventy's image cache.
RUN mkdir -p /site/_site /site/.cache && chmod 1777 /site/_site /site/.cache
ENTRYPOINT ["site-entrypoint"]
