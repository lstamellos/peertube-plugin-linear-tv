'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, '..', 'client', 'common-client-plugin.js'), 'utf8')
const loadClient = () => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))

function themedDocument (vars = {}, background = '#ffffff', foreground = '#111111') {
  const doc = { body: { type: 'body' }, documentElement: { type: 'root', lang: 'en' } }
  const win = {
    location: { origin: 'https://video.example.org' },
    parent: null,
    CSS: { supports: (kind, value) => kind === 'color' && !/nonsense/.test(value) },
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({
      color: foreground,
      backgroundColor: background,
      getPropertyValue: key => vars[key] || ''
    })
  }
  win.parent = win
  win.document = doc
  return { doc, win }
}

test('native PeerTube light and dark CSS variables become 12 valid Live Chat colors', async () => {
  const { chatThemeColors, chatThemeURL } = await loadClient()
  const dark = themedDocument({
    '--is-dark': '1', '--fg': 'rgb(244, 245, 247)', '--bg': 'rgb(16, 24, 32)',
    '--primary': '#0aa6b4', '--input-bg': '#29343d', '--on-primary': '#000'
  })
  const colors = chatThemeColors(dark.win, dark.doc)
  assert.equal(colors.mainBackground, 'rgb(16, 24, 32)')
  assert.equal(colors.mainForeground, 'rgb(244, 245, 247)')
  assert.equal(colors.inputBackground, '#29343d')
  assert.equal(colors.buttonBackground, '#0aa6b4')
  assert.equal(Object.keys(colors).length, 12)
  const url = new URL(chatThemeURL('aaa/bbb', colors), dark.win.location.origin)
  assert.equal(url.pathname, '/plugins/livechat/router/webchat/room/aaa%2Fbbb')
  assert.equal(url.searchParams.get('_ac_mainBackground'), 'rgb(16, 24, 32)')
  assert.equal(url.searchParams.get('_ac_buttonBackground'), '#0aa6b4')
  assert.equal([...url.searchParams.keys()].length, 12)
  const light = themedDocument({ '--is-dark': '0', '--fg': '#131313', '--bg': '#fafafa' })
  assert.equal(chatThemeColors(light.win, light.doc).mainBackground, '#fafafa')
  assert.equal(chatThemeColors(light.win, light.doc).mainForeground, '#131313')
  assert.equal(chatThemeURL('video', null), '/plugins/livechat/router/webchat/room/video')
})

test('same-origin homepage embed takes the selected PeerTube theme from parent, external embeds do not', async () => {
  const { chatThemeColors, chatThemeSource } = await loadClient()
  const parent = themedDocument({ '--is-dark': '1', '--fg': '#f3f5f7', '--bg': '#101820' })
  const child = themedDocument({ '--is-dark': '0', '--fg': '#111111', '--bg': '#ffffff' })
  child.win.parent = parent.win
  assert.equal(chatThemeSource(child.win, child.doc, true).doc, parent.doc)
  assert.equal(chatThemeColors(child.win, child.doc, true).mainBackground, '#101820')
  assert.equal(chatThemeColors(child.win, child.doc, false).mainBackground, '#ffffff')
  Object.defineProperty(child.win.parent, 'location', { get () { throw new Error('SecurityError') } })
  assert.equal(chatThemeColors(child.win, child.doc, true).mainBackground, '#ffffff',
    'cross-origin embed must never inspect the host theme')
})

test('no unresolved CSS variables or unsafe values go into Live Chat URL', async () => {
  const { chatThemeColors } = await loadClient()
  const { win, doc } = themedDocument({
    '--fg': 'var(--missing)', '--bg': 'transparent',
    '--primary': 'red; background: url(evil)', '--fg-300': 'nonsense'
  }, '#f0f0f0', '#222222')
  const colors = chatThemeColors(win, doc)
  assert.equal(colors.mainForeground, '#222222')
  assert.equal(colors.mainBackground, '#f0f0f0')
  assert.equal(colors.buttonBackground, '#c75025')
  assert.equal(colors.greyForeground, '#59636c')
})

