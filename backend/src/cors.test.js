import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedDevNetlifyOrigin, isDevEnvironment } from "./corsPolicy.js";

test("DEV environment detection is explicit and production-safe", () => {
  assert.equal(isDevEnvironment({ NODE_ENV: "development", APP_ENV: "development" }), true);
  assert.equal(isDevEnvironment({ NODE_ENV: "development", APP_ENV: "production" }), false);
  assert.equal(isDevEnvironment({ NODE_ENV: "production", APP_ENV: "development" }), false);
  assert.equal(isDevEnvironment({ NODE_ENV: "production", APP_ENV: "production" }), false);
  assert.equal(isDevEnvironment({ NODE_ENV: "test", APP_ENV: "test" }), false);
});

test("only the exact HTTPS Homefirst DEV hosts are allowed", () => {
  const allowed = [
    "https://homefirst-dev.netlify.app",
    "https://homefirst-dev.netlify.app/",
    "https://deploy-preview-14--homefirst-dev.netlify.app",
    "https://deploy-preview-999--homefirst-dev.netlify.app/"
  ];
  for (const origin of allowed) assert.equal(isAllowedDevNetlifyOrigin(origin), true, origin);

  const rejected = [
    "http://homefirst-dev.netlify.app",
    "https://deploy-preview-x--homefirst-dev.netlify.app",
    "https://deploy-preview-14--homefirst-dev.netlify.app.evil.example",
    "https://deploy-preview-14--homefirst-dev.netlify.app.evil",
    "https://foo.homefirst-dev.netlify.app",
    "https://other.netlify.app",
    "https://homefirst-dev.netlify.app:443",
    "https://homefirst-dev.netlify.app/path",
    "https://homefirst-dev.netlify.app?x=1"
  ];
  for (const origin of rejected) assert.equal(isAllowedDevNetlifyOrigin(origin), false, origin);
});
