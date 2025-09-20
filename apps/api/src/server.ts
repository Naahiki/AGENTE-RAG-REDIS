// apps/api/src/server.ts
import "./boot";

import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { handleTurn } from "@agent-rag/core";
import adminRouter from "./admin/router";
import { buildIntroMessage } from "./intro";

const app = express();

app.use(cors({ origin: process.env.WEB_ORIGIN || true }));
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 30 }));

app.get("/intro", async (req, res) => {
  try {
    const chatId = String(req.query.chatId || "");
    if (!chatId) return res.status(400).json({ error: "chatId es obligatorio" });
    const out = await buildIntroMessage(chatId);
    res.json(out);
  } catch (e: any) {
    console.error("[/intro] error:", e);
    res.status(500).json({ error: "internal_error", detail: e?.message || String(e) });
  }
});

app.post("/chat", async (req, res) => {
  try {
    const { chatId, message } = req.body || {};
    if (!chatId || typeof message !== "string") {
      return res.status(400).json({ error: "chatId y message son obligatorios" });
    }
    if (message === "__INIT__") {
      const msg = await buildIntroMessage(chatId);
      return res.json({ type: "generated", content: msg.content, sources: msg.sources || [] });
    }
    const out = await handleTurn({ chatId, message });
    return res.json(out);
  } catch (e: any) {
    console.error("[/chat] error:", e);
    return res.status(500).json({ error: "internal_error", detail: e?.message || String(e) });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use(adminRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
