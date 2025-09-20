// apps/api/src/server.ts
import "./boot";

import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { handleTurn } from "@agent-rag/core";
import adminRouter from "./admin/router";
import { buildIntroMessage } from "./intro";
import { getRuntimeFlags, setRuntimeFlags } from "./config";
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const app = express();

app.use(cors({
  origin: process.env.WEB_ORIGIN || true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","X-Admin-Key"],
}));
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


// GET /config → front lee flags
app.get("/config", (_req, res) => {
  const cfg = getRuntimeFlags();
  res.json({
    INTRO_GUIDE_ENABLED: cfg.INTRO_GUIDE_ENABLED,
    INTRO_GUIDE_REQUIRED: cfg.INTRO_GUIDE_REQUIRED,
    ONBOARDING_MIN_ANSWERS: cfg.ONBOARDING_MIN_ANSWERS,
    ONBOARDING_MAX_QUESTIONS: cfg.ONBOARDING_MAX_QUESTIONS,
    ONBOARDING_ONLY_IN_SCOPE: cfg.ONBOARDING_ONLY_IN_SCOPE,
    GUARDRAILS_SAFETY_ENABLED: cfg.GUARDRAILS_SAFETY_ENABLED,
    GUARDRAILS_SCOPE_ENABLED: cfg.GUARDRAILS_SCOPE_ENABLED,
  });
});

// PUT /admin/flags → cambiar runtime flags (protegido)
app.put("/admin/flags", (req, res) => {
  if (!ADMIN_KEY || req.header("X-Admin-Key") !== ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const patch = req.body || {};
  setRuntimeFlags(patch);
  return res.json(getRuntimeFlags());
});