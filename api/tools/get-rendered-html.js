// Single handler for both Vercel (serverless) and local Express.
// It picks Playwright (local) or Puppeteer (Vercel) using RENDERER env.

const { extractParams } = require("./_paramUtils");
const path = require("path");

// Choose implementation by env (default to Playwright)
function pickRenderer() {
    const mode = String(process.env.RENDERER || "").toLowerCase();
    if (mode === "puppeteer") {
        return require(path.join(__dirname, "renderer.puppeteer"));
    }
    return require(path.join(__dirname, "renderer.playwright"));
}

module.exports = async function getRenderedHtml(req, res) {
    try {
        // normalize params once so both renderers get a plain object
        let body = req.body;
        if (typeof body === "string") {
            try { body = JSON.parse(body); } catch { body = {}; }
        }
        const p = { ...extractParams({ body }), ...(req.query || {}) };

        const url = String(p.url ?? "").trim();
        if (!url) return res.status(400).json({ ok: false, error: "Missing URL" });

        const impl = pickRenderer(); // function (params) -> payload
        const payload = await impl(p);
        // contract: payload is already the final JSON body
        return res.status(200).json(payload);
    } catch (err) {
        return res.status(200).json({ ok: true, rendered: false, error: "render_failed", details: String(err?.message || err) });
    }
};
