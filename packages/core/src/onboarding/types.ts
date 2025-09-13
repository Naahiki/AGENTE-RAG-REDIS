export type UserProfile = {
  company_size?: string;  // texto libre
  sector?: string;        // texto libre
  objective?: string;     // texto libre
};

export type OnboardingCheckResult =
  | { shouldAsk: false }
  | {
      shouldAsk: true;
      missingField: keyof UserProfile;
      prompt: string;     // pregunta al usuario
      hint?: string;      // pista opcional (no opciones fijas)
    };
