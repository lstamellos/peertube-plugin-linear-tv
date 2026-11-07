'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const plugin = require('../main')
const ids = [1, 2, 3, 4, 5].map(i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
const media = (idx, privacy = 1) => ({ uuid: ids[idx], name: 'Broadcast ' + idx, duration: 180,
  isLive: false, state: { id: 1 }, privacy: { id: privacy }, nsfw: false, blacklisted: false,
  channel: { name: 'news', displayName: 'News' }, publishedAt: '2026-10-28T00:00:00Z' })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until (fn) { for (let i = 0; i < 90; i++) { if (fn()) return; await sleep(10) } throw new Error('timeout') }
function response (admin = true) {
  return { admin, code: 200, headers: {}, status (n) { this.code = n; return this },
    setHeader (k, v) { this.headers[k] = v }, json (body) { this.data = body; return this } }
}
test('admin programming API enforces authentication and controls queue without replaying current VOD', async () => {
  const originalFetch = global.fetch
  const logs = []
  const calls = []
  let publishedFourth = false
  global.fetch = async url => {
    const u = new URL(String(url))
    calls.push(u)
    if (u.pathname.includes('/videos/')) {
      const v = [media(0), media(1), media(2), media(3), media(4, publishedFourth ? 1 : 2)].find(v => u.pathname.endsWith(v.uuid))
      if (!v) return new Response('not found', { status: 404 })
      return Response.json(v)
    }
    return Response.json({ data: [media(0), media(1), media(2), ...(publishedFourth ? [media(4)] : [])] })
  }
  const routes = {}
  const hooks = {}
  const router = {
    get (k, v) { routes['GET '+k] = v },
    post (k, v) { routes['POST '+k] = v },
    put (k, v) { routes['PUT '+k] = v },
    delete (k, v) { routes['DELETE '+k] = v }
  }
  const saved = {}
  const storageManager = {
    async getData (key) { return saved[key] },
    async storeData (key, data) { saved[key] = JSON.parse(JSON.stringify(data)) }
  }
  let optionsCallback
  try {
    await plugin.register({
      registerSetting () {}, registerHook ({ target, handler }) { hooks[target] = handler }, getRouter: () => router,
      settingsManager: { getSettings: async () => ({ 'source-account': 'omniatv', 'video-limit': '30', 'page-title': 'Watch' }),
        onSettingsChange (fn) { optionsCallback = fn } },
      storageManager,
      peertubeHelpers: {
        logger: { warn (message) { logs.push(message) } },
        user: { async getAuthUser (res) { return { role: res.admin ? 0 : 2 } } },
        config: { getServerListeningConfig: () => ({ hostname: '0.0.0.0', port: 9000 }) }
      }
    })
    hooks['action:application.listening']()
    await until(() => !!saved['linear-tv-state-v1']?.queue?.length)
    const get = async (path, admin = true, query) => {
      const res = response(admin)
      await routes['GET '+path]({ query: query || {} }, res)
      return res
    }
    const post = async (method, path, body, admin = true, params = {}) => {
      const res = response(admin)
      await routes[method+' '+path]({ body, params }, res)
      return res
    }
    assert.equal((await get('/admin/state', false)).code, 403)
    const initial = (await get('/admin/state')).data
    assert.equal(initial.upcoming.length, 2)
    assert.equal(initial.active.type, 'auto')
    const before = saved['linear-tv-state-v1']
    const queue = [ids[2], ids[1]]
    const ordered = await post('PUT', '/admin/queue', { revision: initial.revision, uuids: queue })
    assert.equal(ordered.code, 200, JSON.stringify(ordered.data))
    assert.equal(ordered.data.current.uuid, ids[0])
    assert.deepEqual(ordered.data.upcoming.map(v => v.uuid), queue)
    const stateAfter = saved['linear-tv-state-v1']
    assert.equal(stateAfter.anchorUuid, before.anchorUuid)
    assert.ok(Math.abs(stateAfter.anchorOffset - before.anchorOffset) < 5)
    assert.equal((await post('PUT', '/admin/queue', { revision: initial.revision, uuids: queue })).code, 409)
    const created = await post('POST', '/admin/playlists', { revision: ordered.data.revision,
      name: 'Evening News', uuids: [ids[1], ids[3]] })
    assert.equal(created.code, 200, JSON.stringify(created.data))
    assert.equal(created.data.playlists[0].items.length, 2)
    const denied = await post('POST', '/admin/playlists', { revision: created.data.revision,
      name: 'Hidden', uuids: [ids[4]] })
    assert.equal(denied.code, 400)
    const id = created.data.playlists[0].id
    const scheduled = await post('POST', '/admin/schedule', { revision: created.data.revision, playlistId: id })
    assert.equal(scheduled.code, 200, JSON.stringify(scheduled.data))
    assert.equal(scheduled.data.pending[0].count, 2)
    assert.ok(scheduled.data.pending[0].startsAt > Date.now())
    const statusRes = await get('/status')
    assert.equal(statusRes.data.current.uuid, ids[0])
    assert.equal(statusRes.data.mode, 'vod')
    const publicData = statusRes.data
    assert.deepEqual(publicData.upcoming.slice(0,2).map(v => v.uuid), queue)
    // New full-cycle editor accepts additions and removal of future items.
    const edited = await post('PUT', '/admin/cycle', {
      revision: scheduled.data.revision, uuids: [ids[0], ids[3], ids[1]]
    })
    assert.equal(edited.code, 200, JSON.stringify(edited.data))
    assert.equal(edited.data.current.uuid, ids[0])
    assert.deepEqual(edited.data.upcoming.map(v => v.uuid), [ids[3], ids[1]])
    assert.deepEqual(edited.data.cycle.items.map(v => v.uuid), [ids[0], ids[3], ids[1]])
    assert.equal((await post('PUT', '/admin/cycle', {
      revision: edited.data.revision, uuids: [ids[0], ids[4]]
    })).code, 400, 'non-public media rejected before persisting')
    assert.equal((await post('PUT', '/admin/cycle', {
      revision: edited.data.revision, uuids: [ids[1], ids[3]]
    })).code, 400, 'current player cannot be removed')
    assert.equal((await post('PUT', '/admin/cycle', {
      revision: edited.data.revision, uuids: [ids[0], ids[3]]
    }, false)).code, 403, 'anonymous changes forbidden')
    assert.equal((await get('/status')).data.current.uuid, ids[0])
    // Refresh must NOT auto-restore a deliberately removed VOD.
    const beforeRefreshCalls = calls.length
    hooks['action:api.video.updated']()
    await until(() => calls.length > beforeRefreshCalls)
    await sleep(35)
    assert.equal(saved['linear-tv-state-v1'].queue.some(v => v.uuid === ids[2]), false,
      'manual removal stays removed during automatic source reconciliation')
    // A genuinely new PUBLIC publication still gets immediate priority after current.
    publishedFourth = true
    const beforeNewCalls = calls.length
    hooks['action:api.video.uploaded']()
    await until(() => calls.length > beforeNewCalls)
    await until(() => saved['linear-tv-state-v1'].queue.some(v => v.uuid === ids[4]))
    assert.deepEqual(saved['linear-tv-state-v1'].queue.slice(0, 3).map(v => v.uuid),
      [ids[0], ids[4], ids[3]])
    const programme = JSON.parse(JSON.stringify(saved['linear-tv-state-v1'].programming))
    await optionsCallback() // PeerTube settings update resets playback but preserves TV playlists.
    assert.equal(saved['linear-tv-state-v1'].programming.playlists[0].id, id)
    assert.equal(saved['linear-tv-state-v1'].programming.pending[0].playlistId, id)
    assert.ok(saved['linear-tv-state-v1'].programming.revision >= programme.revision)
    assert.ok(saved['linear-tv-state-v1'].programming.endsAt > Date.now())
    assert.equal((await get('/admin/library', false)).code, 403)
    assert.ok(calls.every(call => call.hostname === '127.0.0.1'))
    assert.equal(logs.length, 0, logs.join('\n'))
  } finally {
    await plugin.unregister()
    global.fetch = originalFetch
  }
})
test('admin panel client module declares PeerTube ESM route', async () => {
  const { readFile } = require('node:fs/promises')
  const { pathToFileURL } = require('node:url')
  const file = require('node:path').resolve(__dirname, '../client/programme-client-plugin.js')
  const source = await readFile(file, 'utf8')
  const client = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
  let captured
  let hook
  client.register({ registerClientRoute: opts => { captured = opts }, registerHook: opts => { hook = opts }, peertubeHelpers: {}, router: {} })
  assert.equal(hook.target, 'action:router.navigation-end')
  assert.equal(captured.route, 'tv-programme')
  assert.equal(typeof captured.onMount, 'function')
})
