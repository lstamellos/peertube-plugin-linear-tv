'use strict'

const FRAME_ANCESTORS = "frame-ancestors 'self'"

function parseEmbedOrigins (value) {
  const entries = String(value || '').split(/[\s,;]+/).filter(Boolean)
  if (entries.length > 20) throw new Error('At most 20 embed parent origins are allowed')
  const origins = new Set()
  for (const entry of entries) {
    let url
    try { url = new URL(entry) } catch { throw new Error('Invalid embed parent origin: ' + entry) }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash || url.origin === 'null') {
      throw new Error('Embed parents must be HTTP(S) origins without paths or credentials: ' + entry)
    }
    origins.add(url.origin)
  }
  return [...origins]
}

function frameAncestors (origins = []) {
  return FRAME_ANCESTORS + (origins.length ? ' ' + origins.join(' ') : '')
}

function escapeAttribute (s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;')
}

function renderEmbedPage ({ routerBase, staticBase, allowedOrigins = [], language = 'en' }) {
  const route = escapeAttribute(routerBase.replace(/\/$/, ''))
  const assets = escapeAttribute(staticBase.replace(/\/$/, '') + '/tv-assets')
  const origins = escapeAttribute(JSON.stringify(allowedOrigins))
  return `<!doctype html>
<html lang="${language === 'el' ? 'el' : 'en'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Linear TV</title>
  <link rel="stylesheet" href="${assets}/linear-tv.css">
  <link rel="stylesheet" href="${assets}/embed.css">
  <script type="module" src="${assets}/embed-client.js"></script>
</head>
<body class="lt-embed-document">
  <div id="lt-embed-root" data-router-base="${route}" data-static-base="${escapeAttribute(staticBase)}" data-allowed-origins="${origins}"></div>
</body>
</html>`
}

module.exports = { FRAME_ANCESTORS, parseEmbedOrigins, frameAncestors, renderEmbedPage }
