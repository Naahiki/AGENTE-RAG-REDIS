// packages/core/src/onboarding/types.ts
export type UserProfile = {
  company_size?: string;  // texto libre
  sector?: string;        // texto libre
  objective?: string;     // texto libre
};

export type OnboardingCheckResult =
  | { shouldAsk: false }
  | { shouldAsk: true; missingField: keyof UserProfile; prompt: string; hint?: string };
