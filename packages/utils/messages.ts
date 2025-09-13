export function buildMessages({ systemPrompt, memoryMessages, contextChunks, userMessage }: any) {
  return [
    { role: "system", content: systemPrompt },
    ...memoryMessages,
    { role: "system", content: `Contexto:\n${contextChunks.map(c => c.text).join("\n\n")}` },
    { role: "user", content: userMessage }
  ];
}
