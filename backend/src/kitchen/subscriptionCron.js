import { Household } from "./models/Household.js";
import { applyAdminSubscriptionDeactivation } from "./subscriptionService.js";

export async function deactivateExpiredSubscriptions() {
  try {
    const now = new Date();
    const expired = await Household.find({
      subscriptionStatus: "active",
      subscriptionEndsAt: { $lt: now, $ne: null }
    }).select("_id subscriptionPlan subscriptionEndsAt");

    for (const household of expired) {
      const plan = household.subscriptionPlan;
      applyAdminSubscriptionDeactivation(household);
      await household.save({ validateBeforeSave: false });
      console.log("[cron] Subscription expired — deactivated", {
        householdId: household._id.toString(),
        plan,
        subscriptionEndsAt: household.subscriptionEndsAt
      });
    }

    if (expired.length > 0) {
      console.log(`[cron] Deactivated ${expired.length} expired subscription(s)`);
    }
  } catch (err) {
    console.error("[cron] Error deactivating expired subscriptions", { error: err.message });
  }
}
