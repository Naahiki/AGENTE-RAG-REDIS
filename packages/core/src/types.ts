export type HandleTurnInput = {
  chatId: string;
  userId?: string | null;   // si lo quieres público, ok
  message: string;
};

export type HandleTurnOutput = {
  type: "cached" | "generated";
  content: string;
  sources?: string[];
  model?: string;
};
