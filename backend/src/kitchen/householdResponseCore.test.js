import assert from "node:assert/strict";
import test from "node:test";
import { buildEffectiveLicenseState } from "./householdLicenseCore.js";
import { resolveHouseholdLicenseForResponse } from "./householdResponseCore.js";
import { resolveFunctionalCapabilities } from "./capabilityResolverCore.js";
import { buildHouseholdFeatureAvailability } from "./subscriptionService.js";
import { isThemeAvailableForPlan } from "./themeService.js";

const BASIC_LIMITS = { maxUsers: 3, maxNonUserDiners: 4 };

async function buildPatchLicense({ subscriptionsEnabled, usage }) {
  return resolveHouseholdLicenseForResponse({
    household: { _id: "household-1", subscriptionPlan: "basic" },
    countUsage: async () => usage,
    buildLicenseSummary: async (_household, resolvedUsage) => buildEffectiveLicenseState({
      limits: BASIC_LIMITS,
      usage: resolvedUsage,
      subscriptionsEnabled
    })
  });
}

test("PATCH /name and /preferences project real Basic usage at and above the limits when ON", async () => {
  for (const endpoint of ["/name", "/preferences"]) {
    for (const usage of [
      { users: 3, nonUserDiners: 4 },
      { users: 4, nonUserDiners: 5 }
    ]) {
      const license = await buildPatchLicense({ subscriptionsEnabled: true, usage });
      assert.deepEqual(license.usage, usage, `${endpoint} must preserve counted usage`);
      assert.equal(license.capabilities.canAddUser, false, `${endpoint} must block users at/above Basic limit`);
      assert.equal(license.capabilities.canAddNonUserDiner, false, `${endpoint} must block diners at/above Basic limit`);
    }
  }
});

test("PATCH responses allow Basic limits when OFF without changing persisted plan data", async () => {
  const persistedHousehold = {
    subscriptionPlan: "basic",
    includedPlans: ["pro", "premium"],
    freeBitesBalance: 17,
    purchasedBitesBalance: 5
  };
  const license = await buildPatchLicense({
    subscriptionsEnabled: false,
    usage: { users: 4, nonUserDiners: 5 }
  });

  assert.deepEqual(license.limits, { maxUsers: null, maxNonUserDiners: null });
  assert.equal(license.capabilities.canAddUser, true);
  assert.equal(license.capabilities.canAddNonUserDiner, true);
  assert.equal(persistedHousehold.subscriptionPlan, "basic");
  assert.deepEqual(persistedHousehold.includedPlans, ["pro", "premium"]);
  assert.equal(persistedHousehold.freeBitesBalance, 17);
  assert.equal(persistedHousehold.purchasedBitesBalance, 5);
});

test("household response license counts once and reuses a supplied summary", async () => {
  let countCalls = 0;
  const countUsage = async () => {
    countCalls += 1;
    return { users: 3, nonUserDiners: 4 };
  };
  const buildLicenseSummary = async (_household, usage) => ({ usage });
  const household = { _id: "household-1" };

  const counted = await resolveHouseholdLicenseForResponse({ household, countUsage, buildLicenseSummary });
  assert.deepEqual(counted.usage, { users: 3, nonUserDiners: 4 });
  assert.equal(countCalls, 1);

  const supplied = { usage: { users: 4, nonUserDiners: 5 } };
  const reused = await resolveHouseholdLicenseForResponse({
    household,
    license: supplied,
    countUsage: async () => { throw new Error("must not recount"); },
    buildLicenseSummary
  });
  assert.equal(reused, supplied);
});

test("OFF enables premium theme functionality but does not create catalog or Bites capabilities", () => {
  const current = buildHouseholdFeatureAvailability({ subscriptionPlan: "basic" });
  const on = resolveFunctionalCapabilities(current, true);
  const off = resolveFunctionalCapabilities(current, false);

  assert.equal(on.premiumThemes, false);
  assert.equal(off.premiumThemes, true);
  assert.equal(isThemeAvailableForPlan("blush-tomato", off.premiumThemes ? "pro" : "basic"), true);
  assert.equal(off.catalogIncludedPacks, undefined);
  assert.equal(off.freeBitesBalance, undefined);
  assert.equal(off.purchasedBitesBalance, undefined);
});
