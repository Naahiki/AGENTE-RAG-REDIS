export const guardrailMsgs = {
  LLM_TIMEOUT: `No he podido generar la respuesta completa con el modelo. Te dejo lo más útil que hay en las fuentes oficiales y, si quieres, afinamos con tu perfil (tamaño de empresa, sector y objetivo).`,
  RAG_EMPTY: `No he encontrado ayudas que encajen. Para afinar, dime tamaño de empresa, sector y objetivo (p. ej., contratar / invertir / digitalizar / energía / internacionalizar).`,
  OUT_OF_SCOPE: `Puedo ayudarte con ayudas del Gobierno de Navarra. Si buscas algo distinto, dime y te indico por dónde seguir.`,
  VAGUE_QUERY: `Para recomendar bien, necesito: tamaño de empresa, sector y objetivo. ¿Me los das?`,
  URL_STRIPPED_SUFFIX: `\n\n(He limpiado referencias no verificadas; abajo solo verás fuentes mostradas).`,
  GREETING: `¡Hola! 👋 Puedo ayudarte a encontrar ayudas del Gobierno de Navarra. Cuéntame tu caso o el nombre de una ayuda; si quieres afinar: tamaño de empresa, sector y objetivo.`
} as const;
