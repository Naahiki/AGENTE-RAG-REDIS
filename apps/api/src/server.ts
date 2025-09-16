// apps/api/src/server.ts
import * as dotenv from "dotenv";
import "./boot";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { handleTurn } from "@agent-rag/core";
import adminRouter from "./admin/router"; // 👈 default import

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.WEB_ORIGIN || true }));
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 30 }));

// chat (si lo usas)
app.post("/chat", async (req, res) => {
  try {
    const { chatId, message } = req.body || {};
    if (!chatId || !message) {
      return res.status(400).json({ error: "chatId y message son obligatorios" });
    }
    const out = await handleTurn({ chatId, message });
    res.json(out);
  } catch (e: any) {
    console.error("[/chat] error:", e);
    res.status(500).json({ error: "internal_error", detail: e?.message || String(e) });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

// Admin router
app.use(adminRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
