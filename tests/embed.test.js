'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const plugin = require('../main')
const { renderEmbedPage, FRAME_ANCESTORS } = require('../lib/embed')
const root = join(__dirname, '..')

const client = readFileSync(join(root, 'client/common-client-plugin.js'), 'utf8')
const embedClient = readFileSync(join(root, 'client/embed-client.js'), 'utf8')
const loadClient = () => import('data:text/javascript;base64,' + Buffer.from(client).toString('base64'))

test('a standalone embed route reuses version-aware plugin assets and restricts framing', async () => {
  const routes = {}
  const headers = { 'X-Frame-Options': 'SAMEORIGIN' }
  try {
    await plugin.register({
      registerSetting () {}, registerHook () {},
      getRouter: () => ({ get: (route, handler) => { routes[route] = handler },
        post () {}, put () {}, delete () {} }),
      storageManager: {}, settingsManager: { onSettingsChange () {} },
      peertubeHelpers: {
        logger: { warn () {} },
        plugin: {
          getBaseRouterRoute: () => '/plugins/linear-tv/0.2.6/router',
          getBaseStaticRoute: () => '/plugins/linear-tv/0.2.6/static'
        }
      }
    })
    assert.equal(typeof routes['/embed'], 'function')
    const res = {
      getHeader (key) { return headers[key] },
      removeHeader (key) { delete headers[key] },
      setHeader (key, value) { headers[key] = value },
      status (code) { this.code = code; return this },
      send (body) { this.body = body; return this }
    }
    routes['/embed']({ baseUrl: '/plugins/linear-tv/0.2.6/router' }, res)
    assert.equal(res.code, 200)
    assert.equal(headers['Content-Type'], 'text/html; charset=utf-8')
    assert.equal(headers['X-Frame-Options'], undefined)
    assert.equal(headers['Cache-Control'], 'no-store, max-age=0')
    assert.equal(headers['Content-Security-Policy'], FRAME_ANCESTORS)
    assert.match(res.body, /id="lt-embed-root"/)
    assert.match(res.body, /data-router-base="\/plugins\/linear-tv\/0\.2\.6\/router"/)
    assert.match(res.body, /static\/tv-assets\/linear-tv\.css/)
    assert.match(res.body, /static\/tv-assets\/embed\.css/)
    assert.match(res.body, /static\/tv-assets\/embed-client\.js/)
    assert.doesNotMatch(res.body, /<script(?![^>]*src=)[^>]*>/i, 'no inline scripts on embed route')
    assert.doesNotMatch(res.body, /<iframe/, 'the TV app must own the single video iframe')
    headers['Content-Security-Policy'] = "default-src 'self'; frame-ancestors 'none'; script-src 'self'"
    routes['/embed']({ baseUrl: '/plugins/linear-tv/0.2.6/router' }, res)
    assert.equal(headers['Content-Security-Policy'], "default-src 'self'; script-src 'self'; " + FRAME_ANCESTORS)
  } finally { await plugin.unregister() }
})

test('embed html escapes all route attributes', () => {
  const html = renderEmbedPage({ routerBase: '/router?a=" onload="alert(1)', staticBase: '/assets?b=" onclick="alert(1)' })
  assert.match(html, /&quot;/)
  assert.doesNotMatch(html, /" onclick="alert/)
  assert.doesNotMatch(html, /" onload="alert/)
})

test('plugin packaging serves reusable client module and embed stylesheet', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.version, '0.2.7')
  assert.equal(pkg.license, 'GPL-3.0-only')
  assert.equal(pkg.staticDirs['tv-assets'], 'client')
  assert.match(embedClient, /import\s*\{\s*mountLinearTV\s*\}\s*from\s*'\.\/common-client-plugin\.js'/)
  assert.match(client, /export\s*\{[^}]*mountLinearTV/)
  assert.match(client, /onMount:\s*\(\{ rootEl \}\)\s*=>\s*mountLinearTV/)
  assert.match(embedClient, /event\.source\s*===\s*window\.parent/)
  assert.match(embedClient, /window\.parent\.postMessage\(\{ type: 'linear-tv:resize'/)
  assert.match(embedClient, /rootEl\.getBoundingClientRect\(\)\.bottom/)
  assert.doesNotMatch(embedClient, /document\.documentElement\.scrollHeight/)
  assert.doesNotMatch(embedClient, /postMessage\([^)]*,\s*['"]\*['"]\s*\)/)
  assert.match(readFileSync(join(root, 'client/embed.css'), 'utf8'), /\.lt-epg ol\s*\{[^}]*max-height:/)
})

test('chat sizing inside WordPress iframe follows the player, not iframe viewport height', async () => {
  const { fitChatToPlayer } = await loadClient()
  const video = { getBoundingClientRect () { return { height: 320 } } }
  const chat = { hidden: false, style: {}, getBoundingClientRect () { return { top: 250 } } }
  const frame = { innerHeight: 280, matchMedia () { return { matches: false } } }
  fitChatToPlayer(video, chat, frame, true)
  assert.equal(chat.style.height, '320px')
  fitChatToPlayer(video, chat, frame)
  assert.equal(chat.style.height, '18px', 'the original watch page retains its viewport cap')
})
