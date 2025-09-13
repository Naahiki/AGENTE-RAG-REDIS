export interface AgentInput {
  userId: string;
  chatId: string;
  message: string;
}

export interface AgentOutput {
  type: "cached" | "generated";
  content: string;
  sources?: string[];
  toolCalls?: any[];
}
