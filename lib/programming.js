'use strict'

const { currentVod, isPlayableVod, queueAfterLive } = require('./schedule')
const MAX_SAVED = 50
const MAX_ITEMS = 100
const MAX_PENDING = 30

function createProgramming () {
  return { revision: 0, playlists: [], pending: [], active: { type: 'auto', name: 'Αυτόματο πρόγραμμα' },
    endsAt: null, autoQueue: [] }
}
function ensureProgramming (state) {
  if (!state.programming || !Array.isArray(state.programming.playlists) || !Array.isArray(state.programming.pending)) {
    state.programming = createProgramming()
  }
  const p = state.programming
  if (!p.active || !['auto', 'playlist'].includes(p.active.type)) p.active = { type: 'auto', name: 'Αυτόματο πρόγραμμα' }
  if (!Array.isArray(p.autoQueue)) p.autoQueue = []
  if (!Number.isInteger(p.revision)) p.revision = 0
  if (!Number.isFinite(p.endsAt)) p.endsAt = null
  if (p.cyclePlan && (!Array.isArray(p.cyclePlan.items) || !Array.isArray(p.cyclePlan.played))) {
    p.cyclePlan = null // Migrate invalid/corrupt older data safely.
  }
  if (p.cyclePlan && !Array.isArray(p.cyclePlan.seen)) {
    p.cyclePlan.seen = Array.from(new Set([...p.autoQueue, ...p.cyclePlan.items].map(v => v.uuid)))
  }
  return p
}
function names (items) { return items.map(x => x.uuid) }
function uniqueVideos (items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_ITEMS) throw new Error('Playlist requires 1–100 videos')
  const seen = new Set()
  for (const item of items) {
    if (!isPlayableVod(item) || seen.has(item.uuid)) throw new Error('Playlist contains unavailable or duplicate video')
    seen.add(item.uuid)
  }
  return items
}
function remaining (state, now) {
  const playing = currentVod(state, now)
  if (!playing) return { playing: null, next: [] }
  return { playing, next: state.queue.slice(playing.index + 1) }
}
function remainingForAdmin (state, now) {
  const { playing } = remaining(state, now)
  if (!playing) return []
  if (ensureProgramming(state).endsAt !== null) return state.queue.slice(playing.index + 1)
  return state.queue.slice(playing.index + 1).concat(state.queue.slice(0, playing.index))
}
function calculateEnd (state, now, includeWrapped = false) {
  const { playing, next } = remaining(state, now)
  if (!playing) return now
  const tail = includeWrapped ? remainingForAdmin(state, now) : next
  return Math.round(playing.endsAt + tail.reduce((sum, x) => sum + x.duration * 1000, 0))
}
function reorder (state, uuids, now = Date.now()) {
  if (state.live) throw new Error('Editing active playlist order is paused during live')
  const { playing } = remaining(state, now)
  if (!playing) throw new Error('No VOD is currently playing')
  const upcoming = remainingForAdmin(state, now)
  const byUuid = new Map(upcoming.map(v => [v.uuid, v]))
  if (!Array.isArray(uuids) || uuids.length !== byUuid.size ||
      new Set(uuids).size !== uuids.length || uuids.some(uuid => !byUuid.has(uuid))) {
    throw new Error('Order must contain exactly the upcoming video UUIDs')
  }
  const p = ensureProgramming(state)
  state.queue = [playing.video, ...uuids.map(id => byUuid.get(id))]
  state.anchorAt = now
  state.anchorUuid = playing.video.uuid
  state.anchorOffset = playing.offset
  if (p.endsAt !== null) p.endsAt = calculateEnd(state, now)
  return true
}
// Publish a full edited programme without interrupting what is on air.
// Videos before the playhead (or already broadcast this cycle) are *only*
// edited in cyclePlan.items, and will be used after this cycle completes.
// Only not-yet-played items positioned after the current video are changed now.
function editCycle (state, items, now = Date.now()) {
  if (state.live) throw new Error('Editing the active playlist is paused during live')
  const playing = currentVod(state, now)
  if (!playing) throw new Error('No VOD is currently playing')
  uniqueVideos(items)
  const anchorIndex = items.findIndex(v => v.uuid === playing.video.uuid)
  if (anchorIndex < 0) throw new Error('The currently playing video must stay in the playlist until it finishes')
  const p = ensureProgramming(state)
  const previouslyPlayed = p.cyclePlan?.played || []
  const played = new Set([...previouslyPlayed, ...state.queue.slice(0, playing.index).map(x => x.uuid)])
  played.delete(playing.video.uuid)
  const next = items.slice(anchorIndex + 1).filter(v => !played.has(v.uuid))
  const active = playing.video
  // Re-anchor to the same frame; the browser player only changes at the next boundary.
  state.queue = [active, ...next]
  state.anchorAt = now
  state.anchorUuid = active.uuid
  state.anchorOffset = playing.offset
  p.cyclePlan = {
    items: items.map(v => ({ ...v })),
    played: Array.from(played),
    // Tombstones prevent a deliberately removed VOD from being auto-added again
    // during the next scheduled refresh. Only genuinely unseen publications join.
    seen: Array.from(new Set([
      ...(p.cyclePlan?.seen || []),
      ...p.autoQueue.map(v => v.uuid),
      ...state.queue.map(v => v.uuid),
      ...items.map(v => v.uuid)
    ]))
  }
  p.manualOrder = true
  p.endsAt = Math.round(playing.endsAt + next.reduce((ms, v) => ms + v.duration * 1000, 0))
  return true
}

