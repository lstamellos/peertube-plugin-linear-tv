'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, '..', 'client', 'common-client-plugin.js'), 'utf8')
const loadClient = () => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))

test('Embed access requires an authenticated PeerTube administrator, never moderator or visitor', async () => {
  const { isEmbedAdministrator } = await loadClient()
  assert.equal(isEmbedAdministrator({ isLoggedIn: () => true, getUser: () => ({ role: 0 }) }), true)
  assert.equal(isEmbedAdministrator({ isLoggedIn: () => true, getUser: () => ({ role: 1 }) }), false)
  assert.equal(isEmbedAdministrator({ isLoggedIn: () => true, getUser: () => ({ role: 2 }) }), false)
  assert.equal(isEmbedAdministrator({ isLoggedIn: () => false, getUser: () => ({ role: 0 }) }), false)
  assert.equal(isEmbedAdministrator({ isLoggedIn: () => true, getUser: () => null }), false)
  assert.equal(isEmbedAdministrator({ isLoggedIn: () => true, getUser: () => { throw new Error('no user') } }), false)
  assert.equal(isEmbedAdministrator({ getUser: () => ({ role: 0 }) }), false)
  assert.equal(isEmbedAdministrator(null), false)
})

test('access changes hide the Embed button and close an already open panel', async () => {
  const { setEmbedAccess } = await loadClient()
  const button = { hidden: true, attrs: {}, setAttribute (key, value) { this.attrs[key] = value } }
  const panel = { hidden: true }
  const root = { querySelector: selector => selector === '#lt-embed-toggle' ? button : panel }
  setEmbedAccess(root, true)
  assert.equal(button.hidden, false)
  panel.hidden = false
  setEmbedAccess(root, false)
  assert.equal(button.hidden, true)
  assert.equal(panel.hidden, true)
  assert.equal(button.attrs['aria-expanded'], 'false')
  assert.doesNotThrow(() => setEmbedAccess({ querySelector: () => null }, false))
})

test('native TV route reacts to login role changes and logout', async () => {
  const { register } = await loadClient()
  const old = { window: globalThis.window, document: globalThis.document,
    fetch: globalThis.fetch, setInterval: globalThis.setInterval }
  const hooks = new Map()
  let route
  let role = 0
  let loggedIn = true
  const button = { hidden: false, attrs: {}, setAttribute (key, value) { this.attrs[key] = value } }
  const panel = { hidden: true }
  const nodes = new Map([['#lt-embed-toggle', button], ['#lt-embed-panel', panel]])
  const root = {
    isConnected: true, innerHTML: '',
    querySelector (selector) {
      if (!nodes.has(selector)) nodes.set(selector, {
        hidden: false, textContent: '', style: {}, isConnected: true,
        classList: { toggle () {} },
        addEventListener () {}, setAttribute () {},
        getBoundingClientRect () { return { height: 0, top: 0 } }
      })
      return nodes.get(selector)
    }
  }
  try {
    globalThis.window = { location: { origin: 'https://example.org' }, innerHeight: 900,
      addEventListener () {}, matchMedia () { return { matches: false } } }
    globalThis.document = { documentElement: { lang: 'en' }, head: { appendChild () {} } }
    globalThis.fetch = () => new Promise(() => {})
    globalThis.setInterval = () => 1
    register({
      registerClientRoute (item) { route = item },
      registerHook ({ target, handler }) { hooks.set(target, handler) },
      peertubeHelpers: {
        getBaseRouterRoute: () => '/plugins/linear-tv/router',
        getBaseStaticRoute: () => '/plugins/linear-tv/static',
        isLoggedIn: () => loggedIn,
        getUser: () => ({ role })
      }
    })
    route.onMount({ rootEl: root })
    assert.match(root.innerHTML, /id="lt-embed-toggle"[^>]*>Embed<\/button>/)
    panel.hidden = false
    hooks.get('action:auth-user.logged-out')()
    assert.equal(button.hidden, true)
    assert.equal(panel.hidden, true)
    assert.equal(button.attrs['aria-expanded'], 'false')

    loggedIn = true
    role = 1
    hooks.get('action:auth-user.information-loaded')({ user: { role: 1 } })
    assert.equal(button.hidden, true)
    hooks.get('action:auth-user.information-loaded')({ user: { role: 2 } })
    assert.equal(button.hidden, true)
    role = 0
    hooks.get('action:auth-user.information-loaded')({ user: { role: 0 } })
    assert.equal(button.hidden, false)
  } finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  }
})

test('standalone and homepage embeds never render the admin button', async () => {
  const { mountLinearTV } = await loadClient()
  const prior = { window: globalThis.window, document: globalThis.document,
    fetch: globalThis.fetch, setInterval: globalThis.setInterval }
  const root = {
    innerHTML: '', isConnected: true,
    querySelector () {
      return { hidden: true, isConnected: true, style: {}, classList: { toggle () {} },
        addEventListener () {}, getBoundingClientRect () { return { height: 0, top: 0 } } }
    }
  }
  try {
    globalThis.window = { location: { origin: 'https://example.org' }, innerHeight: 900,
      addEventListener () {}, matchMedia () { return { matches: false } } }
    globalThis.document = { documentElement: { lang: 'en' } }
    globalThis.fetch = () => new Promise(() => {})
    globalThis.setInterval = () => 1
    mountLinearTV(root, {
      routerBase: '/plugins/linear-tv/router', staticBase: '/plugins/linear-tv/static',
      embedded: true, showEmbed: true
    })
    assert.doesNotMatch(root.innerHTML, /id="lt-embed-toggle"/)
    mountLinearTV(root, {
      routerBase: '/plugins/linear-tv/router', staticBase: '/plugins/linear-tv/static',
      embedded: false, showEmbed: false
    })
    assert.match(root.innerHTML, /id="lt-embed-toggle"[^>]*hidden>Embed<\/button>/)
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  }
})

test('CSS enforces hidden admin button regardless of theme overrides', () => {
  const css = readFileSync(join(__dirname, '..', 'client', 'linear-tv.css'), 'utf8')
  assert.match(css, /\.lt-embed-toggle\[hidden\]\s*\{\s*display:\s*none\s*!important/)
})
