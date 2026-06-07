import { Household } from "./models/Household.js";
import { applyAdminSubscriptionDeactivation } from "./subscriptionService.js";

export async function deactivateExpiredSubscriptions() {
  try {
    const now = new Date();

    // Path 1: Stripe-paid subscriptions whose billing period has ended
    const expired = await Household.find({
      subscriptionStatus: "active",
      subscriptionEndsAt: { $lt: now, $ne: null }
    }).select("_id subscriptionPlan subscriptionEndsAt pendingDowngradeAt");

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

    // Path 2: Admin-granted subscriptions with a pending downgrade request
    // (subscriptionEndsAt is null for these so path 1 never catches them)
    const pendingDowngrades = await Household.find({
      subscriptionStatus: "active",
      subscriptionEndsAt: null,
      pendingDowngradeAt: { $lte: now, $ne: null }
    }).select("_id subscriptionPlan pendingDowngradeAt pendingDowngradeReason");

    for (const household of pendingDowngrades) {
      const plan = household.subscriptionPlan;
      applyAdminSubscriptionDeactivation(household);
      await household.save({ validateBeforeSave: false });
      console.log("[cron] Admin-granted subscription downgraded on request", {
        householdId: household._id.toString(),
        plan,
        pendingDowngradeAt: household.pendingDowngradeAt
      });
    }

    if (pendingDowngrades.length > 0) {
      console.log(`[cron] Applied ${pendingDowngrades.length} pending admin-granted downgrade(s)`);
    }
  } catch (err) {
    console.error("[cron] Error deactivating expired subscriptions", { error: err.message });
  }
}
