// Shared Clerk auth constants used by ClerkAuthPage and ClerkOnboardingPage.
// Centralised here to prevent silent string drift between the two pages.

export const CLERK_STORAGE_INVITE_TOKEN_KEY = "clerk_onboarding_invite_token";
export const CLERK_STORAGE_INVITE_CODE_KEY = "clerk_onboarding_invite_code";
export const CLERK_AFTER_SIGN_UP_PATH = import.meta.env.VITE_CLERK_AFTER_SIGN_UP_URL || "/onboarding/clerk";
