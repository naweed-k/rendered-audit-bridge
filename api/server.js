// IPv4 preference at DNS level (Windows/ISP stalls fix)
const dns = require("dns");
dns.setDefaultResultOrder?.("ipv4first");

// Force IPv4 at fetch/HTTP layer (Node 18+ uses undici)
const { setGlobalDispatcher, Agent } = require("undici");
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));

// Load env first
require("dotenv").config();

const express = require("express");
const cors = require("cors");

// NOTE: These paths were wrong before. Keep everything inside /api/*
const discovery = require("./discovery");
const getRenderedHtml = require("./tools/get-rendered-html");
const runLighthouse = require("./tools/run-lighthouse");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.text({ type: ["text/*", "application/x-www-form-urlencoded"], limit: "2mb" }));

// Startup diagnostics
const psiKeyExists = !!process.env.PSI_API_KEY;
const timeoutMs = Number(process.env.PSI_TIMEOUT_MS || 60000);
console.log("──────────────────────────────────────────────");
console.log("[Startup] Rendered Audit Bridge ✅");
console.log(`│ PSI_API_KEY found: ${psiKeyExists ? "✅ yes" : "❌ no"}`);
console.log(`│ PSI_TIMEOUT_MS: ${timeoutMs} ms`);
console.log(`│ RENDERER: ${String(process.env.RENDERER || "playwright")}`);
console.log("──────────────────────────────────────────────");
if (!psiKeyExists) console.warn("⚠️  No PSI_API_KEY detected. Put it in .env");

app.get("/", (_req, res) => res.json({ ok: true, name: "Rendered Audit Bridge" }));

// Discovery on both paths is convenient for Opal + browser checks
app.get("/.well-known/op-tool-discovery", discovery);
app.get("/discovery", discovery);

// Tools
app.post("/tools/get-rendered-html", getRenderedHtml);
app.post("/tools/run-lighthouse", runLighthouse);

const PORT = Number(process.env.PORT || 8000);
app.listen(PORT, () => console.log(`🚀 Rendered Audit Bridge listening on :${PORT}`));

module.exports = app;
