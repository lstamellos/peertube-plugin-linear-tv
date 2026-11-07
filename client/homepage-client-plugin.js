'use strict'

// PeerTube only permits its built-in custom markup tags on the homepage.
// The supported peertube-container is a safe carrier for our data-* marker.
const HOMEPAGE_SELECTOR = 'peertube-container[data-linear-tv="true"]'

function stableEmbedPath (routerBase) {
  if (typeof routerBase !== 'string' || !routerBase.startsWith('/') || routerBase.startsWith('//')) {
    throw new Error('Expected a local PeerTube plugin route')
  }
  return routerBase.replace(/\/+$/, '')
    .replace(/\/\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?(?=\/router$)/i, '') + '/embed'
}

// Reuse the standalone embed: no second scheduler, video player or chat instance.
// Scan added elements as the PeerTube SPA constructs and replaces homepage content.
function installHomepageMarkup ({ routerBase, doc = document, win = window }) {
  const embedPath = stableEmbedPath(routerBase)
  const frames = new Set()

  function mount (tag) {
    if (tag.dataset.linearTvMounted === 'true') return
    const frame = doc.createElement('iframe')
    frame.src = embedPath
    frame.title = 'Linear TV'
    frame.loading = 'lazy'
    frame.scrolling = 'no'
    frame.allow = 'autoplay; fullscreen; picture-in-picture'
    frame.allowFullscreen = true
    frame.style.cssText = 'display:block;width:100%;height:850px;border:0;overflow:hidden'
    frame.addEventListener('load', () => {
      frame.contentWindow?.postMessage({ type: 'linear-tv:request-size' }, win.location.origin)
    })

    tag.replaceChildren(frame)
    tag.style.display = 'block'
    tag.style.width = '100%'
    tag.dataset.linearTvMounted = 'true'
    frames.add(frame)
  }

  function inspect (node) {
    if (node.nodeType !== 1) return
    if (node.matches?.(HOMEPAGE_SELECTOR)) mount(node)
    node.querySelectorAll?.(HOMEPAGE_SELECTOR).forEach(mount)
  }

  inspect(doc.documentElement)
  const observer = new win.MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) inspect(node)
    }
    for (const frame of frames) {
      if (!frame.isConnected) frames.delete(frame)
    }
  })
  observer.observe(doc.body, { childList: true, subtree: true })

  const receiveSize = event => {
    if (event.origin !== win.location.origin || event.data?.type !== 'linear-tv:resize') return
    const height = Number(event.data.height)
    if (!Number.isFinite(height) || height < 200 || height > 4000) return
    for (const frame of frames) {
      if (frame.isConnected && frame.contentWindow === event.source) {
        frame.style.height = height + 'px'
        break
      }
    }
  }
  win.addEventListener('message', receiveSize)

  return {
    disconnect () {
      observer.disconnect()
      win.removeEventListener('message', receiveSize)
      frames.clear()
    }
  }
}

function register ({ peertubeHelpers }) {
  const mount = () => installHomepageMarkup({ routerBase: peertubeHelpers.getBaseRouterRoute() })
  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount, { once: true })
}

export { register, stableEmbedPath, installHomepageMarkup }
