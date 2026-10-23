import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "src/kitchen/guidedTourService.test.js", "src/kitchen/capabilityResolver.test.js", "src/kitchen/householdResponseCore.test.js", "src/stab001.test.js"],
  { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "test" }, stdio: "inherit" }
);

process.exit(result.status ?? 1);
