'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, '..', 'client', 'common-client-plugin.js'), 'utf8')
const loadClient = () => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))

test('Synced requires current programme video, running playback and near-current VOD offset', async () => {
  const { isProgrammeSynced } = await loadClient()
  const vod = { mode: 'vod', current: { uuid: 'video-a' } }
  assert.equal(isProgrammeSynced(vod, 'video-a', 122, true, 120), true)
  assert.equal(isProgrammeSynced(vod, 'video-a', 120, false, 120), false, 'paused is not synced')
  assert.equal(isProgrammeSynced(vod, 'video-a', 65, true, 120), false, 'a rewind is not synced')
  assert.equal(isProgrammeSynced(vod, 'video-a', 240, true, 120), false, 'fast-forward is not synced')
  assert.equal(isProgrammeSynced(vod, 'video-b', 120, true, 120), false, 'another video is not synced')
  assert.equal(isProgrammeSynced(vod, 'video-a', NaN, true, 120), false)
  assert.equal(isProgrammeSynced({ mode: 'empty' }, null, 0, false, 0), false)
})

test('actual live video is separate from programme sync and uses native live edge when available', async () => {
  const { isProgrammeSynced } = await loadClient()
  const live = { mode: 'live', current: { uuid: 'live-a' } }
  assert.equal(isProgrammeSynced(live, 'live-a', NaN, true, NaN, true), true)
  assert.equal(isProgrammeSynced(live, 'live-a', NaN, true, NaN, false), false)
  assert.equal(isProgrammeSynced(live, 'live-a', NaN, false, NaN, true), false)
})

test('programme sync action exists on both watch page and embedded player', async () => {
  const { mountLinearTV } = await loadClient()
  const original = { window: globalThis.window, document: globalThis.document,
    fetch: globalThis.fetch, setInterval: globalThis.setInterval }
  const makeRoot = () => ({
    innerHTML: '', isConnected: true, nodes: new Map(),
    querySelector (selector) {
      if (!this.nodes.has(selector)) this.nodes.set(selector, {
        isConnected: true, hidden: false, style: {}, classList: { toggle () {} },
        addEventListener () {}, getBoundingClientRect () { return { height: 0, top: 0 } }
      })
      return this.nodes.get(selector)
    }
  })
  try {
    globalThis.window = { location: { origin: 'https://example.org' }, innerHeight: 900,
      addEventListener () {}, matchMedia () { return { matches: false } } }
    globalThis.document = { documentElement: { lang: 'en' }, head: { appendChild () {} } }
    globalThis.fetch = () => new Promise(() => {})
    globalThis.setInterval = () => 1
    for (const embedded of [false, true]) {
      const root = makeRoot()
      mountLinearTV(root, { routerBase: '/plugins/linear-tv/router',
        staticBase: '/plugins/linear-tv/static', embedded })
      assert.match(root.innerHTML, /id="lt-sync"/)
      assert.match(root.innerHTML, /Sync to Programme/)
      assert.doesNotMatch(root.innerHTML, /Go to Live/)
    }
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  }
})

test('normal status polls never automatically undo a viewer pause or seek', () => {
  assert.match(source, /if \(manualSync && payload\.mode === 'vod'\)/)
  assert.match(source, /await refreshSyncControl\(\)/)
  assert.match(source, /if \(lastPayload\?\.mode === 'vod'\) await synchronizePlayer\(\)/)
  // The old unconditional call at the bottom of update() reset the position every 5 seconds.
  assert.doesNotMatch(source, /text\(statusEl, payload\.healthy[\s\S]*?await synchronizePlayer\(\)\s*\} catch/)
})