test('same-origin Live Chat iframe updates CSS variables without navigation or DOM replacement', async () => {
  const { applyChatTheme, chatThemeColors } = await loadClient()
  const { win, doc } = themedDocument({ '--bg': '#101820', '--fg': '#f3f5f7' })
  const vars = new Map()
  const chatBody = {
    classList: { contains: cls => cls === 'converse-fullscreen' },
    style: { setProperty (name, value) { vars.set(name, value) } }
  }
  let accesses = 0
  const iframe = {
    isConnected: true, src: 'https://video.example.org/plugins/livechat/router/webchat/room/uuid',
    contentWindow: {
      location: { origin: win.location.origin },
      document: { body: chatBody }
    }
  }
  const originalURL = iframe.src
  assert.equal(applyChatTheme(iframe, chatThemeColors(win, doc), win.location.origin), true)
  assert.equal(vars.get('--peertube-main-background'), '#101820')
  assert.equal(vars.get('--peertube-main-foreground'), '#f3f5f7')
  // Simulate switching PeerTube to light mode: same frame and same XMPP session.
  win.getComputedStyle = () => ({
    color: '#141414', backgroundColor: '#ffffff',
    getPropertyValue: key => ({ '--bg': '#ffffff', '--fg': '#141414', '--is-dark': '0' })[key] || ''
  })
  assert.equal(applyChatTheme(iframe, chatThemeColors(win, doc), win.location.origin), true)
  assert.equal(vars.get('--peertube-main-background'), '#ffffff')
  assert.equal(iframe.src, originalURL)
  assert.equal(iframe.contentWindow.document.body, chatBody)

  iframe.contentWindow.location.origin = 'https://external.example'
  assert.equal(applyChatTheme(iframe, chatThemeColors(win, doc), win.location.origin), false)
  iframe.contentWindow.location.origin = win.location.origin
  Object.defineProperty(iframe.contentWindow, 'document', {
    get () { accesses++; throw new Error('SecurityError') }
  })
  assert.equal(applyChatTheme(iframe, chatThemeColors(win, doc), win.location.origin), false)
  assert.equal(accesses, 1)
})

test('standalone embed supports both OS color schemes without affecting PeerTube watch-page styles', () => {
  const css = readFileSync(join(__dirname, '..', 'client', 'embed.css'), 'utf8')
  assert.match(css, /@media \(prefers-color-scheme: light\)/)
  assert.match(css, /body\.lt-embed-document\s*\{\s*background: #fff; color: #202124/)
  assert.doesNotMatch(css, /#linear-tv-app\s*\{\s*background: #fff/)
})

test('mounted TV updates chat theme on the existing 5-second tick without iframe reload', async () => {
  const { mountLinearTV } = await loadClient()
  const saved = { window: globalThis.window, document: globalThis.document,
    fetch: globalThis.fetch, setInterval: globalThis.setInterval }
  let tick
  let theme = { '--fg': '#f3f5f7', '--bg': '#101820', '--is-dark': '1' }
  let chatFrameCount = 0
  let chatReplacements = 0
  const chatStyles = new Map()
  const chatBodyNode = {
    children: [],
    replaceChildren (...nodes) { chatReplacements++; this.children = nodes }
  }
  const nodes = new Map([['#lt-chat-body', chatBodyNode]])
  const makeNode = () => ({
    isConnected: true, style: {}, textContent: '', hidden: false,
    classList: { toggle () {} }, addEventListener () {}, setAttribute () {},
    getBoundingClientRect () { return { height: 270, top: 120 } },
    replaceChildren () {}
  })
  const root = {
    isConnected: true, innerHTML: '',
    querySelector (selector) {
      if (!nodes.has(selector)) nodes.set(selector, makeNode())
      return nodes.get(selector)
    }
  }
  const doc = {
    body: {}, documentElement: { lang: 'en' },
    createElement (tag) {
      if (tag !== 'iframe') return makeNode()
      chatFrameCount++
      const frame = makeNode()
      frame.listeners = {}
      frame.addEventListener = (name, callback) => { frame.listeners[name] = callback }
      frame.contentWindow = {
        location: { origin: 'https://video.example.org' },
        document: { body: {
          classList: { contains: name => name === 'converse-fullscreen' },
          style: { setProperty (key, value) { chatStyles.set(key, value) } }
        } }
      }
      return frame
    }
  }
  const win = {
    location: { origin: 'https://video.example.org' }, innerHeight: 900,
    parent: null, addEventListener () {}, matchMedia: () => ({ matches: false }),
    CSS: { supports: () => true },
    getComputedStyle () {
      return {
        color: theme['--fg'], backgroundColor: theme['--bg'],
        getPropertyValue: name => theme[name] || ''
      }
    }
  }
  win.parent = win
  try {
    globalThis.window = win
    globalThis.document = doc
    globalThis.fetch = async () => ({ ok: true, json: async () => ({
      mode: 'empty', title: 'TV', healthy: true, current: null,
      chatAnchor: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', upcoming: []
    }) })
    globalThis.setInterval = fn => { tick = fn; return 77 }
    mountLinearTV(root, {
      routerBase: '/plugins/linear-tv/router', staticBase: '/plugins/linear-tv/static'
    })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(chatFrameCount, 1)
    const iframe = chatBodyNode.children[0]
    const initialURL = iframe.src
    assert.match(initialURL, /_ac_mainBackground=%23101820/)
    iframe.listeners.load()
    assert.equal(chatStyles.get('--peertube-main-background'), '#101820')
    theme = { '--fg': '#222222', '--bg': '#ffffff', '--is-dark': '0' }
    tick()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(chatStyles.get('--peertube-main-background'), '#ffffff')
    assert.equal(chatStyles.get('--peertube-main-foreground'), '#222222')
    assert.strictEqual(chatBodyNode.children[0], iframe)
    assert.equal(iframe.src, initialURL)
    assert.equal(chatFrameCount, 1)
    assert.equal(chatReplacements, 1)
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  }
})
