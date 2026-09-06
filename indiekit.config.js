import { existsSync } from "node:fs";
import process from "node:process";

// Node reads .env itself; the file is optional and gitignored.
if (existsSync(".env")) {
	process.loadEnvFile();
}

// One post type per directory the theme renders. Paths omit the date because
// the theme's permalinks are /<type>/<slug>/ (content/*/*.11tydata.js); the
// preset's default path would put the date in the file name and the URL.
const postType = (collection) => ({
	post: { path: `${collection}/{slug}.md`, url: `${collection}/{slug}` },
	media: { path: `media/${collection}/{filename}`, url: `media/${collection}/{filename}` },
});

// Runtime comes from the official image (ghcr.io/getindiekit/indiekit) or any
// Indiekit install that mounts this file; the theme itself installs no
// Indiekit package.
export default {
	plugins: ["@indiekit/preset-eleventy", "@indiekit/store-file-system"],
	publication: {
		me: process.env.PUBLICATION_URL,
		postTypes: {
			article: postType("articles"),
			bookmark: postType("bookmarks"),
			like: postType("likes"),
			note: postType("notes"),
			photo: postType("photos"),
			reply: postType("replies"),
		},
	},
	"@indiekit/store-file-system": { directory: "./content" },
};
