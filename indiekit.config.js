import { existsSync } from "node:fs";
import process from "node:process";

// Node reads .env itself; the file is optional and gitignored.
if (existsSync(".env")) {
	process.loadEnvFile();
}

// One post type per directory the theme renders. Paths omit the date because
// the theme's permalinks are /<type>/<slug>/ (content/content.11tydata.js); the
// preset's default path would put the date in the file name and the URL.
const postType = (collection) => ({
	post: { path: `${collection}/{slug}.md`, url: `${collection}/{slug}` },
	media: { path: `media/${collection}/{filename}`, url: `media/${collection}/{filename}` },
});

// Syndicators switch on when their credentials are in the environment. Without
// them each would sit in every post form and fail on use.
const { env } = process;
const bluesky = env.BLUESKY_HANDLE && env.BLUESKY_PASSWORD;
const mastodon = env.MASTODON_URL && env.MASTODON_USER && env.MASTODON_ACCESS_TOKEN;
// Webmention.io's endpoint answers 401 on its admin page without a token, so it
// is gated the same way.
const webmentionIo = env.WEBMENTION_IO_TOKEN;
const internetArchive = env.INTERNET_ARCHIVE_ACCESS_KEY && env.INTERNET_ARCHIVE_SECRET_KEY;

// Runtime comes from the official image (ghcr.io/getindiekit/indiekit) or any
// Indiekit install that mounts this file; the theme itself installs no
// Indiekit package.
export default {
	// Indiekit deep-merges this array onto its defaults by concatenation and
	// instantiates every entry, so a plugin it already loads must not be listed
	// again (it would be installed twice, and the "New post" menu keeps the
	// defaults' order anyway). Already loaded, so absent here: the endpoints
	// auth, files, image, media, micropub, posts, share and syndicate, and the
	// post types article, bookmark, like, note, photo and reply.
	//
	// Not loaded on purpose: endpoint-json-feed (the theme builds /feed.json),
	// the six other stores and the two other presets.
	plugins: [
		"@indiekit/preset-eleventy",
		"@indiekit/store-file-system",
		"@indiekit/post-type-repost",
		"@indiekit/post-type-rsvp",
		"@indiekit/post-type-event",
		"@indiekit/post-type-jam",
		"@indiekit/post-type-audio",
		"@indiekit/post-type-video",
		"@indiekit/post-type-page",
		"@indiekit/endpoint-microsub",
		...(webmentionIo ? ["@indiekit/endpoint-webmention-io"] : []),
		...(bluesky ? ["@indiekit/syndicator-bluesky"] : []),
		...(mastodon ? ["@indiekit/syndicator-mastodon"] : []),
		...(internetArchive ? ["@indiekit/syndicator-internet-archive"] : []),
	],
	// INDIEKIT_LOCALE pins the admin interface's language (en, fr, de, …).
	// Unset, Indiekit follows the browser's Accept-Language, which is what a
	// multilingual author wants and what a screenshot session does not.
	...(env.INDIEKIT_LOCALE && { application: { locale: env.INDIEKIT_LOCALE } }),
	publication: {
		me: process.env.PUBLICATION_URL,
		postTypes: {
			article: postType("articles"),
			bookmark: postType("bookmarks"),
			like: postType("likes"),
			note: postType("notes"),
			photo: postType("photos"),
			reply: postType("replies"),
			repost: postType("reposts"),
			rsvp: postType("rsvps"),
			event: postType("events"),
			jam: postType("jams"),
			audio: postType("audio"),
			video: postType("videos"),
			// A page (/about, /now) is dateless and lives at the root of the site.
			// The file still goes in a directory of its own: the content root is
			// the theme's source, and a deployment mounts the store one directory
			// at a time. Only the URL is the bare slug.
			page: {
				post: { path: "pages/{slug}.md", url: "{slug}" },
				media: { path: "media/pages/{filename}", url: "media/pages/{filename}" },
			},
		},
	},
	"@indiekit/store-file-system": { directory: "./content" },
	// Passwords and tokens are read from the environment by the plugins themselves.
	...(bluesky && { "@indiekit/syndicator-bluesky": { handle: env.BLUESKY_HANDLE } }),
	...(mastodon && { "@indiekit/syndicator-mastodon": { url: env.MASTODON_URL, user: env.MASTODON_USER } }),
};
