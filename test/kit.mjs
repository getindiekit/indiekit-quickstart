import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

let failed = 0;
const check = (name, fn) => { try { fn(); console.log("ok  ", name); } catch (e) { failed++; console.log("FAIL", name, "-", e.message); } };

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
  assert.ok(/user: "?1000:1000/.test(out), "containers do not run as UID_GID");
});

check("Caddyfile serves uploads before proxying the media endpoint, and covers Indiekit's paths", () => {
  const caddy = readFileSync("Caddyfile", "utf8");
  assert.ok(caddy.indexOf("handle_path /media/*") < caddy.indexOf("reverse_proxy indiekit:3000"), "static uploads must come before the proxy");
  for (const p of ["/micropub*", "/auth*", "/media*", "/files*", "/image*", "/posts*", "/share*", "/syndicate*", "/webmentions*", "/session*", "/status*", "/assets*", "/id", "/plugins*"]) {
    assert.ok(caddy.includes(p), `Caddyfile does not route ${p}`);
  }
});

check("Caddyfile validates", () => {
  execFileSync("docker", ["run", "--rm", "-v", `${process.cwd()}/Caddyfile:/etc/caddy/Caddyfile:ro`, "-e", "SITE_URL=http://localhost", "caddy:2-alpine", "caddy", "validate", "--config", "/etc/caddy/Caddyfile"], { stdio: "pipe" });
});

check("the README's five steps name only files that exist", () => {
  const readme = readFileSync("README.md", "utf8");
  for (const f of ["site.json", ".env.example", "compose.local.yml"]) assert.ok(readme.includes(f) && existsSync(f), `${f} named and present`);
});

console.log(`\n${failed === 0 ? "all checks passed" : failed + " failed"}`);
process.exit(failed ? 1 : 0);
