'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, '..', 'client', 'common-client-plugin.js'), 'utf8')
const sourceURL = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')

async function loadClient () { return import(sourceURL) }

function fakeEmbed () {
  const videoState = { muted: true, volume: 0.7, position: 123.4 }
  const player = {
    muted (value) { if (value !== undefined) videoState.muted = value; return videoState.muted },
    volume (value) { if (value !== undefined) videoState.volume = value; return videoState.volume },
    currentTime () { return videoState.position }
  }
  const iframe = {
    isConnected: true,
    src: 'https://video.omniatv.com/videos/embed/test?api=1&muted=1&start=123',
    contentWindow: { location: { origin: 'https://video.omniatv.com' }, videojsPlayer: player }
  }
  return { videoState, iframe, player }
}

test('Enable sound unmutes existing same-origin embed without changing URL, position or iframe', async () => {
  const oldWindow = globalThis.window
  globalThis.window = { location: { origin: 'https://video.omniatv.com' } }
  try {
    const { enableSoundInEmbed } = await loadClient()
    const { videoState, iframe, player } = fakeEmbed()
    const originalURL = iframe.src
    const originalPosition = player.currentTime()
    const root = {
      querySelector (selector) { assert.equal(selector, 'iframe'); return iframe },
      replaceChildren () { throw new Error('Must not rebuild player') }
    }
    const button = { hidden: false }
    assert.equal(enableSoundInEmbed(root, button), true)
    assert.equal(videoState.muted, false)
    assert.equal(videoState.volume, 0.7, 'preserve viewer volume')
    assert.equal(iframe.src, originalURL)
    assert.equal(player.currentTime(), originalPosition)
    assert.equal(root.querySelector('iframe'), iframe)
    assert.equal(button.hidden, true)
  } finally { globalThis.window = oldWindow }
})

test('Enable sound restores volume from zero and allows a retry before player is ready', async () => {
  const oldWindow = globalThis.window
  globalThis.window = { location: { origin: 'https://video.omniatv.com' } }
  try {
    const { enableSoundInEmbed } = await loadClient()
    const { videoState, iframe } = fakeEmbed()
    videoState.volume = 0
    const root = { querySelector () { return iframe } }
    const button = { hidden: false }
    delete iframe.contentWindow.videojsPlayer
    iframe.contentWindow.document = { querySelector () { return null } }
    assert.equal(enableSoundInEmbed(root, button), false)
    assert.equal(button.hidden, false)
    iframe.contentWindow.videojsPlayer = {
      muted (v) { if (v !== undefined) videoState.muted = v; return videoState.muted },
      volume (v) { if (v !== undefined) videoState.volume = v; return videoState.volume }
    }
    assert.equal(enableSoundInEmbed(root, button), true)
    assert.equal(videoState.muted, false)
    assert.equal(videoState.volume, 1)
    assert.equal(button.hidden, true)
  } finally { globalThis.window = oldWindow }
})

test('Audio control refuses a cross-origin iframe without hiding the button', async () => {
  const oldWindow = globalThis.window
  globalThis.window = { location: { origin: 'https://video.omniatv.com' } }
  try {
    const { enableSoundInEmbed } = await loadClient()
    const { iframe, videoState } = fakeEmbed()
    iframe.contentWindow.location.origin = 'https://elsewhere.example'
    const root = { querySelector () { return iframe } }
    const button = { hidden: false }
    assert.equal(enableSoundInEmbed(root, button), false)
    assert.equal(button.hidden, false)
    assert.equal(videoState.muted, true)
    // The browser throws on an actual cross-origin contentWindow.location read.
    Object.defineProperty(iframe.contentWindow, 'location', { get () { throw new Error('SecurityError') } })
    assert.equal(enableSoundInEmbed(root, button), false)
  } finally { globalThis.window = oldWindow }
})

test('Sound button click calls unmute in place; does not call setVideo or replace the iframe', async () => {
  const oldWindow = globalThis.window
  const oldInterval = globalThis.setInterval
  const oldFetch = globalThis.fetch
  globalThis.window = { location: { origin: 'https://video.omniatv.com' } }
  globalThis.setInterval = () => 42
  globalThis.fetch = () => new Promise(() => {}) // no refresh: only exercise click behavior
  try {
    const { register } = await loadClient()
    let route
    register({
      registerClientRoute (v) { route = v },
      peertubeHelpers: { getBaseRouterRoute: () => '/plugins/linear-tv/router', getBaseStaticRoute: () => '/plugins/linear-tv/static' }
    })
    const { iframe, videoState } = fakeEmbed()
    let replaceCalls = 0
    const videoEl = {
      querySelector () { return iframe },
      replaceChildren () { replaceCalls++ }
    }
    let click
    const button = { hidden: false, addEventListener (event, fn) { assert.equal(event, 'click'); click = fn } }
    const elements = new Map([
      ['#lt-video', videoEl], ['#lt-sound', button],
      ['#lt-sync', { hidden: false, disabled: true, addEventListener () {} }],
      ['#lt-chat-toggle', { addEventListener () {}, setAttribute () {} }],
      ['#lt-chat', { hidden: false, style: {} }],
      ['.lt-layout', { classList: { toggle () {} } }]
    ])
    const rootEl = {
      isConnected: true,
      innerHTML: '',
      querySelector (selector) {
        if (!elements.has(selector)) elements.set(selector, { hidden: false, textContent: '' })
        return elements.get(selector)
      }
    }
    route.onMount({ rootEl })
    assert.equal(typeof click, 'function')
    click()
    assert.equal(videoState.muted, false)
    assert.equal(button.hidden, true)
    assert.equal(replaceCalls, 0)
    assert.equal(videoEl.querySelector(), iframe)
  } finally {
    globalThis.window = oldWindow
    globalThis.setInterval = oldInterval
    globalThis.fetch = oldFetch
  }
})
