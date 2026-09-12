import { randomBytes } from "node:crypto";

/**
 * A signing key for JWTs. Random, never derived from the password: it signs
 * auth tokens, so anyone able to reproduce it could mint them.
 * @returns {string} 64 hexadecimal characters
 */
export const generateSecret = () => randomBytes(32).toString("hex");

/**
 * The host part of the site URL, for the container's extra_hosts entry
 * @param {string} siteUrl - The site's full URL
 * @returns {string} Hostname without port, since extra_hosts needs a bare hostname
 */
export const deriveSiteHost = (siteUrl) => new URL(siteUrl).hostname;

/**
 * Fill the env template, keeping its comments: they explain each key, and a
 * newcomer reads this file more often than the README.
 * @param {string} template - Contents of .env.example
 * @param {object} values - One property per key to set
 * @returns {string} Contents for .env
 */
/**
 * Escape a value so Docker Compose passes it to the container unchanged
 *
 * Compose treats `$` in a .env value as the start of a variable reference and
 * substitutes it away. A bcrypt hash is full of them: `$2b$10$FzWT…` reaches
 * the container as `$2b$10/…`, several characters shorter and matching no
 * password anyone could type. Doubling each `$` is how Compose is told to
 * mean the character itself.
 *
 * Kept separate from `renderEnv`, which writes what it is given: only values
 * Compose will interpolate need this, and the caller knows which those are.
 * @param {string} value - Raw value
 * @returns {string} Value safe to write into .env
 */
export const escapeForCompose = (value) => String(value).replaceAll("$", "$$$$");

export const renderEnv = (template, values) => {
  let output = template;

  for (const [key, value] of Object.entries(values)) {
    const line = new RegExp(`^${key}=.*$`, "m");
    output = line.test(output)
      ? output.replace(line, () => `${key}=${value}`)
      : `${output.trimEnd()}\n${key}=${value}\n`;
  }

  return output;
};

/**
 * Fill the site.json template. Parsed and re-serialised rather than patched as
 * text, so the result is valid JSON whatever the answers contain.
 * @param {string} template - Contents of site.json
 * @param {object} answers - Identity answers
 * @returns {string} Contents for site.json
 */
export const renderSiteJson = (template, answers) => {
  const site = JSON.parse(template);

  site.name = answers.name;
  site.description = answers.description;
  site.timezone = answers.timezone;
  site.author = {
    name: answers.authorName,
    url: answers.authorUrl,
    note: answers.authorNote,
    me: answers.authorMe,
  };

  return `${JSON.stringify(site, undefined, 2)}\n`;
};
