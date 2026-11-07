'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

async function load () {
  const source = readFileSync(join(__dirname, '..', 'client', 'programme-client-plugin.js'), 'utf8')
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
}

test('Settings integration uses valid PeerTube 8.3 General route and preserves the old standalone route', async () => {
  const mod = await load()
  assert.equal(mod.TV_SETTINGS_URL, '/admin/settings/config/general?tv-programme=1')
  let clientRoute, hook
  mod.register({ registerClientRoute (o) { clientRoute = o }, registerHook (o) { hook = o },
    router: { navigateByUrl () {} }, peertubeHelpers: {} })
  assert.equal(clientRoute.route, 'tv-programme')
  assert.equal(typeof clientRoute.onMount, 'function')
  assert.equal(hook.target, 'action:router.navigation-end')
})

test('Settings tab is injected only in Configuration menu; click uses PeerTube router', async () => {
  const oldWindow = global.window
  const oldDocument = global.document
  const url = new URL('https://peertube.example/admin/settings/config/information')
  const nav = {
    links: [], querySelector (q) {
      if (q.startsWith('.')) return this.links[0] || null
      if (q.includes('live')) return null
      return null
    },
    appendChild (link) { this.links.push(link) }
  }
  const content = { querySelector () { return null } }
  const root = { querySelector (q) { return q.includes('lateral-menu') ? nav : content } }
  const created = []
  const navigation = []
  try {
    global.window = { location: url }
    global.document = {
      querySelector (q) { return q === 'my-admin-config' ? root : null },
      createElement (tag) {
        assert.equal(tag, 'a')
        const events = {}
        const classes = new Set()
        const node = { addEventListener (e, cb) { events[e] = cb }, events,
          classList: { toggle (c, val) { if (val) classes.add(c); else classes.delete(c) } },
          setAttribute () {}, removeAttribute () {} }
        created.push(node)
        return node
      }
    }
    const mod = await load()
    let hook
    mod.register({ registerClientRoute () {}, registerHook (o) { hook = o.handler }, peertubeHelpers: {},
      router: { navigateByUrl (value) { navigation.push(value); return Promise.resolve(true) } } })
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(nav.links.length, 1)
    assert.equal(nav.links[0].href, mod.TV_SETTINGS_URL)
    let prevented = false
    nav.links[0].events.click({ button: 0, ctrlKey: false, metaKey: false, shiftKey: false,
      altKey: false, preventDefault () { prevented = true } })
    assert.equal(prevented, true)
    assert.deepEqual(navigation, [mod.TV_SETTINGS_URL])
    hook()
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(nav.links.length, 1, 'No duplicate tab on navigation')
  } finally {
    if (oldWindow === undefined) delete global.window
    else global.window = oldWindow
    if (oldDocument === undefined) delete global.document
    else global.document = oldDocument
  }
})

test('Configuration TV tab mounts the scheduler without touching native route and restores it when leaving', async () => {
  const originalWindow = global.window
  const originalDocument = global.document
  const source = readFileSync(join(__dirname, '..', 'client', 'programme-client-plugin.js'), 'utf8')
  const start = source.indexOf('function mountProgramme (')
  const end = source.indexOf('const TV_SETTINGS_PATH = ')
  assert.ok(start >= 0 && end > start)
  // Substitute only the substantial panel DOM renderer; exercise the *actual* navigation integration.
  const mocked = source.slice(0, start) + `
    function mountProgramme (root) {
      globalThis.__ltMounted = (globalThis.__ltMounted || 0) + 1
      return () => { globalThis.__ltCleaned = (globalThis.__ltCleaned || 0) + 1 }
    }
    ` + source.slice(end)
  const mod = await import('data:text/javascript;base64,' + Buffer.from(mocked).toString('base64'))
  class Element {
    constructor (tag) {
      this.tagName = tag.toUpperCase()
      this.children = []
      this.style = { display: '' }
      this.isConnected = true
      this.events = {}
      this.classList = { toggle () {} }
    }
    addEventListener (type, cb) { this.events[type] = cb }
    setAttribute () {}
    removeAttribute () {}
    appendChild (node) { this.children.push(node); node.parentNode = this }
    remove () { this.parentNode.children = this.parentNode.children.filter(x => x !== this); this.isConnected = false }
    querySelector (selector) {
      if (selector === 'router-outlet') return this.children.find(x => x.tagName === 'ROUTER-OUTLET')
      if (selector === 'my-admin-config-general') return this.children.find(x => x.tagName === 'MY-ADMIN-CONFIG-GENERAL')
      if (selector.startsWith('.lt-settings')) return this.children.find(x => x.className === 'lt-settings-programme-tab')
      return null
    }
  }
  const nav = new Element('ul')
  const outlet = new Element('router-outlet')
  const general = new Element('my-admin-config-general')
  const content = new Element('div')
  content.appendChild(outlet)
  content.appendChild(general)
  const root = { querySelector (s) { return s.includes('lateral-menu') ? nav : content } }
  const globalKey = '__ltMounted'
  try {
    global.window = { location: new URL('https://peertube.example' + mod.TV_SETTINGS_URL) }
    global.document = { querySelector () { return root }, createElement (tag) { return new Element(tag) } }
    let hook
    mod.register({ registerClientRoute () {}, registerHook (opts) { hook = opts.handler },
      router: { navigateByUrl () {} }, peertubeHelpers: {} })
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(global[globalKey], 1)
    assert.equal(general.style.display, 'none')
    assert.equal(content.children.length, 3)
    assert.equal(nav.children.length, 1)
    hook()
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(global[globalKey], 1, 'same mounted panel while staying on tab')
    global.window.location = new URL('https://peertube.example/admin/settings/config/live')
    hook()
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(general.style.display, '')
    assert.equal(content.children.length, 2, 'panel host was removed')
    assert.equal(global.__ltCleaned, 1)
  } finally {
    if (originalWindow === undefined) delete global.window
    else global.window = originalWindow
    if (originalDocument === undefined) delete global.document
    else global.document = originalDocument
    delete global.__ltMounted
    delete global.__ltCleaned
  }
})
