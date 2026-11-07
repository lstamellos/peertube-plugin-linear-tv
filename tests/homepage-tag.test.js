'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, '..', 'client/homepage-client-plugin.js'), 'utf8')
const loadClient = () => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))

function fakeElement (tag, match = false) {
  return {
    nodeType: 1, tagName: tag.toUpperCase(), dataset: {}, style: {}, children: [], isConnected: true,
    events: {}, attrs: {},
    matches: () => match,
    querySelectorAll: () => [],
    replaceChildren (...items) { this.children = items },
    addEventListener (name, cb) { this.events[name] = cb },
    setAttribute (name, value) { this.attrs[name] = value }
  }
}

test('PeerTube homepage marker mounts a single same-origin, upgrade-safe responsive embed', async () => {
  const { stableEmbedPath, installHomepageMarkup } = await loadClient()
  assert.equal(stableEmbedPath('/plugins/linear-tv/0.2.8/router'), '/plugins/linear-tv/router/embed')
  assert.equal(stableEmbedPath('/plugins/linear-tv/0.2.8-beta.1/router'), '/plugins/linear-tv/router/embed')
  assert.throws(() => stableEmbedPath('//evil/router'), /local/)
  const tag = fakeElement('peertube-container', true)
  const docRoot = fakeElement('html')
  docRoot.querySelectorAll = () => []
  const doc = { body: fakeElement('body'), documentElement: docRoot, createElement: name => fakeElement(name) }
  let observerCallback
  const messages = []
  const handlers = new Map()
  const win = {
    location: { origin: 'https://video.example.org' },
    MutationObserver: class {
      constructor (cb) { observerCallback = cb }
      observe () {}
      disconnect () {}
    },
    addEventListener (name, cb) { handlers.set(name, cb) },
    removeEventListener (name) { handlers.delete(name) }
  }
  const installed = installHomepageMarkup({ routerBase: '/plugins/linear-tv/0.2.8/router', doc, win })
  observerCallback([{ addedNodes: [tag] }])
  assert.equal(tag.dataset.linearTvMounted, 'true')
  assert.equal(tag.children.length, 1)
  const frame = tag.children[0]
  frame.contentWindow = { postMessage: (...args) => messages.push(args) }
  assert.equal(frame.src, '/plugins/linear-tv/router/embed')
  assert.equal(frame.scrolling, 'no')
  assert.equal(frame.loading, 'lazy')
  assert.match(frame.style.cssText, /width:100%/)
  frame.events.load()
  assert.deepEqual(messages, [[{ type: 'linear-tv:request-size' }, win.location.origin]])
  observerCallback([{ addedNodes: [tag] }])
  assert.strictEqual(tag.children[0], frame)
  handlers.get('message')({ origin: 'https://other.example', source: frame.contentWindow,
    data: { type: 'linear-tv:resize', height: 500 } })
  assert.equal(frame.style.height, undefined)
  handlers.get('message')({ origin: win.location.origin, source: {},
    data: { type: 'linear-tv:resize', height: 500 } })
  assert.equal(frame.style.height, undefined)
  handlers.get('message')({ origin: win.location.origin, source: frame.contentWindow,
    data: { type: 'linear-tv:resize', height: 4001 } })
  assert.equal(frame.style.height, undefined)
  handlers.get('message')({ origin: win.location.origin, source: frame.contentWindow,
    data: { type: 'linear-tv:resize', height: 622 } })
  assert.equal(frame.style.height, '622px')
  installed.disconnect()
  assert.equal(handlers.has('message'), false)
})
