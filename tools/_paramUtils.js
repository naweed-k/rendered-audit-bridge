function extractParams(req) {
    const b = req?.body ?? {};
    if (b && typeof b === 'object') {
        if (b.parameters && typeof b.parameters === 'object') return b.parameters; // Opal shape
        if (b.params && typeof b.params === 'object') return b.params;             // alt shape
        return b; // flat body
    }
    return {};
}
module.exports = { extractParams };
