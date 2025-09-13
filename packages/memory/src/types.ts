export type TurnItem = {
  ts: number;
  user: string;
  assistant: string;
  meta?: {
    sources?: string[];
    retrieval?: { topK?: number; ids?: (string | number)[] };
    [k: string]: any;
  };
};

export type Message = { role: "user" | "assistant"; content: string };
