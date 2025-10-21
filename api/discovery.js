module.exports = (req, res) => {
    const suffix = process.env.TOOL_SUFFIX || "";   // e.g., "" locally, "_prod" on Vercel
    const name_render = `get_rendered_html${suffix}`;
    const name_lh = `run_lighthouse${suffix}`;

    res.json({
        functions: [
            {
                name: name_render,
                description: "Render URL (Chromium). Returns a slim HTML excerpt + parsed meta. Uses Playwright locally and Puppeteer on Vercel.",
                endpoint: "/tools/get-rendered-html",
                http_method: "POST",
                parameters: [
                    { name: "url", type: "string", required: true, description: "Target URL (http/https)" },
                    { name: "viewport", type: "string", required: false, description: "desktop | mobile (default desktop)" },
                    { name: "timeout_ms", type: "number", required: false, description: "Navigation timeout in ms (default 30000)" },
                    { name: "html_body_kb", type: "number", required: false, description: "Body excerpt cap in KB (default 8)" },
                    { name: "head_limit_kb", type: "number", required: false, description: "Head excerpt cap in KB (default 8)" },
                    { name: "strip_scripts", type: "boolean", required: false, description: "Remove <script>/<style> blocks (default true)" },
                    { name: "return_extracted", type: "boolean", required: false, description: "Include parsed fields (title, og, twitter, h1, etc.) (default true)" }
                ],
                auth_requirements: []
            },
            {
                name: name_lh,
                description: "Fetch Lighthouse/PageSpeed data (compact summary only).",
                endpoint: "/tools/run-lighthouse",
                http_method: "POST",
                parameters: [
                    { name: "url", type: "string", required: true, description: "Target URL (http/https)" },
                    { name: "categories", type: "string", required: false, description: "Comma-separated: performance, accessibility, best-practices, seo" },
                    { name: "viewport", type: "string", required: false, description: "desktop | mobile (default desktop)" },
                    { name: "psi_api_key", type: "string", required: false, description: "Optional PSI API key (or set PSI_API_KEY env var)" }
                ],
                auth_requirements: []
            }
        ]
    });
};
