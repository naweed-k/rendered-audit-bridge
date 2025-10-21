module.exports = (req, res) => {
    res.json({
        functions: [
            {
                name: "get_rendered_html_prod",
                description: "Render URL via Playwright; returns a slim HTML excerpt and parsed fields.",
                endpoint: "/tools/get-rendered-html",
                http_method: "POST",
                parameters: [
                    { name: "url", type: "string", required: true, description: "Target URL (http/https)" },
                    { name: "viewport", type: "string", required: false, description: "desktop | mobile (default desktop)" },
                    { name: "timeout_ms", type: "number", required: false, description: "Navigation timeout (ms), default 30000" },
                    { name: "html_body_kb", type: "number", required: false, description: "Body excerpt cap in KB (default 8)" },
                    { name: "head_limit_kb", type: "number", required: false, description: "Head excerpt cap in KB (default 8)" },
                    { name: "strip_scripts", type: "boolean", required: false, description: "Remove <script>/<style> (default true)" },
                    { name: "return_extracted", type: "boolean", required: false, description: "Include parsed head/body fields (default true)" }
                ],
                auth_requirements: []
            },
            {
                name: "run_lighthouse_prod",
                description: "Fetch Lighthouse/PageSpeed data (compact summary only).",
                endpoint: "/tools/run-lighthouse",
                http_method: "POST",
                parameters: [
                    {
                        name: "url",
                        type: "string",
                        required: true,
                        description: "Target URL (http/https)"
                    },
                    {
                        name: "categories",
                        type: "string",
                        required: false,
                        description: "Comma-separated categories: performance, accessibility, best-practices, seo"
                    },
                    {
                        name: "viewport",
                        type: "string",
                        required: false,
                        description: "desktop | mobile (default desktop)"
                    },
                    {
                        name: "psi_api_key",
                        type: "string",
                        required: false,
                        description: "Optional PSI API key (or set PSI_API_KEY env var)"
                    }
                ],
                auth_requirements: []
            }

        ]
    });
};
