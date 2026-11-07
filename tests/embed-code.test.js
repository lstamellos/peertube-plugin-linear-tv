'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, '..', 'client/common-client-plugin.js'), 'utf8')
const loadClient = () => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))

test('generated embed uses the installed instance origin and a stable, upgrade-safe route', async () => {
  const { generateEmbedCode } = await loadClient()
  const hosts = [
    ['https://video.example.org', '/plugins/linear-tv/router'],
    ['https://pt.example.net:8443', '/plugins/linear-tv/0.2.8/router'],
    ['https://videos.test.example', '/plugins/linear-tv/0.2.8-beta.1/router']
  ]
  for (const [origin, route] of hosts) {
    const html = generateEmbedCode(origin, route)
    assert.ok(html.includes('src="' + origin + '/plugins/linear-tv/router/embed"'))
    assert.ok(html.includes('const peerTubeOrigin = "' + origin + '"'))
    assert.match(html, /width:100%;height:850px;border:0;overflow:hidden/)
    assert.match(html, /scrolling="no"/)
    assert.match(html, /event\.origin !== peerTubeOrigin/)
    assert.match(html, /event\.source !== frame\.contentWindow/)
    assert.match(html, /linear-tv:resize/)
    assert.match(html, /linear-tv:request-size/)
    assert.match(html, /document\.currentScript\.previousElementSibling/)
    assert.doesNotMatch(html, /omniatv|cremedia|video\.omniatv/i)
    assert.doesNotMatch(html, /postMessage\([^)]*,\s*['"]\*['"]\s*\)/)
  }
  assert.throws(() => generateEmbedCode('javascript:bad', '/plugins/linear-tv/router'), /HTTP/)
  assert.throws(() => generateEmbedCode('https://video.example.org', '//another.example/router'), /local/)
})

test('Embed toggle shows and hides the instance-specific snippet without touching the player', async () => {
  const { mountLinearTV } = await loadClient()
  const priorWindow = globalThis.window
  const priorFetch = globalThis.fetch
  const priorInterval = globalThis.setInterval
  const oldDocument = globalThis.document
  const priorNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const events = new Map()
  const nodes = new Map()
  const makeNode = selector => ({
    selector, hidden: selector === '#lt-embed-panel', textContent: '', value: '',
    style: {}, attrs: {}, isConnected: true, classList: { toggle () {} },
    addEventListener (name, handler) { events.set(selector + ':' + name, handler) },
    setAttribute (name, value) { this.attrs[name] = value },
    getBoundingClientRect () { return { height: 0, top: 0 } },
    focus () { this.focused = true },
    select () { this.selected = true }
  })
  const root = {
    isConnected: true, innerHTML: '',
    querySelector (selector) {
      if (!nodes.has(selector)) nodes.set(selector, makeNode(selector))
      return nodes.get(selector)
    }
  }
  let playerReplacements = 0
  try {
    globalThis.window = { location: { origin: 'https://video.example.org' }, innerHeight: 1000,
      addEventListener () {}, matchMedia () { return { matches: false } } }
    globalThis.document = { documentElement: { lang: 'en' }, head: { appendChild () {} } }
    globalThis.fetch = () => new Promise(() => {})
    globalThis.setInterval = () => 123
    let copiedCode = null
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
      clipboard: { async writeText (value) { copiedCode = value } }
    } })
    mountLinearTV(root, {
      routerBase: '/plugins/linear-tv/0.2.8/router',
      staticBase: '/plugins/linear-tv/0.2.8/static',
      embedded: false
    })
    assert.match(root.innerHTML, /id="lt-embed-toggle"[^>]*>Embed<\/button>/)
    assert.match(root.innerHTML, /id="lt-embed-code"/)
    assert.match(root.innerHTML, /id="lt-homepage-code"/)
    const toggle = events.get('#lt-embed-toggle:click')
    assert.equal(typeof toggle, 'function')
    assert.equal(nodes.get('#lt-embed-panel').hidden, true)
    const video = nodes.get('#lt-video')
    video.replaceChildren = () => { playerReplacements++ }
    toggle()
    assert.equal(nodes.get('#lt-embed-panel').hidden, false)
    assert.equal(nodes.get('#lt-embed-toggle').attrs['aria-expanded'], 'true')
    assert.match(nodes.get('#lt-embed-code').value, /https:\/\/video\.example\.org\/plugins\/linear-tv\/router\/embed/)
    assert.equal(nodes.get('#lt-homepage-code').value,
      '<peertube-container data-linear-tv="true"></peertube-container>')
    assert.equal(playerReplacements, 0)
    const copy = events.get('#lt-embed-copy:click')
    assert.equal(typeof copy, 'function')
    await copy()
    assert.equal(copiedCode, nodes.get('#lt-embed-code').value)
    assert.equal(nodes.get('#lt-embed-feedback').textContent, 'Copied!')
    const homepageCopy = events.get('#lt-homepage-copy:click')
    assert.equal(typeof homepageCopy, 'function')
    await homepageCopy()
    assert.equal(copiedCode, nodes.get('#lt-homepage-code').value)
    assert.equal(nodes.get('#lt-homepage-feedback').textContent, 'Copied!')
    assert.equal(playerReplacements, 0)
    toggle()
    assert.equal(nodes.get('#lt-embed-panel').hidden, true)
    assert.equal(nodes.get('#lt-embed-toggle').attrs['aria-expanded'], 'false')
    assert.equal(playerReplacements, 0)

    // The same UI is mounted as an iframe and inside homepage markup.
    // Its Embed button must not be rendered in embedded mode.
    mountLinearTV(root, {
      routerBase: '/plugins/linear-tv/0.2.9/router',
      staticBase: '/plugins/linear-tv/0.2.9/static',
      embedded: true
    })
    assert.doesNotMatch(root.innerHTML, /id="lt-embed-toggle"/)
    assert.match(root.innerHTML, /id="lt-sound"/)
    assert.match(root.innerHTML, /id="lt-chat-toggle"/)
    assert.match(root.innerHTML, /class="lt-epg"/)
  } finally {
    if (priorWindow === undefined) delete globalThis.window
    else globalThis.window = priorWindow
    if (oldDocument === undefined) delete globalThis.document
    else globalThis.document = oldDocument
    globalThis.fetch = priorFetch
    globalThis.setInterval = priorInterval
    if (priorNavigator) Object.defineProperty(globalThis, 'navigator', priorNavigator)
    else delete globalThis.navigator
  }
})

test('copy button copies exact generated markup and gives localizable feedback', async () => {
  const { generateEmbedCode } = await loadClient()
  const html = generateEmbedCode('https://pt.example.org', '/plugins/linear-tv/router')
  assert.equal(html.includes('</script>'), true)
  assert.match(html, /allowfullscreen/)
  assert.ok(html.indexOf('</iframe>') < html.indexOf('<script>'))
  assert.ok(html.includes('style="display:block'))
  assert.ok(html.includes("const frame = document.currentScript.previousElementSibling"))
})

test('homepage snippet uses the PeerTube-allowed tag instead of unsupported HTML', async () => {
  const { generateHomepageTag } = await loadClient()
  assert.equal(generateHomepageTag(), '<peertube-container data-linear-tv="true"></peertube-container>')
})
