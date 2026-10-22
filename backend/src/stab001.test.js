import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { app } from "./index.js";
import { parseCleanupFlags } from "./cleanupCommand.js";
import { applyMigration, preflightMigration } from "./dbStructureMigration.js";
import { parseMigrationFlags } from "../scripts/migrate-db-structure.js";
import { startStartupTasks } from "./startupTasks.js";

function fakeCollection({ indexes = [], emailDocs = [], weekDuplicates = [], createError = null } = {}) {
  const calls = [];
  let currentIndexes = indexes.map((index) => ({ ...index }));
  let currentCreateError = createError;
  return {
    calls,
    setCreateError(error) { currentCreateError = error; },
    async indexes() { calls.push(["indexes"]); return currentIndexes.map((index) => ({ ...index })); },
    find() { return { project: () => ({ toArray: async () => emailDocs }) }; },
    aggregate() { calls.push(["aggregate"]); return { toArray: async () => weekDuplicates }; },
    async updateMany(...args) { calls.push(["updateMany", ...args]); },
    async dropIndex(name) {
      calls.push(["dropIndex", name]);
      currentIndexes = currentIndexes.filter((index) => index.name !== name);
    },
    async createIndex(...args) {
      calls.push(["createIndex", ...args]);
      if (currentCreateError) throw currentCreateError;
      const [key, options] = args;
      currentIndexes.push({ name: Object.entries(key).map(([field, direction]) => `${field}_${direction}`).join("_"), key, ...options });
      return "created";
    },
    async countDocuments() { return 0; }
  };
}

function fakeDb(collections) {
  return { collection(name) { return collections[name]; } };
}

test("STAB-001: test email endpoints are not exposed", async (t) => {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  const { port } = server.address();
  for (const route of ["/api/email/test", "/api/test-email"]) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "should-not-send@example.com" })
    });
    assert.equal(response.status, 404, `${route} must not be registered`);
  }
});

test("STAB-001: migration flags require exactly one explicit mode", () => {
  assert.throws(() => parseMigrationFlags([]), /exactamente un modo/);
  assert.throws(() => parseMigrationFlags(["--apply", "--dry-run"]), /mutuamente excluyentes/);
  assert.equal(parseMigrationFlags(["--dry-run"]).mode, "dry-run");
  assert.equal(parseMigrationFlags(["--apply"]).mode, "apply");
});

test("STAB-001: cleanup flags require exactly one mode and confirmation for writes", () => {
  assert.throws(() => parseCleanupFlags([]), /exactamente un modo/);
  assert.throws(() => parseCleanupFlags(["--apply", "--dry-run"]), /mutuamente excluyentes/);
  assert.throws(() => parseCleanupFlags(["--apply"]), /confirmación explícita/);
  assert.equal(parseCleanupFlags(["--dry-run"]).mode, "dry-run");
  assert.equal(parseCleanupFlags(["--apply", "--confirm"]).mode, "apply");
});

test("STAB-001: preflight aborts on normalized email duplicates without writes", async () => {
  const users = fakeCollection({ emailDocs: [{ _id: "a", email: " A@EXAMPLE.COM " }, { _id: "b", email: "a@example.com" }] });
  const db = fakeDb({ kitchenusers: users, kitchenweekplans: fakeCollection(), kitchenshoppinglists: fakeCollection() });
  const plan = await preflightMigration(db);
  assert.equal(plan.ok, false);
  assert.equal(plan.conflicts[0].type, "duplicate-normalized-email");
  assert.deepEqual(users.calls, [["indexes"]]);
});

test("STAB-001: preflight detects duplicate null/empty values and week keys", async () => {
  const users = fakeCollection({ emailDocs: [{ _id: "a", email: null }, { _id: "b", email: null }] });
  const weeks = fakeCollection({ weekDuplicates: [{ _id: { householdId: "h", weekStart: "w" }, ids: ["a", "b"] }] });
  const db = fakeDb({ kitchenusers: users, kitchenweekplans: weeks, kitchenshoppinglists: fakeCollection() });
  const plan = await preflightMigration(db);
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.conflicts.map((item) => item.type).sort(), ["duplicate-empty-email", "duplicate-week-plan-key"]);
  assert.equal(users.calls.some(([name]) => name === "updateMany"), false);
  assert.equal(weeks.calls.some(([name]) => name === "dropIndex"), false);
});

