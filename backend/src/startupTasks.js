export function startStartupTasks({
  seedOnboardingChallenges,
  seedOnboardingSuggestions,
  seedWeeklyChallengeDefs,
  seedOnboardingRecipe,
  deactivateExpiredSubscriptions,
  setIntervalFn = setInterval,
  logError = (scope, error) => console.error(scope, error.message)
}) {
  seedOnboardingChallenges().catch((error) => logError("[onboarding] Seed failed:", error));
  seedOnboardingSuggestions().catch((error) => logError("[onboarding] Suggestions seed failed:", error));
  seedWeeklyChallengeDefs().catch((error) => logError("[weekly] Seed failed:", error));
  seedOnboardingRecipe().catch((error) => logError("[guided-tour] Recipe seed failed:", error));
  deactivateExpiredSubscriptions();
  setIntervalFn(deactivateExpiredSubscriptions, 60 * 60 * 1000);
}
