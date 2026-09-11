import { strict as assert } from "node:assert";
import { readFileSync, existsSync, statSync, writeFileSync, unlinkSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

let failed = 0;
const check = (name, fn) => { try { fn(); console.log("ok  ", name); } catch (e) { failed++; console.log("FAIL", name, "-", e.message); } };

// A clean checkout in its own directory: running bootstrap in the repo root
// itself would write a real .env there, breaking a second run of the suite
// and leaving a bcrypt credential in the working tree.
const freshClone = () => {
  const dir = mkdtempSync(join(tmpdir(), "indiekit-quickstart-"));
  const archive = execFileSync("git", ["archive", "HEAD"]);
  execFileSync("tar", ["-x", "-C", dir], { input: archive });
  return dir;
};

// Only what bootstrap actually needs, not the whole ambient environment —
// a stray SITE_HOST or SECRET already exported in the shell could mask a
// regression that a full ...process.env would hide.
//
// COMPOSE_PROJECT_NAME: each freshClone() is a uniquely-named tmpdir, and
// `docker compose run` derives its project (and the network it creates for
// it) from the working directory's name by default. Left unset, every
// bootstrap invocation in this suite would create and leak its own network
// (docker compose run --rm removes the container, not the network) until
// Docker's address pool is exhausted. Pin one project name so they all
// reuse the same network instead.
const minimalEnv = (extra) => ({
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  COMPOSE_PROJECT_NAME: "indiekit-quickstart-kit-test",
  ...extra,
});

check("indiekit.config.js is the theme's, byte for byte", () => {
  assert.equal(readFileSync("indiekit.config.js", "utf8"), readFileSync("site/indiekit.config.js", "utf8"));
});

check("site.json holds identity only; url and indiekit come from SITE_URL", () => {
  const site = JSON.parse(readFileSync("site.json", "utf8"));
  assert.ok(site.name && site.description && site.timezone, "name, description, timezone required");
  assert.ok(!("url" in site) && !("indiekit" in site), "url/indiekit must not be in site.json");
});

check(".env.example names every variable compose.yml reads", () => {
  const compose = readFileSync("compose.yml", "utf8");
  const vars = [...compose.matchAll(/\$\{([A-Z_]+)/g)].map((m) => m[1]);
  const example = readFileSync(".env.example", "utf8");
  for (const v of new Set(vars)) assert.match(example, new RegExp(`^${v}=`, "m"), `${v} missing from .env.example`);
});

check("compose config resolves with the example env", () => {
  const env = Object.fromEntries(readFileSync(".env.example", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
  const out = execFileSync("docker", ["compose", "--env-file", "/dev/null", "-f", "compose.yml", "config"], { env: { ...process.env, ...env, SECRET: "x" }, stdio: "pipe" }).toString();
  for (const svc of ["indiekit:", "mongo:", "site:", "caddy:"]) assert.ok(out.includes(svc), `${svc} missing`);
  assert.equal((out.match(/user: "?1000:1000/g) || []).length, 2, "both writing containers (indiekit, site) must run as UID_GID");
  // The theme's content/ is its Eleventy source as well as the store, so the
  // site container must mount the store one post directory at a time, never
  // the whole directory (that would hide the theme's templates).
  for (const dir of ["articles", "bookmarks", "likes", "notes", "photos", "replies", "media"]) {
    assert.ok(out.includes(`target: /site/content/${dir}`), `site does not mount ./content/${dir}`);
    assert.ok(existsSync(`content/${dir}/.gitkeep`), `content/${dir}/.gitkeep missing: the bind mount would be created root-owned`);
  }
  assert.ok(!/target: \/site\/content\n/.test(out), "site mounts the whole content/ directory over the theme's source");
});

check("Caddyfile serves uploads before proxying the media endpoint, and covers Indiekit's paths", () => {
  const caddy = readFileSync("Caddyfile", "utf8");
  assert.ok(caddy.indexOf("handle @upload") < caddy.indexOf("handle @site_media") && caddy.indexOf("handle @site_media") < caddy.indexOf("reverse_proxy indiekit:3000"), "uploads, then the built site's media, must come before the proxy");
  for (const p of ["/micropub*", "/auth*", "/media*", "/files*", "/image*", "/posts*", "/share*", "/syndicate*", "/webmentions*", "/session*", "/status*", "/assets*", "/id", "/plugins*"]) {
    assert.ok(caddy.includes(p), `Caddyfile does not route ${p}`);
  }
});

check("Caddyfile validates", () => {
  execFileSync("docker", ["run", "--rm", "-v", `${process.cwd()}/Caddyfile:/etc/caddy/Caddyfile:ro`, "-e", "SITE_URL=http://localhost", "caddy:2-alpine", "caddy", "validate", "--config", "/etc/caddy/Caddyfile"], { stdio: "pipe" });
});

check("the README's two steps name only files that exist", () => {
  const readme = readFileSync("README.md", "utf8");
  for (const f of ["site.json", ".env.example", "compose.local.yml"]) assert.ok(readme.includes(f) && existsSync(f), `${f} named and present`);
});

import { generateSecret, deriveSiteHost, renderEnv, renderSiteJson } from "../bootstrap.lib.mjs";

check("generateSecret returns 64 hex characters, different every time", () => {
  const a = generateSecret();
  const b = generateSecret();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b, "two runs produced the same secret");
});

check("deriveSiteHost takes the host from the URL", () => {
  assert.equal(deriveSiteHost("https://example.com"), "example.com");
  assert.equal(deriveSiteHost("http://quickstart.localhost"), "quickstart.localhost");
  // port is dropped because extra_hosts in compose.yml needs a bare hostname
  assert.equal(deriveSiteHost("https://example.com:8443/path"), "example.com");
  assert.throws(() => deriveSiteHost("not a url"));
});

check("renderEnv fills every key and leaves the comments", () => {
  const template = readFileSync(".env.example", "utf8");
  const out = renderEnv(template, {
    SITE_URL: "https://example.com",
    SITE_HOST: "example.com",
    SECRET: "a".repeat(64),
    PASSWORD_SECRET: "$2b$10$hash",
    UID_GID: "1000:1000",
  });
  assert.match(out, /^SITE_URL=https:\/\/example\.com$/m);
  assert.match(out, /^SITE_HOST=example\.com$/m);
  assert.match(out, /^SECRET=a{64}$/m);
  assert.match(out, /^PASSWORD_SECRET=\$2b\$10\$hash$/m);
  assert.match(out, /^UID_GID=1000:1000$/m);
  assert.ok(out.includes("# The one address everything is served from"), "comments were dropped");
  assert.equal(/^[A-Z_]+=$/m.test(out), false, "a key was left empty");
});

check("renderEnv writes values containing $ literally", () => {
  // String.replace treats $&, $$, $` and $' specially in a string
  // replacement. A replacer function does not.
  const out = renderEnv("SECRET=\nSITE_URL=\n", { SECRET: "abc$&def", SITE_URL: "a$`b$'c$$d" });
  assert.match(out, /^SECRET=abc\$&def$/m);
  assert.match(out, /^SITE_URL=a\$`b\$'c\$\$d$/m);
});

check("renderSiteJson writes identity, with rel=me as an array", () => {
  const template = readFileSync("site.json", "utf8");
  const out = renderSiteJson(template, {
    name: "My Site",
    description: "Hello",
    timezone: "Europe/Brussels",
    authorName: "Ada",
    authorUrl: "https://example.com",
    authorNote: "",
    authorMe: ["https://github.com/ada", "https://fosstodon.org/@ada"],
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.name, "My Site");
  assert.equal(parsed.timezone, "Europe/Brussels");
  assert.equal(parsed.author.name, "Ada");
  assert.equal(parsed.author.url, "https://example.com");
  assert.deepEqual(parsed.author.me, ["https://github.com/ada", "https://fosstodon.org/@ada"]);
});

check("bootstrap is executable and refuses to clobber an existing .env", () => {
  assert.ok(statSync("bootstrap").mode & 0o111, "bootstrap is not executable");

  const hadEnv = existsSync(".env");
  const saved = hadEnv ? readFileSync(".env", "utf8") : undefined;
  if (!hadEnv) writeFileSync(".env", "SECRET=existing\n");

  let exitCode = 0;
  try {
    execFileSync("./bootstrap", { stdio: "pipe", env: { ...process.env, INDIEKIT_PASSWORD: "abcdefgh" } });
  } catch (error) {
    exitCode = error.status;
  }

  assert.notEqual(exitCode, 0, "bootstrap overwrote an existing .env");
  if (!hadEnv) unlinkSync(".env"); else writeFileSync(".env", saved);
});

check("the hash bootstrap writes verifies against the password", () => {
  // End to end: a hash of the right shape that fails bcrypt.compare would
  // strand a newcomer at the sign-in screen with nothing to debug.
  // compose.yml interpolates ${SITE_HOST} etc. to parse at all, even for
  // --no-deps on an unrelated service — supply them explicitly so this check
  // does not depend on a .env file already sitting in this working tree.
  const composeEnv = Object.fromEntries(readFileSync(".env.example", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
  const password = "correct horse battery";
  // Password goes on stdin, not argv — /proc/<pid>/cmdline is world-readable.
  const hash = execFileSync(
    "docker",
    ["compose", "run", "--rm", "--no-deps", "-T", "--entrypoint", "node", "indiekit",
     "-e", `let d = "";
process.stdin.on("data", (c) => (d += c));
process.stdin.on("end", () =>
  import("bcrypt").then((m) => m.default.hash(d, 10)).then((h) => process.stdout.write(h)),
);`],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], input: password, env: { ...process.env, ...composeEnv } },
  ).trim();

  assert.match(hash, /^\$2[aby]\$/, "not a bcrypt hash");

  // The hash is not the secret being protected, so it may stay in argv;
  // "--" keeps it from being parsed as a node flag.
  const ok = execFileSync(
    "docker",
    ["compose", "run", "--rm", "--no-deps", "-T", "--entrypoint", "node", "indiekit",
     "-e", `let d = "";
process.stdin.on("data", (c) => (d += c));
process.stdin.on("end", () =>
  import("bcrypt").then((m) => m.default.compare(d, process.argv[1])).then((r) => process.stdout.write(String(r))),
);`,
     "--", hash],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], input: password, env: { ...process.env, ...composeEnv } },
  ).trim();

  assert.equal(ok, "true", "the hash does not verify against its own password");
});

check("bootstrap leaves an edited site.json alone", () => {
  const dir = freshClone();
  try {
    writeFileSync(join(dir, "site.json"), JSON.stringify({ name: "Edited by hand" }, undefined, 2));

    let output = "";
    try {
      output = execFileSync("./bootstrap", {
        cwd: dir,
        encoding: "utf8",
        stdio: "pipe",
        input: "",
        env: minimalEnv({ INDIEKIT_PASSWORD: "abcdefgh", COMPOSE_FILE: "compose.yml:compose.local.yml" }),
      });
    } catch (error) {
      output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    }

    const after = JSON.parse(readFileSync(join(dir, "site.json"), "utf8"));
    assert.equal(after.name, "Edited by hand", "bootstrap overwrote an edited site.json");
    assert.match(output, /site\.json/, "bootstrap did not say it was leaving site.json alone");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

check("bootstrap succeeds on a fresh clone, with no .env yet to supply compose.yml's interpolated variables", () => {
  // A stale .env sitting in this working tree would make compose.yml parse
  // fine and hide the exact bug this check exists to catch: SITE_HOST (and
  // friends) are unset until bootstrap writes .env, and compose.yml needs
  // them just to parse the file, even for --no-deps on an unrelated service.
  const dir = freshClone();
  try {
    assert.ok(!existsSync(join(dir, ".env")), "fresh clone must not already have a .env");

    let output;
    try {
      output = execFileSync("./bootstrap", {
        cwd: dir,
        encoding: "utf8",
        stdio: "pipe",
        input: "",
        env: minimalEnv({ INDIEKIT_PASSWORD: "abcdefgh", COMPOSE_FILE: "compose.yml:compose.local.yml" }),
      });
    } catch (error) {
      throw new Error(`bootstrap failed on a fresh clone:\n${error.stdout ?? ""}${error.stderr ?? ""}`);
    }

    assert.match(output, /Wrote \.env/);
    const env = readFileSync(join(dir, ".env"), "utf8");
    assert.match(env, /^PASSWORD_SECRET=\$2b\$/m, "PASSWORD_SECRET is not a bcrypt hash");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

check("unattended run with no author name warns to stderr but still succeeds", () => {
  // This is exactly the outcome that puts site.json in scope at all: without
  // a name, the h-card, rel=author and the author meta tag are all empty,
  // and a newcomer following the README's unattended path would never know.
  const dir = freshClone();
  try {
    const result = spawnSync("./bootstrap", [], {
      cwd: dir,
      encoding: "utf8",
      input: "",
      env: minimalEnv({ INDIEKIT_PASSWORD: "abcdefgh", COMPOSE_FILE: "compose.yml:compose.local.yml" }),
    });

    assert.equal(result.status, 0, `bootstrap failed unattended:\n${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /no author name set/i, "missing the no-identity warning");

    const site = JSON.parse(readFileSync(join(dir, "site.json"), "utf8"));
    assert.equal(site.author.name, "", "author.name should be empty with no override");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

check("INDIEKIT_AUTHOR_NAME and INDIEKIT_SITE_URL override the unattended identity, no warning", () => {
  const dir = freshClone();
  try {
    const result = spawnSync("./bootstrap", [], {
      cwd: dir,
      encoding: "utf8",
      input: "",
      env: minimalEnv({
        INDIEKIT_PASSWORD: "abcdefgh",
        INDIEKIT_AUTHOR_NAME: "Ada Lovelace",
        INDIEKIT_SITE_URL: "http://example.localhost",
        COMPOSE_FILE: "compose.yml:compose.local.yml",
      }),
    });

    assert.equal(result.status, 0, `bootstrap failed unattended:\n${result.stdout}${result.stderr}`);
    assert.doesNotMatch(result.stderr, /no author name set/i, "warned despite INDIEKIT_AUTHOR_NAME");

    const site = JSON.parse(readFileSync(join(dir, "site.json"), "utf8"));
    assert.equal(site.author.name, "Ada Lovelace");

    const env = readFileSync(join(dir, ".env"), "utf8");
    assert.match(env, /^SITE_URL=http:\/\/example\.localhost$/m);
    assert.match(env, /^SITE_HOST=example\.localhost$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

check("Ctrl-D after the first prompt is handled the same way everywhere: no stack trace, ever", () => {
  // rl.question() rejects the *pending* question with AbortError on Ctrl-D,
  // and also closes rl — every later rl.question() then rejects with
  // ERR_USE_AFTER_CLOSE. That only shows up on a real TTY (a piped stdin
  // never reaches rawQuestion at all, see minimalEnv's neighbours above), so
  // this drives bootstrap over a pty. 'url' proves the first prompt's EOF
  // does not break the next one; 'name' and 'note' are prompts *after* the
  // first, which is the case no other check exercises.
  const crashMarkers = /ERR_USE_AFTER_CLOSE|at \[kQuestion\]|Node\.js v\d/;

  for (const breakAt of ["url", "name", "note"]) {
    const dir = freshClone();
    try {
      const driver = spawnSync("python3", [join(process.cwd(), "test", "pty-eof.py"), dir, breakAt], {
        encoding: "utf8",
        env: minimalEnv({ COMPOSE_FILE: "compose.yml:compose.local.yml" }),
      });
      assert.equal(driver.status, 0, `pty-eof.py driver failed for '${breakAt}':\n${driver.stdout}${driver.stderr}`);

      const { status, output } = JSON.parse(driver.stdout);
      assert.doesNotMatch(output, crashMarkers, `EOF at '${breakAt}' printed a stack trace:\n${output}`);
      assert.notEqual(status, null, `bootstrap never exited after EOF at '${breakAt}'`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

console.log(`\n${failed === 0 ? "all checks passed" : failed + " failed"}`);
process.exit(failed ? 1 : 0);
