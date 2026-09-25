// Mermaid checks borrow Playwright's Chromium (see scripts/check-mermaid.ts),
// so Puppeteer never needs to download a browser of its own.
module.exports = { skipDownload: true };
