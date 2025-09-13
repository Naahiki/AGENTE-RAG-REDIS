import fs from "fs";
import yaml from "js-yaml";

export function loadConfig() {
  const raw = fs.readFileSync("config/agent.yml", "utf-8");
  return yaml.load(raw) as any;
}

export function loadSystemPrompt() {
  return fs.readFileSync("config/prompts/system.txt", "utf-8");
}
