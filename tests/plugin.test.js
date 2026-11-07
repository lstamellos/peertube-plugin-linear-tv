'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const plugin = require('../main')
const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005']
const vod = (index, channel) => ({ uuid: ids[index], name: 'Video-' + index, duration: 180,
  state: { id: 1 }, privacy: { id: 1 }, isLive: false,
  channel: { name: channel }, publishedAt: '2026-10-28T00:00:00Z' })
const live = { ...vod(2, 'channel-a'), isLive: true, duration: 0, state: { id: 1 } }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function eventually (getter, predicate, label) {
  for (let i = 0; i < 30; i++) {
    const value = getter()
    if (predicate(value)) return value
    await delay(10)
  }
  throw new Error('Timed out: ' + label)
}
test('PeerTube plugin hooks, EPG, live preemption, public VOD priority after resume', async () => {
  const originalFetch = global.fetch
  let liveRunning = false
  let apiFailure = false
  let newPublic = null
  let unlisted = null
  const calls = []
  global.fetch = async url => {
    const req = new URL(String(url))
    calls.push(req)
    if (apiFailure) return new Response('failure', { status: 503 })
    // PeerTube 8.3.2 rejects privacyOneOf for unauthenticated public API calls.
    if (req.searchParams.has('privacyOneOf')) {
      return new Response('Unauthorized privacy filter', { status: 401 })
    }
    const source = req.pathname.includes('channel-a') ? 'channel-a' : 'channel-b'
    const data = req.searchParams.get('isLive') === 'true'
      ? (source === 'channel-a' && liveRunning ? [live] : [])
      : (source === 'channel-a' ? [vod(0, source)] : [newPublic, unlisted, vod(1, source)].filter(Boolean))
    return new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json' } })
  }
  const hooks = {}
  const routes = {}
  let changeSettings
  const stored = {}
  const settings = {
    'source-account': 'unused-account', 'source-channels': 'channel-a, channel-b',
    'video-limit': '3', 'page-title': 'Example TV', 'chat-anchor-uuid': ids[0]
  }
  const router = { get: (path, fn) => { routes[path] = fn }, post: (path, fn) => { routes['POST ' + path] = fn },
    put: (path, fn) => { routes['PUT ' + path] = fn }, delete: (path, fn) => { routes['DELETE ' + path] = fn } }
  const reply = () => {
    const res = { setHeader () {}, json (body) { this.result = body } }
    routes['/status']({}, res)
    return res.result
  }
  try {
    await plugin.register({
      registerSetting () {}, registerHook: ({ target, handler }) => { hooks[target] = handler },
      getRouter: () => router,
      settingsManager: { getSettings: async () => settings,
        onSettingsChange (handler) { changeSettings = handler } },
      storageManager: { getData: async key => stored[key], storeData: async (key, value) => { stored[key] = JSON.parse(JSON.stringify(value)) } },
      peertubeHelpers: { logger: { warn () {} }, config: { getServerListeningConfig: () => ({ hostname: '0.0.0.0', port: 9000 }) } }
    })
    hooks['action:application.listening']()
    let result = await eventually(reply, v => v.mode === 'vod' && v.upcoming.length > 0, 'initial VOD')
    assert.equal(result.title, 'Example TV')
    assert.equal(result.chatAnchor, ids[0])
    assert.equal(result.upcoming[0].uuid, ids[1])
    // External framing belongs to the installation, not to a hard-coded host.
    const programmeBeforeEmbedSetting = stored['linear-tv-state-v1'].revision
    settings['embed-allowed-origins'] = 'https://www.example.org'
    await changeSettings()
    assert.equal(reply().current.uuid, ids[0])
    assert.equal(stored['linear-tv-state-v1'].revision, programmeBeforeEmbedSetting,
      'changing the embed allowlist must not restart the current programme')
    const embedHeaders = {}
    const embedResponse = {
      getHeader (key) { return embedHeaders[key] },
      setHeader (key, value) { embedHeaders[key] = value },
      removeHeader (key) { delete embedHeaders[key] },
      status (code) { this.code = code; return this },
      send (body) { this.body = body; return this }
    }
    routes['/embed']({ baseUrl: '/plugins/linear-tv/router' }, embedResponse)
    assert.equal(embedResponse.code, 200)
    assert.equal(embedHeaders['Content-Security-Policy'],
      "frame-ancestors 'self' https://www.example.org")
    assert.match(embedResponse.body, /data-allowed-origins="\\[&quot;https:\/\/www\.example\.org&quot;\\]"/)
    settings['embed-allowed-origins'] = 'https://www.example.org/path'
    await changeSettings()
    routes['/embed']({ baseUrl: '/plugins/linear-tv/router' }, embedResponse)
    assert.equal(embedHeaders['Content-Security-Policy'],
      "frame-ancestors 'self' https://www.example.org",
      'invalid allowlist changes must not replace the working configuration')
    settings['embed-allowed-origins'] = 'https://www.example.org'
    assert.ok(calls.every(x => x.hostname === '127.0.0.1'))
    assert.ok(calls.every(x => x.searchParams.get('includeScheduledLive') === 'true'))
    assert.ok(calls.every(x => !x.searchParams.has('privacyOneOf')), 'anonymous API cannot use privacyOneOf')
    assert.ok(calls.every(x => !x.pathname.includes('unused-account')))
    const beforeLiveOffset = result.elapsedSeconds
    liveRunning = true
    hooks['action:live.video.state.updated']()
    result = await eventually(reply, v => v.mode === 'live', 'start live')
    assert.equal(result.current.uuid, live.uuid)
    assert.equal(result.upcomingAfterLive[0].uuid, ids[0])
    assert.equal(result.upcomingAfterLive[0].resumed, true)
    // A new public publication follows the resumed programme, never preempts it.
    const publishedAt = new Date(result.serverTime + 1).toISOString()
    newPublic = { ...vod(3, 'channel-b'), publishedAt }
    unlisted = { ...vod(4, 'channel-b'), publishedAt, privacy: { id: 2 } }
    await delay(10)
    hooks['action:api.video.uploaded']()
    result = await eventually(reply, v => v.mode === 'live' && v.upcomingAfterLive[1]?.uuid === ids[3], 'new public after live')
    assert.deepEqual(result.upcomingAfterLive.map(v => v.uuid), [ids[0], ids[3], ids[1]])
    assert.ok(!result.upcomingAfterLive.some(v => v.uuid === ids[4]))
    apiFailure = true
    hooks['action:live.video.state.updated']()
    result = await eventually(reply, v => !v.healthy, 'API failure')
    assert.equal(result.mode, 'live', 'API failure must not end live')
    apiFailure = false
    liveRunning = false
    hooks['action:live.video.state.updated']()
    result = await eventually(reply, v => v.mode === 'vod' && v.healthy, 'resume VOD')
    assert.equal(result.current.uuid, ids[0])
    assert.ok(Math.abs(result.elapsedSeconds - beforeLiveOffset) < 2,
      'interrupted programme must resume without counting elapsed live time')
    assert.equal(result.upcoming[0].uuid, ids[3])
    assert.ok(result.upcoming[0].startsAt > result.serverTime)
    assert.ok(!result.upcoming.some(v => v.uuid === ids[4]))
    assert.ok(stored['linear-tv-state-v1'])
  } finally {
    await plugin.unregister()
    global.fetch = originalFetch
  }
})
