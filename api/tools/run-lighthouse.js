// tools/runLighthouse.js
// PSI wrapper for Lighthouse. Fast by default; knobs via env.

const DEFAULT_CATEGORIES = ["accessibility"];
const VALID_CATEGORIES = new Set(["performance", "accessibility", "best-practices", "seo"]);

const TIMEOUT_MS = Number(process.env.PSI_TIMEOUT_MS || 20000); // fast default 20s
const MAX_RETRIES = Math.min(2, Math.max(0, Number(process.env.PSI_RETRIES || 0))); // 0..2
const USE_ALT = String(process.env.PSI_USE_ALT || "0") === "1";

const PRIMARY_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const ALT_ENDPOINT = "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed";

function extractParams(req) {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    let p = { ...(body || {}) };
    for (const k of ["parameters", "params", "data", "payload", "input", "body"]) {
        if (p[k] && typeof p[k] === "object") p = { ...p, ...p[k] };
    }
    p = { ...p, ...(req.query || {}) };
    return p;
}

function buildURL(endpoint, { url, strategy, categories, key }) {
    const qs = new URLSearchParams({ url, strategy });
    for (const c of categories) qs.append("category", c);
    if (key) qs.set("key", key);
    return `${endpoint}?${qs.toString()}`;
}

async function timedFetch(url, timeoutMs) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
        const r = await fetch(url, { method: "GET", signal: ac.signal });
        clearTimeout(t);
        return r;
    } catch (e) {
        clearTimeout(t);
        e._timeout = e && e.name === "AbortError";
        throw e;
    }
}

module.exports = async function runLighthouse(req, res) {
    try {
        const p = extractParams(req);

        const url = String(p.url ?? "").trim();
        if (!url) return res.status(400).json({ ok: false, error: "Missing URL" });

        let viewport = p.viewport ?? p.form_factor ?? p.formFactor ?? "desktop";
        viewport = String(viewport || "").toLowerCase() === "mobile" ? "mobile" : "desktop";
        const strategy = viewport === "mobile" ? "MOBILE" : "DESKTOP";

        let categories = p.categories;
        if (!Array.isArray(categories)) {
            if (typeof categories === "string") categories = categories.split(",").map(s => s.trim()).filter(Boolean);
            else categories = DEFAULT_CATEGORIES.slice();
        }
        categories = categories.map(c => String(c || "").toLowerCase().replace(/_/g, "-"))
            .filter(c => VALID_CATEGORIES.has(c));
        if (categories.length === 0) categories = DEFAULT_CATEGORIES.slice();

        const include_full = String(p.include_full ?? "").toLowerCase() === "true";
        const psi_api_key = (p.psi_api_key ?? process.env.PSI_API_KEY) || null;

        const primaryURL = buildURL(PRIMARY_ENDPOINT, { url, strategy, categories, key: psi_api_key });
        const altURL = buildURL(ALT_ENDPOINT, { url, strategy, categories, key: psi_api_key });
        console.log("[PSI] %s %s  key? %s  timeout=%dms retries=%d alt=%s",
            strategy, url, !!psi_api_key, TIMEOUT_MS, MAX_RETRIES, USE_ALT ? "on" : "off");

        // Attempt list based on settings
        const attempts = [primaryURL];
        for (let i = 0; i < MAX_RETRIES; i++) attempts.push(primaryURL);
        if (USE_ALT) attempts.push(altURL);

        let resp, lastErr, attemptIdx = 0;
        for (; attemptIdx < attempts.length; attemptIdx++) {
            const target = attempts[attemptIdx];
            try {
                resp = await timedFetch(target, TIMEOUT_MS);
                if (resp.ok) break;
                const transient = resp.status === 429 || (resp.status >= 500 && resp.status < 600);
                if (!transient) break;
            } catch (e) {
                lastErr = e;
                if (!e._timeout) {
                    return res.status(200).json({
                        ok: true, note: "psi_unavailable",
                        input: { url, viewport, categories },
                        error: { type: "fetch_error", message: String(e && e.message || e), psi_url: target, timeout_ms: TIMEOUT_MS, attempt: attemptIdx + 1 }
                    });
                }
            }
            // backoff only if we actually have retries enabled
            if (MAX_RETRIES > 0 || USE_ALT) await new Promise(r => setTimeout(r, 1000 * (attemptIdx + 1)));
        }

        if (!resp || !resp.ok) {
            let text = "";
            try { text = await (resp ? resp.text() : Promise.resolve("")); } catch { }
            const errPayload = !resp ? {
                type: lastErr && lastErr._timeout ? "timeout" : "fetch_error",
                message: String(lastErr && lastErr.message || lastErr),
                psi_url: attempts[attemptIdx - 1] || primaryURL,
                timeout_ms: TIMEOUT_MS,
                attempt: attemptIdx
            } : {
                type: "http_error",
                status: resp.status,
                status_text: resp.statusText,
                body_excerpt: text.slice(0, 500),
                psi_url: resp.url,
                timeout_ms: TIMEOUT_MS,
                attempt: attemptIdx
            };
            return res.status(200).json({ ok: true, note: "psi_unavailable", input: { url, viewport, categories }, error: errPayload });
        }

        let data;
        try { data = await resp.json(); }
        catch (e) { return res.status(200).json({ ok: true, note: "psi_unavailable", input: { url, viewport, categories }, error: { type: "parse_error", message: String(e) } }); }

        const lr = data.lighthouseResult || {};
        const cats = lr.categories || {};
        const category_scores = {};
        for (const [k, v] of Object.entries(cats)) {
            if (v && typeof v.score === "number") category_scores[k] = Math.round(v.score * 100);
        }

        const summary = {
            final_url: lr.finalDisplayedUrl || lr.finalUrl || data.id || url,
            fetch_time: lr.fetchTime || data.analysisUTCTimestamp || null,
            user_agent: lr.userAgent || (lr.environment && (lr.environment.hostUserAgent || lr.environment.networkUserAgent)) || null,
            category_scores
        };

        const payload = { ok: true, input: { url, viewport, categories }, summary };
        if (include_full) payload.psi = data;
        return res.status(200).json(payload);

    } catch (err) {
        return res.status(200).json({
            ok: true, note: "psi_unavailable",
            input: { url: null, viewport: "desktop", categories: DEFAULT_CATEGORIES.slice() },
            error: { type: "unexpected", message: String(err) },
            summary: { final_url: null, fetch_time: null, user_agent: null, category_scores: {} }
        });
    }
};
