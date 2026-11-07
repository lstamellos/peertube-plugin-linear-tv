'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, '..', 'client', 'common-client-plugin.js'), 'utf8')
const sourceURL = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
const loadClient = () => import(sourceURL)

function registerClient (client, translate) {
  let menuHook, route
  client.register({
    registerHook (options) {
      assert.equal(options.target, 'filter:left-menu.links.create.result')
      menuHook = options.handler
    },
    registerClientRoute (options) { route = options },
    peertubeHelpers: {
      translate,
      getBaseRouterRoute () { return '/plugins/linear-tv/router' },
      getBaseStaticRoute () { return '/plugins/linear-tv/static' }
    }
  })
  assert.equal(route.route, 'tv')
  return { menuHook, route }
}

test('Watch link uses native Quick access menu, supported play icon, localizes in Greek and is idempotent', async () => {
  const client = await loadClient()
  const { menuHook } = registerClient(client, async text => {
    assert.equal(text, 'Watch')
    return 'Δείτε'
  })
  const sourceMenu = [
    { key: 'quick-access', title: 'Quick access', links: [{ path: '/videos/overview', icon: 'home', label: 'Home' }] },
    { key: 'my-library', title: 'My library', links: [{ path: '/my-library/history/videos', icon: 'history', label: 'History' }] }
  ]
  const after = await menuHook(sourceMenu)
  assert.equal(after[0].links.length, 2)
  assert.deepEqual(after[0].links[1], { path: '/p/tv', icon: 'play', label: 'Δείτε' })
  assert.equal(after[1], sourceMenu[1], 'other sidebar sections stay unchanged')
  assert.equal(sourceMenu[0].links.length, 1, 'do not mutate the original PeerTube sections')
  assert.deepEqual(await menuHook(after), after, 'no duplicate after repeated hook invocation')
})

test('Watch menu also works for anonymous/empty sidebars and without translation service', async () => {
  const client = await loadClient()
  const { menuHook } = registerClient(client)
  const sections = await menuHook([])
  assert.equal(sections.length, 1)
  assert.deepEqual(sections[0].links, [{ path: '/p/tv', icon: 'play', label: 'Watch' }])
  assert.deepEqual(await menuHook(sections), sections)
  assert.equal(await menuHook(null), null)
})

