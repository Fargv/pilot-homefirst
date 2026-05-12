import { normalizeSubscriptionPlan } from "./subscriptionService.js";

const CATALOG_MONTHLY_PACK_CREDITS = {
  free: 0,
  basic: 0,
  pro: 1,
  premium: 2
};

export function isPackCurrentlyFree(pack) {
  if (!pack.priceBasic || pack.priceBasic <= 0) return true;
  if (pack.freeUntil && new Date(pack.freeUntil) > new Date()) return true;
  return false;
}

export function getCatalogMonthlyCredits(plan) {
  const normalized = normalizeSubscriptionPlan(plan);
  return CATALOG_MONTHLY_PACK_CREDITS[normalized] ?? 0;
}

export function canClaimPackWithPlan(plan) {
  return getCatalogMonthlyCredits(plan) > 0;
}

export function isPlanIncludedInPack(plan, includedPlans = []) {
  const normalized = normalizeSubscriptionPlan(plan);
  return Array.isArray(includedPlans) && includedPlans.includes(normalized);
}

export function getCurrentClaimMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function getMonthlyCreditsUsed(HouseholdCatalogPack, householdId, claimMonth) {
  return HouseholdCatalogPack.countDocuments({
    householdId,
    claimMonth,
    acquiredVia: "subscription"
  });
}

export async function getMonthlyCreditsRemaining(HouseholdCatalogPack, householdId, plan) {
  const total = getCatalogMonthlyCredits(plan);
  if (total === 0) return 0;
  const claimMonth = getCurrentClaimMonth();
  const used = await getMonthlyCreditsUsed(HouseholdCatalogPack, householdId, claimMonth);
  return Math.max(0, total - used);
}

export async function resolvePackEntitlement(HouseholdCatalogPack, {
  householdId,
  pack,
  subscriptionPlan
}) {
  const existingOwnership = await HouseholdCatalogPack.findOne({ householdId, packId: pack._id }).lean();

  const owned = Boolean(existingOwnership);
  const installed = existingOwnership?.status === "installed";
  const isFree = isPackCurrentlyFree(pack);
  const isFreeUntil = pack.freeUntil && new Date(pack.freeUntil) > new Date() ? pack.freeUntil : null;
  const includedInPlan = isPlanIncludedInPack(subscriptionPlan, pack.includedPlans);
  const creditsRemaining = await getMonthlyCreditsRemaining(HouseholdCatalogPack, householdId, subscriptionPlan);
  const canClaimWithPlan = includedInPlan && creditsRemaining > 0 && !owned;
  const requiresPurchase = !isFree && !owned && !canClaimWithPlan;

  return {
    owned,
    installed,
    isFree,
    isFreeUntil,
    includedInPlan,
    creditsRemaining,
    canClaimWithPlan,
    requiresPurchase,
    priceBasic: pack.priceBasic
  };
}
