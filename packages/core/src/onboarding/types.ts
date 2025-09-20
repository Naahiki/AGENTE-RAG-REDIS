// packages/core/src/onboarding/types.ts
export type UserProfile = {
  company_size?: string;
  sector?: string;
  objective?: string;
};

export type OnboardingStatus =
  | { state: "done"; answered: string[]; missing: string[] }
  | { state: "ask"; field: keyof UserProfile; answered: string[]; missing: string[] };

export type OnboardingInput = {
  profile: Partial<UserProfile>;
  required: (keyof UserProfile)[];
  minAnswers: number;
  maxQuestions: number;
  askedRecentlyCount: number; // heurística anti-bucle
  expecting?: keyof UserProfile | null;
  onlyInScope?: boolean;
  inScope?: boolean; // si decides condicionarlo por scope
};