test('video action opens the correct PeerTube watch URL in a new tab with a descriptive accessible label', async () => {
  const client = await loadClient()
  const originalDocument = globalThis.document
  try {
    globalThis.document = { createElement (tag) {
      assert.equal(tag, 'a')
      return { tag, attrs: {}, setAttribute (key, value) { this.attrs[key] = value } }
    } }
    const video = { uuid: 'dddddddd-dddd-4ddd-addd-dddddddddddd', name: 'Το βίντεο της εβδομάδας' }
    const a = client.createVideoWatchLink(video)
    assert.equal(a.href, '/w/' + video.uuid)
    assert.equal(a.target, '_blank')
    assert.equal(a.rel, 'noopener noreferrer')
    assert.equal(a.className, 'lt-video-link')
    assert.equal(a.attrs['aria-label'], 'Άνοιγμα βίντεο: ' + video.name)
    assert.equal(a.textContent, 'Άνοιγμα ↗')
    assert.match(a.attrs.style, /background:#037780/)
    assert.match(a.attrs.style, /margin-left:auto/)
    assert.match(a.attrs.style, /flex:0 0 auto/)
    assert.match(a.attrs.style, /white-space:nowrap/)
    assert.equal(client.createVideoWatchLink({ name: 'Unresolved video' }), null)
  } finally {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})

test('live hides the programme EPG; post-live restores fresh times and video links without replacing the chat', async () => {
  const client = await loadClient()
  const originalDocument = globalThis.document
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch
  const originalInterval = globalThis.setInterval
  const originalPerformance = globalThis.performance
  let listEl
  const uuid1 = '11111111-1111-4111-8111-111111111111'
  const uuid2 = '22222222-2222-4222-8222-222222222222'
  let responseMode = 'vod'
  let postLiveShift = 0
  const payload = () => ({
    mode: responseMode,
    serverTime: Date.now(),
    title: 'TV', healthy: true,
    current: { uuid: '33333333-3333-4333-8333-333333333333', name: 'On air', channelName: 'Example', duration: 3600 },
    elapsedSeconds: 0,
    endsAt: Date.now() + 300_000,
    chatAnchor: '44444444-4444-4444-8444-444444444444',
    upcoming: [{ uuid: uuid1, name: 'First up', startsAt: Date.now() + 60_000 + postLiveShift, duration: 120 }],
    upcomingAfterLive: [{ uuid: uuid2, name: 'After live', duration: 180 }]
  })
  function element (tag) {
    return {
      tagName: tag.toUpperCase(), children: [], isConnected: true, hidden: false,
      attrs: {}, style: {}, textContent: '', listeners: {},
      classList: { classes: new Set(), toggle (name, enabled) {
        if (enabled) this.classes.add(name)
        else this.classes.delete(name)
      }, contains (name) { return this.classes.has(name) } },
      setAttribute (key, value) { this.attrs[key] = value },
      replaceChildren (...nodes) { this.children = nodes },
      append (...nodes) { this.children.push(...nodes) },
      appendChild (node) { this.children.push(node) },
      addEventListener (event, handler) { this.listeners[event] = handler }
    }
  }
  try {
    globalThis.document = {
      title: '',
      createElement: element,
      head: { appendChild () {} }
    }
    globalThis.window = { location: { origin: 'https://peertube.example' }, PeerTubePlayer: class { constructor () { this.ready = Promise.resolve() } getCurrentTime () { return Promise.resolve(0) } isPlaying () { return Promise.resolve(true) } } }
    globalThis.fetch = async () => ({ ok: true, json: async () => payload() })
    globalThis.setInterval = fn => { globalThis.__ltTick = fn; return 91 }
    globalThis.performance = { now: () => 0 }
    const elements = new Map()
    listEl = element('ol')
    elements.set('#lt-queue', listEl)
    const rootEl = {
      isConnected: true, innerHTML: '',
      querySelector (selector) {
        if (!elements.has(selector)) elements.set(selector, element('div'))
        return elements.get(selector)
      }
    }
    const { route } = registerClient(client)
    route.onMount({ rootEl })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(listEl.children.length, 1)
    const programmePanel = elements.get('.lt-epg')
    assert.equal(programmePanel.hidden, false)
    const firstTime = listEl.children[0].children[0].textContent
    assert.equal(listEl.children[0].children.length, 2, 'time and a single title/action cell')
    const firstEntry = listEl.children[0].children[1]
    assert.equal(firstEntry.className, 'lt-epg-entry')
    assert.match(firstEntry.attrs.style, /display:flex/)
    assert.match(firstEntry.children[0].attrs.style, /flex:1 1 auto/)
    assert.equal(firstEntry.children[0].textContent, 'First up')
    assert.equal(firstEntry.children[0].children[0].textContent, ' · 2′')
    assert.equal(firstEntry.children[1].href, '/w/' + uuid1)
    assert.equal(firstEntry.children[1].textContent, 'Άνοιγμα ↗')
    assert.equal(firstEntry.children[1].target, '_blank')
    const playerBeforeToggle = elements.get('#lt-video').children[0]
    const chatFrame = elements.get('#lt-chat-body').children[0]
    const chatToggle = elements.get('#lt-chat-toggle')
    const chatPanel = elements.get('#lt-chat')
    assert.equal(chatFrame.tagName, 'IFRAME')
    assert.equal(chatToggle.listeners.click instanceof Function, true)
    chatToggle.listeners.click()
    assert.equal(chatPanel.hidden, true)
    assert.equal(chatToggle.attrs['aria-expanded'], 'false')
    assert.equal(elements.get('.lt-layout').classList.contains('lt-chat-hidden'), true)
    assert.strictEqual(elements.get('#lt-video').children[0], playerBeforeToggle)
    assert.strictEqual(elements.get('#lt-chat-body').children[0], chatFrame)
    chatToggle.listeners.click()
    assert.equal(chatPanel.hidden, false)
    assert.equal(chatToggle.attrs['aria-expanded'], 'true')
    assert.equal(elements.get('.lt-layout').classList.contains('lt-chat-hidden'), false)
    assert.strictEqual(elements.get('#lt-video').children[0], playerBeforeToggle)
    assert.strictEqual(elements.get('#lt-chat-body').children[0], chatFrame)
    responseMode = 'live'
    globalThis.__ltTick()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(programmePanel.hidden, true, 'hide heading, message and queue during live')
    assert.equal(listEl.children.length, 0, 'discard stale programme times during live')
    assert.equal(elements.get('#lt-schedule-message').textContent, '')
    assert.equal(elements.get('#lt-video').children[0].tagName, 'IFRAME')
    assert.strictEqual(elements.get('#lt-chat-body').children[0], chatFrame)

    responseMode = 'vod'
    postLiveShift = 3600_000
    globalThis.__ltTick()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(programmePanel.hidden, false, 'restore entire EPG after live')
    assert.equal(listEl.children.length, 1)
    assert.notEqual(listEl.children[0].children[0].textContent, firstTime,
      'rebuild from new server schedule times')
    assert.equal(listEl.children[0].children[1].children[0].textContent, 'First up')
    assert.equal(listEl.children[0].children[1].children[1].href, '/w/' + uuid1)
    assert.strictEqual(elements.get('#lt-chat-body').children[0], chatFrame)
    // The synthetic VOD status schedules a future boundary poll. Switch back
    // to live so the client clears that timer before this node:test exits.
    responseMode = 'live'
    globalThis.__ltTick()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(programmePanel.hidden, true)
  } finally {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    globalThis.fetch = originalFetch
    globalThis.setInterval = originalInterval
    if (originalPerformance === undefined) delete globalThis.performance
    else globalThis.performance = originalPerformance
    delete globalThis.__ltTick
  }
})