test("STAB-001: conflicting index options are reported exactly", async () => {
  const users = fakeCollection({ indexes: [{ name: "email_1", key: { email: 1 }, unique: false }] });
  const db = fakeDb({ kitchenusers: users, kitchenweekplans: fakeCollection(), kitchenshoppinglists: fakeCollection() });
  const plan = await preflightMigration(db);
  const report = plan.indexReports.find((item) => item.collectionName === "kitchenusers");
  assert.deepEqual(report.incompatibleIndexes, [{
    name: "email_1", key: { email: 1 }, options: { unique: false }, unknownOptions: []
  }]);
});

test("STAB-001: desired index and legacy index are both reported and reconciled", async () => {
  const weeks = fakeCollection({ indexes: [
    { name: "householdId_1_weekStart_1", key: { householdId: 1, weekStart: 1 }, unique: true, partialFilterExpression: { householdId: { $exists: true } } },
    { name: "weekStart_1", key: { weekStart: 1 }, unique: true }
  ] });
  const db = fakeDb({ kitchenusers: fakeCollection(), kitchenweekplans: weeks, kitchenshoppinglists: fakeCollection() });
  const plan = await preflightMigration(db);
  const report = plan.indexReports.find((item) => item.collectionName === "kitchenweekplans");
  assert.equal(report.desiredIndexes.length, 1);
  assert.deepEqual(report.legacyIndexes.map((index) => index.name), ["weekStart_1"]);
  assert.deepEqual(report.incompatibleIndexes, []);
  await applyMigration(db, plan);
  const final = await weeks.indexes();
  assert.deepEqual(final.map((index) => index.name), ["householdId_1_weekStart_1"]);
});

test("STAB-001: failed creation leaves a different-key legacy index intact", async () => {
  const failure = new Error("create failed");
  const weeks = fakeCollection({
    indexes: [{ name: "weekStart_1", key: { weekStart: 1 }, unique: true }],
    createError: failure
  });
  const db = fakeDb({ kitchenusers: fakeCollection(), kitchenweekplans: weeks, kitchenshoppinglists: fakeCollection() });
  const plan = await preflightMigration(db);
  await assert.rejects(() => applyMigration(db, plan), /create failed/);
  assert.deepEqual((await weeks.indexes()).map((index) => index.name), ["weekStart_1"]);
  assert.equal(weeks.calls.some(([name]) => name === "dropIndex"), false);
});

test("STAB-001: functional option differences are incompatible, metadata names are not", async () => {
  const users = fakeCollection({ indexes: [{
    name: "legacy_email_name",
    key: { email: 1 },
    unique: true,
    partialFilterExpression: { email: { $exists: true } },
    collation: { locale: "en", strength: 2 }
  }] });
  const db = fakeDb({ kitchenusers: users, kitchenweekplans: fakeCollection(), kitchenshoppinglists: fakeCollection() });
  const plan = await preflightMigration(db);
  const report = plan.indexReports.find((item) => item.collectionName === "kitchenusers");
  assert.equal(report.incompatibleIndexes.length, 1);
  assert.equal(report.incompatibleIndexes[0].name, "legacy_email_name");
  assert.equal(plan.warnings[0].type, "incompatible-index-options");
});

test("STAB-001: unknown index options abort preflight without writes", async () => {
  const users = fakeCollection({ indexes: [{
    name: "email_1",
    key: { email: 1 },
    unique: true,
    partialFilterExpression: { email: { $exists: true } },
    unknownFutureOption: true
  }] });
  const db = fakeDb({ kitchenusers: users, kitchenweekplans: fakeCollection(), kitchenshoppinglists: fakeCollection() });
  const plan = await preflightMigration(db);
  assert.equal(plan.ok, false);
  assert.equal(plan.conflicts[0].type, "unknown-index-options");
  assert.equal(users.calls.some(([name]) => ["dropIndex", "createIndex", "updateMany"].includes(name)), false);
});

