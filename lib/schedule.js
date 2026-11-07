'use strict'

// Pure timeline functions. No timers, network calls or PeerTube dependencies.
const PUBLIC = 1
const UNLISTED = 2
const PUBLISHED = 1
const MAX_DURATION = 24 * 3600

function normalizeVideo (v, { allowUnlisted = false } = {}) {
  if (!v || typeof v.uuid !== 'string' || !/^[0-9a-f-]{36}$/i.test(v.uuid)) return null
  const duration = Number(v.duration)
  const explicitState = v.state?.id ?? v.state
  // Public VOD list records in PeerTube 8.3 may omit `state` unless
  // includeScheduledLive=true. Published, public, non-live VODs with a
  // duration are still playable. NEVER infer an active live without state.
  const implicitPublishedVod = (explicitState === undefined || explicitState === null) &&
    v.isLive === false && Number.isFinite(Date.parse(v.publishedAt || '')) && duration > 0
  const state = implicitPublishedVod ? PUBLISHED : Number(explicitState)
  const privacy = Number(v.privacy?.id ?? v.privacy)
  const channel = v.channel || {}
  const name = String(v.name || '').slice(0, 240)
  if (!name || !Number.isFinite(state) || (privacy !== PUBLIC && !(allowUnlisted && privacy === UNLISTED))) return null
  return {
    uuid: v.uuid,
    privacy,
    name,
    duration: Number.isFinite(duration) ? duration : 0,
    isLive: v.isLive === true,
    state,
    channelName: String(channel.displayName || channel.name || '').slice(0, 150),
    publishedAt: v.publishedAt || v.createdAt || null,
    nsfw: !!v.nsfw,
    blacklisted: !!v.blacklisted,
    // Disallow unavailable/age-gated media in a public autoplay channel.
    playable: !v.nsfw && !v.blacklisted
  }
}

function isPlayableVod (v) {
  return v && v.playable && !v.isLive && v.state === PUBLISHED &&
    v.duration >= 1 && v.duration <= MAX_DURATION
}
function normalizeSpot (v) {
  const item = normalizeVideo(v, { allowUnlisted: true })
  return isPlayableVod(item) ? { ...item, interstitial: true } : null
}
function isActiveLive (v) {
  // PeerTube states: 1=published/live running; 4=waiting; 5=ended.
  return v && v.playable && v.isLive && v.state === PUBLISHED
}

function createState (now = Date.now()) {
  return { queue: [], spots: [], anchorAt: now, anchorUuid: null, anchorOffset: 0,
    live: null, liveStartedAt: null, paused: null, revision: 0, updatedAt: now }
}
function isState (s) {
  return s && Array.isArray(s.queue) && Number.isFinite(s.anchorAt) &&
    typeof s.revision === 'number'
}
function spotDurationMs (state) {
  return (Array.isArray(state.spots) ? state.spots : [])
    .reduce((sum, spot) => sum + Math.round(spot.duration * 1000), 0)
}
function durationMs (item, state) {
  return Math.round(item.duration * 1000) + spotDurationMs(state)
}
function spotAt (state, elapsedMs, now) {
  let position = elapsedMs
  for (const video of state.spots || []) {
    const duration = Math.round(video.duration * 1000)
    if (position < duration) {
      return { video, offset: position / 1000, startsAt: now - position,
        endsAt: now + duration - position }
    }
    position -= duration
  }
  return null
}

// Each programme item occupies its own duration followed by the complete spot
// break. The anchorOffset is measured in this combined programme slot, which
// keeps refreshes and playlist edits synchronized even while a spot is on air.
// A negative offset is used only on live return: it plays the spot break first,
// before starting the selected VOD from 00:00.
function currentVod (state, now = Date.now()) {
  const queue = state.queue
  if (!queue.length) return null
  let index = Math.max(0, queue.findIndex(v => v.uuid === state.anchorUuid))
  const totalMs = queue.reduce((sum, item) => sum + durationMs(item, state), 0)
  if (!totalMs) return null
  const raw = now - state.anchorAt + Math.round(state.anchorOffset * 1000)
  if (raw < 0 && spotDurationMs(state) > 0) {
    const firstContentAt = now - raw
    const spot = spotAt(state, Math.max(0, spotDurationMs(state) + raw), now)
    return { index, video: queue[index], offset: raw / 1000, intro: true, spot,
      startsAt: firstContentAt, endsAt: firstContentAt + durationMs(queue[index], state) }
  }
  let elapsedMs = Math.max(0, raw) % totalMs
  for (let i = 0; i < queue.length; i++) {
    const dur = durationMs(queue[index], state)
    if (elapsedMs < dur) {
      const contentMs = Math.round(queue[index].duration * 1000)
      const spot = elapsedMs >= contentMs
        ? spotAt(state, elapsedMs - contentMs, now)
        : null
      return { index, video: queue[index], offset: elapsedMs / 1000,
        spot, intro: false, startsAt: now - elapsedMs, endsAt: now + dur - elapsedMs }
    }
    elapsedMs -= dur
    index = (index + 1) % queue.length
  }
  return null
}

