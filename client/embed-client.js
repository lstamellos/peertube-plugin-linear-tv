'use strict'

import { mountLinearTV } from './common-client-plugin.js'

// The server supplies version-aware routes and the explicitly allowed parent
// origins. The CSP frame-ancestors directive independently enforces the list.
const rootEl = document.getElementById('lt-embed-root')
if (rootEl) {
  mountLinearTV(rootEl, {
    routerBase: rootEl.dataset.routerBase,
    staticBase: rootEl.dataset.staticBase,
    embedded: true
  })

  let configured = []
  try { configured = JSON.parse(rootEl.dataset.allowedOrigins || '[]') } catch { /* self only */ }
  const origins = [...new Set([window.location.origin,
    ...(Array.isArray(configured) ? configured.filter(origin => {
      try {
        const parsed = new URL(origin)
        return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === origin
      } catch { return false }
    }) : [])])]
  let lastHeight = -1
  let scheduled = false
  function reportHeight () {
    scheduled = false
    // The iframe's viewport height is not its content height.
    const height = Math.ceil(rootEl.getBoundingClientRect().bottom + 4)
    if (!Number.isFinite(height) || height < 200 || height === lastHeight) return
    lastHeight = height
    if (window.parent !== window) {
      for (const origin of origins) {
        window.parent.postMessage({ type: 'linear-tv:resize', height, version: 1 }, origin)
      }
    }
  }
  function scheduleReport () {
    if (scheduled) return
    scheduled = true
    window.requestAnimationFrame(reportHeight)
  }
  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(scheduleReport)
    : null
  observer?.observe(rootEl)
  window.addEventListener('resize', scheduleReport)
  window.addEventListener('load', scheduleReport)
  window.addEventListener('message', event => {
    if (origins.includes(event.origin) && event.source === window.parent &&
        event.data?.type === 'linear-tv:request-size') scheduleReport()
  })
  scheduleReport()
}