test("STAB-001: IndexOptionsConflict is accepted only after exact reinspection", async () => {
  const conflict = Object.assign(new Error("options differ"), { codeName: "IndexOptionsConflict" });
  const weeks = fakeCollection({
    indexes: [{ name: "weekStart_1", key: { weekStart: 1 }, unique: true }],
    createError: conflict
  });
  const db = fakeDb({ kitchenusers: fakeCollection(), kitchenweekplans: weeks, kitchenshoppinglists: fakeCollection() });
  const plan = await preflightMigration(db);
  await assert.rejects(() => applyMigration(db, plan), /Conflicto de índice no resuelto/);
  assert.equal(weeks.calls.filter(([name]) => name === "createIndex").length, 1);
  assert.equal(weeks.calls.filter(([name]) => name === "indexes").length, 2);
});

test("STAB-001: same-key replacement requires maintenance and can recover after a post-drop failure", async () => {
  const failure = new Error("create failed after drop");
  const weeks = fakeCollection({
    indexes: [{ name: "old_week_index", key: { householdId: 1, weekStart: 1 }, unique: false }],
    createError: failure
  });
  const db = fakeDb({ kitchenusers: fakeCollection(), kitchenweekplans: weeks, kitchenshoppinglists: fakeCollection() });
  const plan = await preflightMigration(db);
  await assert.rejects(() => applyMigration(db, plan), /maintenance-window/);
  await assert.rejects(() => applyMigration(db, plan, { allowSameKeyReplacement: true }), /create failed after drop/);
  assert.deepEqual(await weeks.indexes(), []);
  weeks.setCreateError(null);
  const retryPlan = await preflightMigration(db);
  await applyMigration(db, retryPlan);
  assert.equal((await weeks.indexes()).length, 1);
});

test("STAB-001: apply drops legacy only after preflight and recreates exact indexes", async () => {
  const users = fakeCollection({
    indexes: [{ name: "email_1", key: { email: 1 }, unique: false }],
    emailDocs: [{ _id: "a", email: "" }]
  });
  const weeks = fakeCollection({ indexes: [{ name: "weekStart_1", key: { weekStart: 1 }, unique: true }] });
  const shopping = fakeCollection();
  const db = fakeDb({ kitchenusers: users, kitchenweekplans: weeks, kitchenshoppinglists: shopping });
  const plan = await preflightMigration(db);
  assert.equal(plan.ok, true);
  await applyMigration(db, plan, { allowSameKeyReplacement: true });
  assert.deepEqual(users.calls.map(([name]) => name), ["indexes", "updateMany", "dropIndex", "createIndex", "indexes", "indexes"]);
  assert.deepEqual(weeks.calls.map(([name]) => name), ["indexes", "aggregate", "createIndex", "indexes", "dropIndex", "indexes", "indexes"]);
});

test("STAB-001: startup behavior runs seeds and subscription cron, never cleanup", () => {
  const calls = [];
  const seed = (name) => () => { calls.push(name); return Promise.resolve(); };
  const expire = () => { calls.push("expire"); };
  let scheduled;
  startStartupTasks({
    seedOnboardingChallenges: seed("challenge"),
    seedOnboardingSuggestions: seed("suggestions"),
    seedWeeklyChallengeDefs: seed("weekly"),
    seedOnboardingRecipe: seed("recipe"),
    deactivateExpiredSubscriptions: expire,
    setIntervalFn: (fn, ms) => { scheduled = { fn, ms }; }
  });
  assert.deepEqual(calls.sort(), ["challenge", "expire", "recipe", "suggestions", "weekly"]);
  assert.equal(scheduled.fn, expire);
  assert.equal(scheduled.ms, 60 * 60 * 1000);
});
