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
 * @returns {string} Host, including a port when one is given
 */
export const deriveSiteHost = (siteUrl) => new URL(siteUrl).host;

/**
 * Fill the env template, keeping its comments: they explain each key, and a
 * newcomer reads this file more often than the README.
 * @param {string} template - Contents of .env.example
 * @param {object} values - One property per key to set
 * @returns {string} Contents for .env
 */
export const renderEnv = (template, values) => {
  let output = template;

  for (const [key, value] of Object.entries(values)) {
    const line = new RegExp(`^${key}=.*$`, "m");
    output = line.test(output)
      ? output.replace(line, `${key}=${value}`)
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
