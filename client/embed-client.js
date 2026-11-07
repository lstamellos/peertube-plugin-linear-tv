'use strict'

import { mountLinearTV } from './common-client-plugin.js'

// The server supplies version-aware routes using PeerTube's plugin helpers.
const rootEl = document.getElementById('lt-embed-root')
if (rootEl) {
  mountLinearTV(rootEl, {
    routerBase: rootEl.dataset.routerBase,
    staticBase: rootEl.dataset.staticBase,
    embedded: true
  })

  // Resizing never rebuilds the player or chat. The parent page accepts only
  // messages from the matching PeerTube origin and from its own iframe.
  const origins = ['https://omniatv.com', 'https://www.omniatv.com', 'https://video.omniatv.com']
  let lastHeight = -1
  let scheduled = false
  function reportHeight () {
    scheduled = false
    // Measure actual content, not documentElement.scrollHeight: the latter
    // includes the iframe's current viewport and prevents shrinking a tall
    // initial placeholder height after the programme has loaded.
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
