import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import test from "node:test";
import { createVisualOnboardingRouter } from "./visualOnboarding.js";

function createFakeModels() {
  const households = {
    "house-1": { _id: "house-1", ownerUserId: "owner-1" },
    "house-2": { _id: "house-2", ownerUserId: "owner-2" }
  };
  const records = new Map();
  const keyFor = ({ householdId, flowVersion }) => `${householdId}:${flowVersion}`;
  const householdModel = {
    findById(id) {
      return { select() { return this; }, lean: async () => households[String(id)] || null };
    }
  };
  const progressModel = {
    findOne(filter) {
      return { lean: async () => records.get(keyFor(filter)) || null };
    },
    findOneAndUpdate(filter, update, options) {
      return {
        lean: async () => {
          const key = keyFor(filter);
          let record = records.get(key);
          const matches = record
            && record.revision === filter.revision
            && filter.status.$in.includes(record.status);
          if (!matches) {
            if (record || !options.upsert || filter.revision !== 0) return null;
            record = {
              ...update.$setOnInsert,
              status: "not_started",
              currentStep: 0,
              responses: {},
              revision: 0,
              createdAt: new Date("2026-01-01T00:00:00.000Z")
            };
          }
          record = { ...record, responses: { ...record.responses } };
          for (const [path, value] of Object.entries(update.$set)) {
            if (path.startsWith("responses.")) {
              record.responses[path.slice("responses.".length)] = value;
            } else {
              record[path] = value;
            }
          }
          record.revision += update.$inc.revision;
          record.updatedAt = new Date("2026-01-01T00:01:00.000Z");
          records.set(key, record);
          return structuredClone(record);
        }
      };
    }
  };
  return { householdModel, progressModel };
}

async function withServer(run) {
  const { householdModel, progressModel } = createFakeModels();
  const app = express();
  app.use(express.json());
  app.use("/visual", createVisualOnboardingRouter({
    householdModel,
    progressModel,
    authMiddleware(req, _res, next) {
      const [role, userId, householdId] = (req.headers["x-test-user"] || "owner:owner-1:house-1").split(":");
      req.kitchenUser = { _id: userId, role };
      req.user = { id: userId, role, householdId };
      next();
    }
  }));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}/visual`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("visual onboarding routes resume drafts, isolate households, and enforce owner access", async () => {
  await withServer(async (baseUrl) => {
    const initial = await fetch(`${baseUrl}/state`);
    assert.equal(initial.status, 200);
    assert.deepEqual((await initial.json()).onboarding, {
      householdId: "house-1",
      flowVersion: 1,
      status: "not_started",
      currentStep: 0,
      responses: {},
      revision: 0,
      createdAt: null,
      updatedAt: null
    });

    const saved = await fetch(`${baseUrl}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: 0, currentStep: 3, responses: { weekSelection: "next_week" } })
    });
    assert.equal(saved.status, 200);
    const savedState = (await saved.json()).onboarding;
    assert.equal(savedState.status, "in_progress");
    assert.equal(savedState.revision, 1);
    assert.equal(savedState.responses.weekSelection, "next_week");

    const answerUpdated = await fetch(`${baseUrl}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: 1, responses: { weekSelection: "current_week" } })
    });
    assert.equal(answerUpdated.status, 200);
    const answerState = (await answerUpdated.json()).onboarding;
    assert.equal(answerState.currentStep, 3, "partial answers must preserve the current step");
    assert.equal(answerState.revision, 2);

    const resumed = await fetch(`${baseUrl}/state`);
    assert.equal((await resumed.json()).onboarding.currentStep, 3);

    const stale = await fetch(`${baseUrl}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: 0, currentStep: 4 })
    });
    assert.equal(stale.status, 409);

    const skipped = await fetch(`${baseUrl}/skip`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: 2 })
    });
    assert.equal(skipped.status, 200);
    const skippedState = (await skipped.json()).onboarding;
    assert.equal(skippedState.status, "skipped");
    assert.equal(skippedState.currentStep, 3);
    assert.equal(skippedState.responses.weekSelection, "current_week");

    const member = await fetch(`${baseUrl}/state`, { headers: { "x-test-user": "member:member-1:house-1" } });
    assert.equal(member.status, 403);
    const secondHousehold = await fetch(`${baseUrl}/state`, { headers: { "x-test-user": "owner:owner-2:house-2" } });
    assert.equal((await secondHousehold.json()).onboarding.status, "not_started");

    const forbiddenField = await fetch(`${baseUrl}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: 3, householdId: "house-1", currentStep: 5 })
    });
    assert.equal(forbiddenField.status, 400);
  });
});