function setQueue (state, discovered, now = Date.now()) {
  // Discovered must already contain only PUBLIC, published, playable items.
  // Do not pin missing videos: a video may have become unlisted or private.
  const unique = new Map()
  for (const v of discovered) if (isPlayableVod(v) && !unique.has(v.uuid)) unique.set(v.uuid, v)
  const candidates = Array.from(unique.values())
  const old = state.queue
  const oldIds = new Set(old.map(v => v.uuid))
  const active = state.live ? null : currentVod(state, now)
  const activeUuid = active?.video?.uuid || null
  let next = candidates
  if (!state.live && activeUuid && unique.has(activeUuid)) {
    const currentIndex = old.findIndex(v => v.uuid === activeUuid)
    const rotation = old.slice(currentIndex).concat(old.slice(0, currentIndex))
    const newItems = candidates.filter(v => !oldIds.has(v.uuid))
    next = [unique.get(activeUuid), ...newItems,
      ...rotation.slice(1).filter(v => unique.has(v.uuid)).map(v => unique.get(v.uuid))]
  }
  // Update publication timestamps and privacy-sensitive metadata, not only UUIDs.
  if (JSON.stringify(old) === JSON.stringify(next)) return false
  state.queue = next
  if (!state.live) {
    state.anchorAt = now
    state.anchorUuid = next[0]?.uuid || null
    state.anchorOffset = next[0]?.uuid === activeUuid
      ? Math.max(-spotDurationMs(state) / 1000,
        Math.min(active?.offset || 0, Math.max(0, durationMs(next[0], state) / 1000 - 0.01)))
      : 0
  }
  return true
}

// When live ends, recent PUBLIC publications take precedence over the former EPG.
// Afterwards, continue with the video AFTER the one interrupted by live.
// The interrupted video is retained at the END of the rotation, for the next cycle.
function queueAfterLive (state, now = Date.now()) {
  const available = state.queue.filter(isPlayableVod)
  const byUuid = new Map(available.map(v => [v.uuid, v]))
  const result = []
  const seen = new Set()
  const add = uuid => {
    const item = byUuid.get(uuid)
    if (item && !seen.has(uuid)) { result.push(item); seen.add(uuid) }
  }

  // publishedAt is PeerTube's actual publication time (not the upload/draft time).
  // Only public/playable VODs are in the queue in the first place.
  if (Number.isFinite(state.liveStartedAt)) {
    const newPublic = available.filter(v => {
      const time = Date.parse(v.publishedAt || '')
      return Number.isFinite(time) && time >= state.liveStartedAt && time <= now
    })
    newPublic.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) ||
      a.uuid.localeCompare(b.uuid))
    for (const v of newPublic) add(v.uuid)
  }

  // Retain the original sequence from the moment the first live interrupted it.
  // If a video has since gone private/deleted, it is skipped.
  const original = Array.isArray(state.paused?.queue) ? state.paused.queue : state.queue.map(v => v.uuid)
  const interruptedIndex = original.indexOf(state.paused?.uuid)
  const rotated = interruptedIndex === -1 ? original
    : original.slice(interruptedIndex + 1).concat(original.slice(0, interruptedIndex + 1))
  for (const uuid of rotated) if (uuid !== state.paused?.uuid) add(uuid)
  // Include other newly-discovered but older public videos after the old schedule.
  for (const v of available) if (v.uuid !== state.paused?.uuid) add(v.uuid)
  // Do not replay the interrupted programme until all other eligible VODs finish.
  if (state.paused?.uuid) add(state.paused.uuid)
  return result
}

function applyLive (state, activeLives, now = Date.now()) {
  // Keep the active live even when another appears, unless it ends.
  const available = activeLives.filter(isActiveLive)
  const chosen = available.find(v => v.uuid === state.live?.uuid) || available[0] || null
  if (chosen) {
    if (state.live?.uuid === chosen.uuid) return false
    if (!state.live) {
      const vod = currentVod(state, now)
      state.paused = { uuid: vod?.video.uuid || null, queue: state.queue.map(v => v.uuid) }
      state.liveStartedAt = now
    }
    state.live = chosen
    return true
  }
  if (!state.live) return false
  // Always begin a whole VOD; never resume the interrupted item's saved offset.
  const nextQueue = queueAfterLive(state, now)
  state.queue = nextQueue
  state.live = null
  state.liveStartedAt = null
  state.paused = null
  state.anchorAt = now
  state.anchorUuid = nextQueue[0]?.uuid || null
  state.anchorOffset = nextQueue.length && spotDurationMs(state) > 0
    ? -spotDurationMs(state) / 1000 : 0
  return true
}

function status (state, now = Date.now(), count = 8) {
  const common = { serverTime: now, revision: state.revision, updatedAt: state.updatedAt }
  if (state.live) {
    const afterLive = queueAfterLive(state, now)
    const spots = afterLive.length ? (state.spots || []) : []
    return { ...common, mode: 'live', current: state.live, startsAt: null,
      elapsedSeconds: null, endsAt: null, upcoming: [],
      upcomingAfterLive: [...spots, ...afterLive].slice(0, Math.max(0, Math.min(count + spots.length, 50))) }
  }
  const current = currentVod(state, now)
  if (!current) return { ...common, mode: 'empty', current: null, upcoming: [] }
  const upcoming = []
  if (current.intro && current.offset < 0) {
    const video = state.queue[current.index]
    upcoming.push({ ...video, startsAt: current.startsAt,
      endsAt: current.startsAt + Math.round(video.duration * 1000) })
  }
  let start = current.endsAt
  for (let i = 1; upcoming.length < Math.min(count, 30); i++) {
    const video = state.queue[(current.index + i) % state.queue.length]
    upcoming.push({ ...video, startsAt: start,
      endsAt: start + Math.round(video.duration * 1000) })
    start += durationMs(video, state)
  }
  return { ...common, mode: 'vod',
    current: current.spot?.video || current.video,
    interstitial: !!current.spot,
    startsAt: current.spot?.startsAt ?? current.startsAt,
    elapsedSeconds: current.spot?.offset ?? current.offset,
    endsAt: current.spot?.endsAt ?? (current.startsAt + Math.round(current.video.duration * 1000)),
    upcoming }
}

module.exports = { createState, isState, normalizeVideo, normalizeSpot, isPlayableVod, isActiveLive,
  currentVod, durationMs, spotDurationMs, setQueue, queueAfterLive, applyLive, status }
