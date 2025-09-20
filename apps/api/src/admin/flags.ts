import { Router } from "express";
import { getRuntimeFlags, setRuntimeFlags } from "../config";

export function buildFlagsRouter(ADMIN_KEY: string) {
  const r = Router();

  // GET para ver el estado actual (útil para el panel)
  r.get("/flags", (_req, res) => {
    res.json(getRuntimeFlags());
  });

  // PUT para cambiar flags (protegido con header)
  r.put("/flags", (req, res) => {
    if (!ADMIN_KEY || req.header("X-Admin-Key") !== ADMIN_KEY) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const patch = req.body || {};
    setRuntimeFlags(patch);
    return res.json(getRuntimeFlags());
  });

  return r;
}
