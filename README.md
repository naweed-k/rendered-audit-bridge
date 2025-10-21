# 🧩 Rendered Audit Bridge
**Dual-Renderer Web Audit Microservice for Opal AI Agents**

---

## 🚀 Overview
**Rendered Audit Bridge** is a lightweight Node.js service that bridges Opal AI agents with live website data.  
It provides two production-ready endpoints:

| Endpoint | Description | Renderer |
|-----------|--------------|-----------|
| `/api/tools/get-rendered-html` | Fetches a lightweight, LLM-safe HTML excerpt (with parsed metadata and headings). | Playwright (local) / Puppeteer (Vercel) |
| `/api/tools/run-lighthouse` | Runs a compact PageSpeed / Lighthouse check via the PSI API. | Google PSI API |

The service automatically switches rendering engines based on environment:

- 🧱 **Local (ngrok)** → `Playwright`  
- ☁️ **Vercel (serverless)** → `puppeteer-core` + `@sparticuz/chromium`

---

## ⚙️ Architecture

```
api/
 ├─ server.js                  → Express entrypoint for local testing
 ├─ discovery.js               → Opal tool registry JSON
 ├─ tools/
 │   ├─ get-rendered-html.js   → Shared handler (auto-picks renderer)
 │   ├─ renderer.playwright.js → Local engine
 │   ├─ renderer.puppeteer.js  → Vercel engine
 │   ├─ run-lighthouse.js      → PSI wrapper
 │   └─ _paramUtils.js         → (optional) helper
 └─ .well-known/op-tool-discovery.js → (re-export for Vercel)
```

---

## 🧩 Discovery (Opal)
Discovery returns both tools with environment-specific names:

| Environment | Function Names |
|--------------|----------------|
| Local        | `get_rendered_html`, `run_lighthouse` |
| Vercel Prod  | `get_rendered_html_prod`, `run_lighthouse_prod` |

This ensures no name collision inside Optimizely Opal.

---

## ⚙️ Environment Variables

| Name | Example | Purpose |
|------|----------|----------|
| `RENDERER` | `playwright` (local) / `puppeteer` (Vercel) | Chooses rendering engine |
| `TOOL_SUFFIX` | `_prod` | Adds suffix to discovery function names |
| `PORT` | `8000` | Local Express port |
| `PSI_API_KEY` | *(your PSI key)* | Google PageSpeed API key |
| `PSI_TIMEOUT_MS` | `20000` | Timeout for PSI fetch |
| `PSI_RETRIES` | `0` | Retry count |
| `PSI_USE_ALT` | `0` | Use alternate PSI call route |

---

## 🧪 Local Development

1. **Clone & install**
   ```bash
   git clone https://github.com/yourname/rendered-audit-bridge.git
   cd rendered-audit-bridge
   npm install
   ```

2. **Create `.env`**
   ```bash
   RENDERER=playwright
   PORT=8000
   PSI_API_KEY=yourkey
   PSI_TIMEOUT_MS=20000
   PSI_RETRIES=0
   PSI_USE_ALT=0
   TOOL_SUFFIX=
   ```

3. **Run locally**
   ```bash
   node api/server.js
   ngrok http 8000
   ```
   Test:
   ```bash
   curl -sS -X POST http://localhost:8000/tools/get-rendered-html      -H "Content-Type: application/json"      -d '{"url":"https://example.com"}'
   ```

---

## ☁️ Deployment (Vercel)

`vercel.json`
```json
{
  "version": 2,
  "functions": { "api/**": { "memory": 1024, "maxDuration": 30 } },
  "env": {
    "RENDERER": "puppeteer",
    "TOOL_SUFFIX": "_prod"
  }
}
```

Also set the following in **Vercel Dashboard → Settings → Environment Variables**:
```
PSI_API_KEY=<your-key>
PSI_TIMEOUT_MS=20000
PSI_RETRIES=0
PSI_USE_ALT=0
```

Deploy → verify:
```bash
curl -sS https://rendered-audit-bridge.vercel.app/api/discovery
```

---

## 🧩 Example Output
**GET /api/discovery**
```json
{
  "functions": [
    { "name": "get_rendered_html_prod", "endpoint": "/tools/get-rendered-html", ... },
    { "name": "run_lighthouse_prod", "endpoint": "/tools/run-lighthouse", ... }
  ]
}
```

**POST /api/tools/get-rendered-html**
```json
{
  "ok": true,
  "rendered": true,
  "final_url": "https://example.com/",
  "html": "<head>...</head><body>...</body>",
  "truncated": true,
  "extracted": { "title": "Example Domain", "h1": "Example Domain", ... }
}
```

---

## 🛠 Features
- Dynamic dual-engine renderer (Playwright local, Puppeteer serverless)
- LLM-safe HTML truncation (head/body caps)
- Metadata + heading extraction
- Compact PSI/Lighthouse wrapper with timeouts & retries
- Opal discovery auto-suffix
- Deploy-ready for serverless environments

---

## 🧑‍💻 Author
**Naweed Kabir**  
AI Enablement & Workflow Engineering  
Built for the **Optimizely FDE Assessment (2025)**  
> Bridging AI agents with the real web, one renderer at a time ⚡
