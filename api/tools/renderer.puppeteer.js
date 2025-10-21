// Vercel-friendly renderer using puppeteer-core + @sparticuz/chromium

const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");
const { extractParams } = require("./_paramUtils"); // keep your helper; or inline

function toBool(v, dflt) {
    if (typeof v === "boolean") return v;
    if (v == null) return dflt;
    const s = String(v).toLowerCase();
    return s === "1" || s === "true" || s === "yes";
}
function clampKb(n, dflt) {
    const num = Number(n);
    return Number.isFinite(num) && num > 0 ? num : dflt;
}
function stripHeavy(html, stripScripts = true) {
    let out = String(html || "");
    if (stripScripts) {
        out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
        out = out.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
    }
    return out;
}

module.exports = async function getRenderedHtml(req, res) {
    try {
        const p = { ...extractParams(req), ...(req.query || {}) };
        const url = String(p.url ?? "").trim();
        if (!url) return res.status(400).json({ ok: false, error: "Missing URL" });

        let viewport = (p.viewport ?? p.form_factor ?? "desktop");
        viewport = String(viewport).toLowerCase() === "mobile" ? "mobile" : "desktop";

        const timeout_ms = Number(p.timeout_ms ?? 30000);

        const BODY_LIMIT_KB = clampKb(p.html_body_kb, clampKb(process.env.HTML_BODY_KB, 8));
        const HEAD_LIMIT_KB = clampKb(p.head_limit_kb, clampKb(process.env.HTML_HEAD_KB, 8));

        const STRIP_SCRIPTS = toBool(p.strip_scripts, true);
        const RETURN_EXTRACTED = toBool(p.return_extracted, true);

        const BODY_LIMIT_BYTES = Math.max(1024, Math.floor(BODY_LIMIT_KB * 1024));
        const HEAD_LIMIT_BYTES = Math.max(1024, Math.floor(HEAD_LIMIT_KB * 1024));

        const isMobile = viewport === "mobile";
        const userAgent = isMobile
            ? "Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        const deviceViewport = isMobile ? { width: 390, height: 844 } : { width: 1366, height: 768 };

        let browser, page;
        let finalURL = url;
        let html = "";
        let rendered = false;
        let extracted = null;

        try {
            const executablePath = await chromium.executablePath();
            browser = await puppeteer.launch({
                args: chromium.args,
                executablePath,
                headless: chromium.headless,
                defaultViewport: deviceViewport
            });

            page = await browser.newPage();
            await page.setUserAgent(userAgent);

            const nav = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeout_ms });
            try { await page.waitForNetworkIdle({ timeout: Math.min(timeout_ms, 15000) }); } catch (_) { }
            finalURL = page.url() || url;
            rendered = !!nav;

            html = await page.content();

            if (RETURN_EXTRACTED) {
                extracted = await page.evaluate(() => {
                    const get = (sel, attr) => {
                        const el = document.querySelector(sel);
                        return el ? (attr ? el.getAttribute(attr) : el.textContent) : null;
                    };
                    const metas = Array.from(document.querySelectorAll("meta")).map(m => ({
                        name: m.getAttribute("name"),
                        property: m.getAttribute("property"),
                        content: m.getAttribute("content")
                    }));
                    const og = {}, tw = {};
                    for (const m of metas) {
                        if (m.property && m.property.startsWith("og:")) og[m.property] = m.content || "";
                        if (m.name && m.name.startsWith("twitter:")) tw[m.name] = m.content || "";
                    }
                    const h1 = get("h1");
                    const h2 = Array.from(document.querySelectorAll("h2")).map(h => h.textContent?.trim()).filter(Boolean).slice(0, 6);
                    const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
                    const intro_words = bodyText.split(" ").slice(0, 150).join(" ");
                    const images = Array.from(document.images).slice(0, 8).map(img => ({ alt: (img.alt || "").trim(), src: img.src || "" }));
                    return {
                        title: document.title || null,
                        meta_description: get('meta[name="description"]', "content"),
                        robots: get('meta[name="robots"]', "content"),
                        canonical: get('link[rel="canonical"]', "href"),
                        viewport: get('meta[name="viewport"]', "content"),
                        lang: document.documentElement.getAttribute("lang") || null,
                        og, twitter: tw,
                        h1: h1 ? h1.trim() : null,
                        h2, intro_text: intro_words, images
                    };
                });
            }
        } catch (err) {
            return res.json({
                ok: true,
                rendered: false,
                final_url: finalURL,
                user_agent: userAgent,
                error: "render_failed",
                details: String(err?.message || err)
            });
        } finally {
            if (page) await page.close().catch(() => { });
            if (browser) await browser.close().catch(() => { });
        }

        const headMatch = html.match(/<head[^>]*>[\s\S]*?<\/head>/i);
        const bodyOpenMatch = html.match(/<body[^>]*>/i);

        let headBlock = headMatch ? headMatch[0] : "";
        headBlock = stripHeavy(headBlock, STRIP_SCRIPTS);
        if (headBlock.length > HEAD_LIMIT_BYTES) {
            headBlock = headBlock.slice(0, HEAD_LIMIT_BYTES) + `\n<!-- [head truncated… kept ~${HEAD_LIMIT_KB}KB] -->`;
        }

        let bodySlice = "";
        if (bodyOpenMatch) {
            const startIdx = (bodyOpenMatch.index ?? -1) + bodyOpenMatch[0].length;
            if (startIdx >= bodyOpenMatch[0].length) {
                bodySlice = html.slice(startIdx, startIdx + Math.max(1024, Math.floor(BODY_LIMIT_KB * 1024)));
            }
        }
        bodySlice = stripHeavy(bodySlice, STRIP_SCRIPTS);

        let slimHtml = "";
        if (headBlock) slimHtml += headBlock;
        if (bodyOpenMatch) {
            slimHtml += bodyOpenMatch[0] + bodySlice + `\n<!-- [body truncated… kept ~${BODY_LIMIT_KB}KB] -->`;
        }
        if (!slimHtml) {
            const HARD_BACKSTOP = 80_000;
            const safe = stripHeavy(html, STRIP_SCRIPTS);
            slimHtml = safe.length > HARD_BACKSTOP
                ? safe.slice(0, HARD_BACKSTOP) + `\n<!-- [hard truncated ${safe.length - HARD_BACKSTOP} chars] -->`
                : safe;
        }

        const payload = {
            ok: true,
            rendered,
            final_url: finalURL,
            user_agent: userAgent,
            html: slimHtml,
            truncated: true,
            original_length: html.length,
            excerpt_length: slimHtml.length,
            body_limit_kb: BODY_LIMIT_KB,
            head_limit_kb: HEAD_LIMIT_KB,
            strip_flags: { scripts: STRIP_SCRIPTS, styles: STRIP_SCRIPTS }
        };
        if (RETURN_EXTRACTED) payload.extracted = extracted;
        return res.json(payload);
    } catch (err) {
        return res.status(500).json({ ok: false, error: "server_error", details: String(err?.message || err) });
    }
};
