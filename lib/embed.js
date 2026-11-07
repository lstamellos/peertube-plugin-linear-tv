'use strict'

const FRAME_ANCESTORS = "frame-ancestors 'self' https://omniatv.com https://www.omniatv.com"

function escapeAttribute (s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;')
}

function renderEmbedPage ({ routerBase, staticBase }) {
  const route = escapeAttribute(routerBase.replace(/\/$/, ''))
  const assets = escapeAttribute(staticBase.replace(/\/$/, '') + '/tv-assets')
  return `<!doctype html>
<html lang="el">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Linear TV — OmniaTV</title>
  <link rel="stylesheet" href="${assets}/linear-tv.css">
  <link rel="stylesheet" href="${assets}/embed.css">
  <script type="module" src="${assets}/embed-client.js"></script>
</head>
<body class="lt-embed-document">
  <div id="lt-embed-root" data-router-base="${route}" data-static-base="${escapeAttribute(staticBase)}"></div>
</body>
</html>`
}

module.exports = { FRAME_ANCESTORS, renderEmbedPage }