function cycleForAdmin (state, now = Date.now()) {
  const p = ensureProgramming(state)
  const playing = state.live ? null : currentVod(state, now)
  const items = p.cyclePlan?.items || state.queue
  const played = p.cyclePlan
    ? new Set([...p.cyclePlan.played, ...(playing ? state.queue.slice(0, playing.index).map(x => x.uuid) : [])])
    : new Set(playing ? state.queue.slice(0, playing.index).map(x => x.uuid) : [])
  if (playing) played.delete(playing.video.uuid)
  return { items, playedUuids: Array.from(played), currentUuid: playing?.video.uuid || null,
    deferred: !!p.cyclePlan }
}

function addPlaylist (state, { id, name, items }) {
  const p = ensureProgramming(state)
  if (p.playlists.length >= MAX_SAVED) throw new Error('Saved playlist limit reached')
  const cleanName = String(name || '').trim().slice(0, 100)
  if (!cleanName) throw new Error('Playlist name is required')
  uniqueVideos(items)
  p.playlists.push({ id, name: cleanName, items: items.map(v => ({ ...v })) })
  return true
}
function deletePlaylist (state, id) {
  const p = ensureProgramming(state)
  const original = p.playlists.length
  p.playlists = p.playlists.filter(x => x.id !== id)
  if (p.playlists.length === original) throw new Error('Playlist not found')
  // A scheduled playlist is a snapshot: deletion of its template cannot cancel a scheduled broadcast.
  return true
}
function schedule (state, playlistId, now = Date.now(), id) {
  const p = ensureProgramming(state)
  if (p.pending.length >= MAX_PENDING) throw new Error('Scheduled playlist limit reached')
  const item = p.playlists.find(x => x.id === playlistId)
  if (!item) throw new Error('Playlist not found')
  p.pending.push({ id, playlistId: item.id, name: item.name, items: item.items.map(v => ({ ...v })) })
  if (!state.live && p.endsAt === null) p.endsAt = calculateEnd(state, now)
  if (state.live && p.endsAt === null) p.endsAt = 0 // Correctly recomputed once live ends.
  return true
}
function unschedule (state, id) {
  const p = ensureProgramming(state)
  const original = p.pending.length
  p.pending = p.pending.filter(x => x.id !== id)
  if (p.pending.length === original) throw new Error('Scheduled item not found')
  if (!p.pending.length && p.active.type === 'auto') p.endsAt = null
  return true
}
function reorderScheduled (state, ids) {
  const p = ensureProgramming(state)
  const map = new Map(p.pending.map(x => [x.id, x]))
  if (!Array.isArray(ids) || ids.length !== map.size || new Set(ids).size !== ids.length || ids.some(id => !map.has(id))) {
    throw new Error('Invalid scheduled playlist order')
  }
  p.pending = ids.map(id => map.get(id))
  return true
}
function updateAuto (state, items) {
  const p = ensureProgramming(state)
  const usable = items.filter(isPlayableVod)
  if (JSON.stringify(p.autoQueue) === JSON.stringify(usable)) return false
  p.autoQueue = usable
  return true
}
function mergeDuringLive (state, incoming) {
  if (!state.live) return false
  const known = new Set(state.queue.map(x => x.uuid))
  const newVideos = incoming.filter(x => isPlayableVod(x) && !known.has(x.uuid))
  if (!newVideos.length) return false
  state.queue.push(...newVideos)
  return true
}
function extendAfterLive (state, now) {
  const p = ensureProgramming(state)
  if (p.endsAt !== null) p.endsAt = Math.round(now + state.queue.reduce((n, v) => n + v.duration * 1000, 0))
}
function advance (state, now = Date.now()) {
  const p = ensureProgramming(state)
  if (state.live || p.endsAt === null || now < p.endsAt) return false
  let changed = false
  let transitions = 0
  while (p.endsAt !== null && now >= p.endsAt && transitions++ < 50) {
    const start = p.endsAt
    const next = p.pending.shift()
    if (next) {
      const items = next.items.filter(isPlayableVod)
      p.active = { type: 'playlist', name: next.name, id: next.playlistId }
      state.queue = items
      p.endsAt = start + Math.round(items.reduce((sum, x) => sum + x.duration * 1000, 0))
    } else {
      p.active = { type: 'auto', name: 'Αυτόματο πρόγραμμα' }
      // Editorial edits to already-played videos are applied only now,
      // at the next cycle boundary (or after all scheduled TV playlists).
      state.queue = (p.cyclePlan?.items || p.autoQueue).filter(isPlayableVod)
      if (p.cyclePlan) p.cyclePlan.played = []
      p.endsAt = p.pending.length ? start + Math.round(state.queue.reduce((n, v) => n + v.duration * 1000, 0)) : null
    }
    state.anchorAt = start
    state.anchorUuid = state.queue[0]?.uuid || null
    state.anchorOffset = 0
    changed = true
    // No available playable items: skip empty playlist without waiting until next tick.
    if (!state.queue.length && p.endsAt === null) break
  }
  return changed
}
function adminStatus (state, now = Date.now()) {
  const p = ensureProgramming(state)
  const current = state.live || currentVod(state, now)?.video || null
  const upcoming = state.live ? queueAfterLive(state, now) : remainingForAdmin(state, now)
  let nextAt = state.live ? null : p.endsAt
  const pending = p.pending.map(item => {
    const duration = item.items.reduce((sum, video) => sum + video.duration * 1000, 0)
    const result = { id: item.id, playlistId: item.playlistId, name: item.name,
      count: item.items.length, startsAt: nextAt, endsAt: nextAt === null ? null : nextAt + duration }
    if (nextAt !== null) nextAt += duration
    return result
  })
  return { revision: p.revision, live: !!state.live, active: p.active, current,
    cycle: cycleForAdmin(state, now),
    currentEndsAt: state.live ? null : p.endsAt, upcoming, playlists: p.playlists.map(({ id, name, items }) => ({ id, name, items })), pending }
}
function publicSchedule (state, result, count = 8) {
  const p = ensureProgramming(state)
  const planned = p.pending.map(x => ({ name: x.name, count: x.items.length }))
  if (result.mode !== 'vod' || p.endsAt === null) return { ...result, nextPlaylists: planned }
  // The original EPG loops the current queue. Stop it at the end of this playlist,
  // then display the items in the scheduled TV playlists at their actual start time.
  const upcoming = (result.upcoming || []).filter(v => v.startsAt < p.endsAt).slice(0, count)
  let start = p.endsAt
  for (const slot of p.pending) {
    for (const v of slot.items) {
      if (upcoming.length < count) upcoming.push({ ...v, startsAt: start, endsAt: start + v.duration * 1000 })
      start += v.duration * 1000
    }
  }
  if (upcoming.length < count && (p.active.type === 'playlist' || p.cyclePlan)) {
    for (const v of (p.cyclePlan?.items || p.autoQueue)) {
      if (upcoming.length >= count) break
      upcoming.push({ ...v, startsAt: start, endsAt: start + v.duration * 1000 })
      start += v.duration * 1000
    }
  }
  return { ...result, upcoming, nextPlaylists: planned }
}
module.exports = { publicSchedule, createProgramming, ensureProgramming, uniqueVideos, reorder, editCycle, cycleForAdmin, addPlaylist,
  deletePlaylist, schedule, unschedule, reorderScheduled, updateAuto, mergeDuringLive,
  extendAfterLive, advance, adminStatus, calculateEnd }
