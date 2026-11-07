'use strict'

const timeline = require('./lib/schedule')
const programming = require('./lib/programming')
const { randomUUID } = require('node:crypto')
const STORAGE_KEY = 'linear-tv-state-v1'
const MAX_RESULTS = 100
let stopService = () => {}

function parseSettings (values) {
  const account = String(values['source-account'] || '').trim()
  const channels = String(values['source-channels'] || '').split(/[\s,;\n]+/)
    .map(s => s.trim()).filter(Boolean).slice(0, 20)
  const handleRE = /^[\w.-]+(?:@[\w.-]+)?$/
  if (account && !handleRE.test(account)) throw new Error('Invalid account handle')
  if (channels.some(c => !handleRE.test(c))) throw new Error('Invalid channel handle')
  return {
    account, channels,
    limit: Math.min(100, Math.max(1, Number.parseInt(values['video-limit'], 10) || 30)),
    chatAnchor: String(values['chat-anchor-uuid'] || '').trim(),
    title: String(values['page-title'] || 'Linear TV').slice(0, 80)
  }
}

async function register ({ registerSetting, registerHook, getRouter, storageManager, settingsManager, peertubeHelpers }) {
  const logger = peertubeHelpers.logger
  registerSetting({ name: 'source-account', label: 'Account name (all channels)', type: 'input',
    descriptionHTML: 'PeerTube account handle. Used only when channels below are empty.', default: '' })
  registerSetting({ name: 'source-channels', label: 'Channel handles (optional)', type: 'input',
    descriptionHTML: 'Comma-separated channel handles. When filled, overrides the account field.', default: '' })
  registerSetting({ name: 'video-limit', label: 'Number of newest VODs (1–100)',
    type: 'input', default: '30' })
  registerSetting({ name: 'page-title', label: 'TV page title', type: 'input', default: 'Linear TV' })
  registerSetting({ name: 'programme-panel', type: 'html', html: '<p><a href="/admin/settings/config/general?tv-programme=1" target="_blank" rel="noopener">Άνοιγμα panel προγραμματισμού TV ↗</a></p>' })
  registerSetting({ name: 'chat-anchor-uuid', label: 'Permanent chat anchor video UUID', type: 'input',
    descriptionHTML: 'Install peertube-plugin-livechat and enable chat on this video. Its chat room remains constant when playback switches.', default: '' })

  let state = timeline.createState()
  programming.ensureProgramming(state)
  let config = { account: '', channels: [], limit: 30, chatAnchor: '', title: 'Linear TV' }
  let running = false
  let started = false
  let lastError = null
  let lastOkAt = null
  let refreshTimer, vodTimer, startTimer, programmeTimer
  let pending = false

  async function readConfig () { config = parseSettings(await settingsManager.getSettings([
    'source-account', 'source-channels', 'video-limit', 'chat-anchor-uuid', 'page-title'
  ])) }

  // Avoid routing self-calls via public reverse proxy / WAF (Cloudflare).
  function apiBase () {
    const listening = peertubeHelpers.config.getServerListeningConfig()
    const hostname = listening.hostname === '::' || listening.hostname === '0.0.0.0'
      ? '127.0.0.1' : listening.hostname
    return `http://${hostname.includes(':') ? '[' + hostname + ']' : hostname}:${listening.port}`
  }

  async function fetchList (path, isLive, search = '') {
    const url = new URL(path, apiBase())
    url.searchParams.set('start', '0')
    url.searchParams.set('count', String(MAX_RESULTS))
    url.searchParams.set('sort', '-publishedAt')
    url.searchParams.set('isLive', String(isLive))
    // PeerTube 8.3 omits `state` in default list responses.
    // This public API flag adds it, even without privileged `include` permissions.
    // It also returns waiting live entries, which is why state === 1 is enforced.
    url.searchParams.set('includeScheduledLive', 'true')
    // 'privacyOneOf' requires SEE_ALL_VIDEOS permission in PeerTube 8.3.2.
    // Fetch publicly visible results and enforce privacy.id === 1 in normalizeVideo().
    url.searchParams.set('nsfw', 'false')
    if (search) url.searchParams.set('search', search)
    const response = await fetch(url, { signal: AbortSignal.timeout(7000) })
    if (!response.ok) throw new Error(`PeerTube API ${response.status} from ${url.pathname}`)
    const body = await response.json()
    if (!Array.isArray(body?.data)) throw new Error('PeerTube video list response has no data array')
    return body.data.map(timeline.normalizeVideo).filter(Boolean)
  }

  async function listSources (isLive, search = '') {
    const sources = config.channels.length
      ? config.channels.map(handle => '/api/v1/video-channels/' + encodeURIComponent(handle) + '/videos')
      : config.account ? ['/api/v1/accounts/' + encodeURIComponent(config.account) + '/videos'] : []
    if (!sources.length) return []
    const batches = await Promise.all(sources.map(source => fetchList(source, isLive, search)))
    const unique = new Map()
    for (const video of batches.flat()) if (!unique.has(video.uuid)) unique.set(video.uuid, video)
    return Array.from(unique.values()).sort((a, b) =>
      Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || '') || a.uuid.localeCompare(b.uuid))
  }

  async function resolveVideo (uuid) {
    if (!/^[0-9a-f-]{36}$/i.test(uuid)) throw new Error('Invalid video UUID')
    const response = await fetch(new URL('/api/v1/videos/' + encodeURIComponent(uuid), apiBase()),
      { signal: AbortSignal.timeout(7000) })
    if (!response.ok) throw new Error((response.status >= 500 ? 'PeerTube API failure: ' : 'Video not accessible: ') + uuid)
    const result = timeline.normalizeVideo(await response.json())
    if (!timeline.isPlayableVod(result)) throw new Error('Video is not public and playable: ' + uuid)
    return result
  }

  async function resolveAvailable (uuid) {
    try { return await resolveVideo(uuid) }
    catch (err) {
      if (/Video not accessible:|Video is not public and playable:/.test(String(err.message))) return null
      throw err
    }
  }
  async function validateAvailable (items) {
    const results = []
    for (let i = 0; i < items.length; i += 5) {
      const batch = await Promise.all(items.slice(i, i + 5).map(v => resolveAvailable(v.uuid)))
      results.push(...batch.filter(Boolean))
    }
    return results
  }
  async function crossBoundaries (now) {
    let changed = false
    let count = 0
    const p = programming.ensureProgramming(state)
    while (!state.live && p.endsAt !== null && now >= p.endsAt && count++ < 35) {
      if (p.pending.length) {
        // Avoid broadcasting a stored video that later became private or unavailable.
        const valid = await validateAvailable(p.pending[0].items)
        p.pending[0].items = valid
      } else if (p.cyclePlan) {
        // The next-cycle edit can contain older VODs outside the newest-video window.
        // Revalidate each UUID directly before it is broadcast again.
        p.cyclePlan.items = await validateAvailable(p.cyclePlan.items)
      }
      const changedThis = programming.advance(state, p.endsAt)
      if (!changedThis) break
      changed = true
    }
    if (changed) p.manualOrder = !!p.cyclePlan
    return changed
  }
  async function validateActivePlaylist (now) {
    const p = programming.ensureProgramming(state)
    if (p.active.type !== 'playlist' || state.live || p.cyclePlan) return false
    const current = timeline.currentVod(state, now)
    const candidates = state.queue.slice(current?.index || 0)
    const valid = await validateAvailable(candidates)
    if (JSON.stringify(valid) === JSON.stringify(state.queue)) return false
    state.queue = valid
    state.anchorAt = now
    state.anchorUuid = valid[0]?.uuid || null
    state.anchorOffset = valid[0]?.uuid === current?.video.uuid ? current.offset : 0
    p.endsAt = programming.calculateEnd(state, now)
    return true
  }

  async function validateVideos (uuids) {
    if (!Array.isArray(uuids) || uuids.length < 1 || uuids.length > 100 ||
        new Set(uuids).size !== uuids.length) throw new Error('Select 1–100 distinct videos')
    const result = []
    // Limit concurrent loopback API calls.
    for (let i = 0; i < uuids.length; i += 5) {
      result.push(...await Promise.all(uuids.slice(i, i + 5).map(resolveVideo)))
    }
    return result
  }
  async function persist () {
    state.revision++
    state.updatedAt = Date.now()
    await storageManager.storeData(STORAGE_KEY, state)
  }
  function getBody (req) {
    const body = req.body
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('JSON object required')
    return body
  }
  async function requireAdmin (res) {
    let user = null
    try { user = await peertubeHelpers.user.getAuthUser(res) } catch { /* no auth */ }
    if (!user || user.role !== 0) { res.status(403).json({ error: 'Administrator access required' }); return false }
    return true
  }
  function problem (res, err) {
    res.status(err.status || 400).json({ error: String(err.message || err).slice(0, 220) })
  }
  // All mutation routes require PeerTube bearer authentication and administrator role.
  async function adminMutation (req, res, operation) {
    if (!await requireAdmin(res)) return
    if (running) return res.status(409).json({ error: 'Source refresh in progress. Retry.' })
    running = true
    const before = structuredClone(state)
    try {
      const body = getBody(req)
      const p = programming.ensureProgramming(state)
      if (body.revision !== p.revision) {
        return res.status(409).json({ error: 'Programme changed; reload before saving.' })
      }
      await operation(body)
      p.revision++
      await persist()
      res.json(programming.adminStatus(state))
    } catch (err) {
      state = before
      problem(res, err)
    } finally {
      running = false
      if (pending) { const wasVod = pending; pending = false; void refresh({ vod: wasVod }) }
    }
  }

  async function refresh ({ vod = false } = {}) {
    if (!started) return
    if (running) { pending = pending || vod; return }
    running = true
    try {
      const now = Date.now()
      const p = programming.ensureProgramming(state)
      let changed = await crossBoundaries(now)
      // Do not infer 'live' from isLive alone: state 4 is WAITING_FOR_LIVE, 5 is LIVE_ENDED.
      const activeLives = (await listSources(true)).filter(timeline.isActiveLive)
      // Refresh VODs BEFORE concluding a live: catch publications that arrived
      // between the last VOD poll and the end-of-live event.
      if (vod || !state.queue.length || (state.live && activeLives.length === 0)) {
        const candidates = (await listSources(false)).filter(timeline.isPlayableVod).slice(0, config.limit)
        changed = programming.updateAuto(state, candidates) || changed
        if (p.active.type === 'auto') {
          if (p.cyclePlan && state.live) {
            changed = programming.mergeDuringLive(state, candidates) || changed
          } else if (p.cyclePlan && !state.live) {
            // Preserve editorially edited current and next cycles across refreshes.
            // Newly published public VODs still join immediately after the playing item.
            const known = new Set(p.cyclePlan.seen || p.cyclePlan.items.map(v => v.uuid))
            const additions = candidates.filter(v => !known.has(v.uuid) &&
              !p.cyclePlan.played.includes(v.uuid))
            const playing = timeline.currentVod(state, now)
            const index = p.cyclePlan.items.findIndex(v => v.uuid === playing?.video.uuid)
            if (additions.length && index >= 0) {
              const updated = p.cyclePlan.items.slice()
              updated.splice(index + 1, 0, ...additions)
              changed = programming.editCycle(state, updated, now) || changed
            }
          } else if ((p.manualOrder || p.endsAt !== null) && !state.live) {
            const map = new Map(candidates.map(v => [v.uuid, v]))
            const current = timeline.currentVod(state, now)
            // Once a future TV playlist has been scheduled, do not put VODs
            // already watched in this cycle back in the remaining queue.
            const existingCycle = p.endsAt !== null && current ? state.queue.slice(current.index) : state.queue
            const existing = existingCycle.filter(v => map.has(v.uuid)).map(v => map.get(v.uuid))
            const previousIds = new Set(state.queue.map(v => v.uuid))
            const additions = candidates.filter(v => !previousIds.has(v.uuid))
            const activeVideo = current ? map.get(current.video.uuid) : null
            const future = existing.filter(v => v.uuid !== activeVideo?.uuid)
            const ordered = activeVideo
              ? [activeVideo, ...(p.manualOrder ? future.concat(additions) : additions.concat(future))]
              : [...additions, ...future]
            if (JSON.stringify(state.queue) !== JSON.stringify(ordered)) {
              state.queue = ordered
              state.anchorAt = now
              state.anchorUuid = ordered[0]?.uuid || null
              state.anchorOffset = ordered[0]?.uuid === current?.video.uuid ? current.offset : 0
              changed = true
            }
          } else changed = timeline.setQueue(state, candidates, now) || changed
        } else if (state.live) {
          changed = programming.mergeDuringLive(state, candidates) || changed
        }
        if (!state.live && p.active.type === 'auto') {
          if (p.endsAt !== null) p.endsAt = programming.calculateEnd(state, now, !p.cyclePlan)
          else if (p.pending.length && state.queue.length) {
            p.endsAt = programming.calculateEnd(state, now)
            changed = true
          }
        }
        changed = await validateActivePlaylist(now) || changed
      }
      const wasLive = !!state.live
      changed = timeline.applyLive(state, activeLives, now) || changed
      if (wasLive && !state.live) programming.extendAfterLive(state, now)
      if (changed) {
        p.revision++
        await persist()
      }
      lastError = null
      lastOkAt = Date.now()
    } catch (err) {
      lastError = String(err.message || err).slice(0, 250)
      logger.warn('[linear-tv] refresh failed: ' + lastError)
      // Keep the previous state; network failure must not end a live.
    } finally {
      running = false
      if (pending) {
        const vodRequested = pending
        pending = false
        void refresh({ vod: vodRequested })
      }
    }
  }

  const router = getRouter()
  router.get('/status', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    const result = programming.publicSchedule(state, timeline.status(state))
    res.json({ ...result, title: config.title,
      chatAnchor: /^[0-9a-f-]{36}$/i.test(config.chatAnchor) ? config.chatAnchor : null,
      healthy: !lastError, lastOkAt, error: lastError ? 'Source refresh failed' : null })
  })

  router.get('/admin/state', async (req, res) => {
    if (!await requireAdmin(res)) return
    res.setHeader('Cache-Control', 'no-store')
    res.json(programming.adminStatus(state))
  })
  router.get('/admin/library', async (req, res) => {
    if (!await requireAdmin(res)) return
    try {
      const search = String(req.query?.search || '').trim().slice(0, 100)
      const items = await listSources(false, search)
      res.setHeader('Cache-Control', 'no-store')
      res.json({ items: items.filter(timeline.isPlayableVod).slice(0, 100) })
    } catch (err) { problem(res, err) }
  })
  router.post('/admin/playlists', (req, res) => adminMutation(req, res, async body => {
    const items = await validateVideos(body.uuids)
    programming.addPlaylist(state, { id: randomUUID(), name: body.name, items })
  }))
  router.delete('/admin/playlists/:id', (req, res) => adminMutation(req, res, async () => {
    programming.deletePlaylist(state, req.params.id)
  }))
  router.put('/admin/queue', (req, res) => adminMutation(req, res, async body => {
    programming.reorder(state, body.uuids)
    programming.ensureProgramming(state).manualOrder = true
  }))
  router.put('/admin/cycle', (req, res) => adminMutation(req, res, async body => {
    // Same validation used for creation: public, published, playable, unique UUIDs.
    // Each element can be from an older publication, not just newest source videos.
    const items = await validateVideos(body.uuids)
    programming.editCycle(state, items, Date.now())
  }))
  router.post('/admin/schedule', (req, res) => adminMutation(req, res, async body => {
    // Revalidate the playlist content at scheduling time, not only on creation.
    const p = programming.ensureProgramming(state)
    const selected = p.playlists.find(x => x.id === body.playlistId)
    if (!selected) throw new Error('Playlist not found')
    const items = await validateVideos(selected.items.map(v => v.uuid))
    const originalItems = selected.items
    selected.items = items
    try { programming.schedule(state, selected.id, Date.now(), randomUUID()) }
    finally { selected.items = originalItems }
  }))
  router.delete('/admin/schedule/:id', (req, res) => adminMutation(req, res, async () => {
    programming.unschedule(state, req.params.id)
  }))
  router.put('/admin/schedule', (req, res) => adminMutation(req, res, async body => {
    programming.reorderScheduled(state, body.ids)
  }))

  async function start () {
    if (started) return
    started = true
    try {
      const previous = await storageManager.getData(STORAGE_KEY)
      if (timeline.isState(previous)) state = previous
      programming.ensureProgramming(state)
      await readConfig()
    } catch (err) { logger.warn('[linear-tv] load settings/state failed: ' + err.message) }
    // 15s reconciliation catches missed hooks, restarts and remote lives.
    refreshTimer = setInterval(() => { void refresh() }, 15000)
    vodTimer = setInterval(() => { void refresh({ vod: true }) }, 5 * 60 * 1000)
    // Apply programme boundaries without forcing expensive VOD API refreshes.
    programmeTimer = setInterval(async () => {
      if (running || !started || state.live) return
      const p = programming.ensureProgramming(state)
      if (p.endsAt === null || Date.now() < p.endsAt) return
      running = true
      try {
        if (await crossBoundaries(Date.now())) {
          p.revision++
          await persist()
        }
      } catch (err) { logger.warn('[linear-tv] programme boundary failed: ' + err.message) }
      finally {
        running = false
        if (pending) { const wasVod = pending; pending = false; void refresh({ vod: wasVod }) }
      }
    }, 1000)
    void refresh({ vod: true })
  }
  startTimer = setTimeout(() => { void start() }, 3000)
  registerHook({ target: 'action:application.listening', handler: () => { void start() } })
  registerHook({ target: 'action:live.video.state.updated', handler: () => { void refresh({ vod: true }) } })
  for (const target of ['action:api.video.uploaded', 'action:api.video.deleted', 'action:api.video.updated']) {
    registerHook({ target, handler: () => { void refresh({ vod: true }) } })
  }
  settingsManager.onSettingsChange(async () => {
    await readConfig()
    // Force new queue on configuration changes, but don't play past videos in old channel.
    const p = programming.ensureProgramming(state)
    state = timeline.createState()
    state.programming = p
    p.active = { type: 'auto', name: 'Αυτόματο πρόγραμμα' }
    p.endsAt = null
    p.manualOrder = false
    p.cyclePlan = null // Source/settings reset starts a fresh automatic cycle.
    // Keep saved/scheduled playlists when a setting is changed.
    await storageManager.storeData(STORAGE_KEY, state)
    await refresh({ vod: true })
  })
  stopService = () => {
    started = false
    clearTimeout(startTimer)
    clearInterval(refreshTimer)
    clearInterval(vodTimer)
    clearInterval(programmeTimer)
  }
}

async function unregister () { stopService() }
module.exports = { register, unregister }
