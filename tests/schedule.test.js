'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const T = require('../lib/schedule')
const ids = Array.from({ length: 7 }, (_, n) => `00000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`)
function vod (i, duration = 60, publishedAt = '2026-10-28T01:00:00Z') {
  return { uuid: ids[i], name: 'Video ' + i, duration, state: 1,
    isLive: false, playable: true, publishedAt }
}
function live (i, state = 1) { return { ...vod(i), isLive: true, state, duration: 0 } }
function state (now = 0, vids = [vod(0), vod(1, 120), vod(2, 30)]) {
  const s = T.createState(now)
  T.setQueue(s, vids, now)
  return s
}
test('normalize filters unlisted, private, NSFW, waiting and ended live', () => {
  const raw = { ...vod(0), state: { id: 1 }, privacy: { id: 1 } }
  assert.ok(T.isPlayableVod(T.normalizeVideo(raw)))
  for (const privacy of [2, 3, 4, 5]) {
    assert.equal(T.normalizeVideo({ ...raw, privacy: { id: privacy } }), null)
  }
  assert.equal(T.isPlayableVod(T.normalizeVideo({ ...raw, nsfw: true })), false)
  assert.equal(T.isActiveLive(live(4, 1)), true)
  assert.equal(T.isActiveLive(live(4, 4)), false)
  assert.equal(T.isActiveLive(live(4, 5)), false)
})
test('EPG adds real durations, respects boundaries and repeats a cycle', () => {
  const s = state(10000)
  assert.deepEqual(T.status(s, 10000).upcoming.map(x => x.startsAt).slice(0, 3), [70000, 190000, 220000])
  assert.equal(T.status(s, 69999).current.uuid, ids[0])
  assert.equal(T.status(s, 70000).current.uuid, ids[1])
  assert.equal(T.status(s, 190000).current.uuid, ids[2])
  assert.equal(T.status(s, 220000).current.uuid, ids[0])
})
test('after live resumes interrupted VOD at the exact stored offset', () => {
  const s = state(0)
  assert.equal(T.status(s, 25000).elapsedSeconds, 25)
  assert.equal(T.applyLive(s, [live(4)], 25000), true)
  assert.deepEqual(T.status(s, 100000).upcomingAfterLive.map(x => x.uuid),
    [ids[0], ids[1], ids[2]])
  assert.equal(T.applyLive(s, [], 125000), true)
  const result = T.status(s, 125000)
  assert.equal(result.current.uuid, ids[0])
  assert.equal(result.elapsedSeconds, 25)
  assert.equal(result.upcoming[0].uuid, ids[1])
  assert.equal(result.upcoming[0].startsAt, 160000)
  assert.equal(T.status(s, 130000).elapsedSeconds, 30)
})
test('a second programme resumes at the original offset before the third', () => {
  const s = state(0)
  T.applyLive(s, [live(4)], 80000)
  assert.equal(T.status(s, 80000).upcomingAfterLive[0].uuid, ids[1])
  T.applyLive(s, [], 100000)
  assert.equal(T.status(s, 100000).current.uuid, ids[1])
  assert.equal(T.status(s, 100000).elapsedSeconds, 20)
  assert.equal(T.status(s, 200000).current.uuid, ids[2])
  assert.equal(T.status(s, 200000).elapsedSeconds, 0)
})
test('new published VODs follow the resumed programme, newest first', () => {
  const s = state(0)
  T.applyLive(s, [live(4)], 25000)
  const latest = vod(3, 45, new Date(80000).toISOString())
  const olderNew = vod(5, 90, new Date(50000).toISOString())
  T.setQueue(s, [latest, olderNew, vod(0), vod(1, 120), vod(2, 30)], 90000)
  assert.deepEqual(T.status(s, 90000).upcomingAfterLive.map(x => x.uuid),
    [ids[0], ids[3], ids[5], ids[1], ids[2]])
  T.applyLive(s, [], 100000)
  assert.equal(T.status(s, 100000).current.uuid, ids[0])
  assert.equal(T.status(s, 100000).elapsedSeconds, 25)
  assert.equal(T.status(s, 135000).current.uuid, ids[3])
  assert.equal(T.status(s, 180000).current.uuid, ids[5])
  assert.equal(T.status(s, 270000).current.uuid, ids[1])
  T.setQueue(s, [latest, olderNew, vod(0), vod(1, 120), vod(2, 30)], 150000)
  assert.equal(T.status(s, 150000).upcoming[0].uuid, ids[5], 'refresh must preserve EPG order')
})
test('old VOD discovered during live is not promoted ahead of interrupted programme', () => {
  const s = state(0)
  T.applyLive(s, [live(4)], 25000)
  const oldButDiscoveredLater = vod(3, 60, new Date(10000).toISOString())
  T.setQueue(s, [oldButDiscoveredLater, vod(0), vod(1, 120), vod(2, 30)], 90000)
  assert.equal(T.status(s, 90000).upcomingAfterLive[0].uuid, ids[0])
  T.applyLive(s, [], 100000)
  assert.equal(T.status(s, 100000).current.uuid, ids[0])
  assert.equal(T.status(s, 100000).elapsedSeconds, 25)
  assert.equal(T.status(s, 135000).current.uuid, ids[1])
})
test('consecutive live broadcasts retain interrupted offset and new publication window', () => {
  const s = state(0)
  T.applyLive(s, [live(4)], 50000)
  assert.equal(T.applyLive(s, [live(5), live(4)], 60000), false)
  assert.equal(T.applyLive(s, [live(5)], 90000), true)
  const newlyPublished = vod(3, 180, new Date(70000).toISOString())
  T.setQueue(s, [newlyPublished, vod(0), vod(1, 120), vod(2, 30)], 95000)
  assert.deepEqual(T.status(s, 95000).upcomingAfterLive.map(x => x.uuid).slice(0, 2),
    [ids[0], ids[3]])
  T.applyLive(s, [], 100000)
  assert.equal(T.status(s, 100000).current.uuid, ids[0])
  assert.equal(T.status(s, 100000).elapsedSeconds, 50)
  assert.equal(T.status(s, 110000).current.uuid, ids[3])
})
test('privacy changes remove unavailable videos without losing a still-available interrupted VOD', () => {
  const s = state(0)
  T.applyLive(s, [live(4)], 25000)
  T.setQueue(s, [vod(0), vod(2, 30)], 90000)
  assert.deepEqual(T.status(s, 90000).upcomingAfterLive.map(x => x.uuid), [ids[0], ids[2]])
  T.applyLive(s, [], 100000)
  assert.equal(T.status(s, 100000).current.uuid, ids[0])
  assert.equal(T.status(s, 100000).elapsedSeconds, 25)
})
test('new VOD during regular playback enters after current without resetting elapsed time', () => {
  const s = state(0)
  assert.equal(T.status(s, 80000).current.uuid, ids[1])
  T.setQueue(s, [vod(3), vod(0), vod(1, 120), vod(2, 30)], 80000)
  const result = T.status(s, 80000)
  assert.equal(result.current.uuid, ids[1])
  assert.equal(result.elapsedSeconds, 20)
  assert.equal(result.upcoming[0].uuid, ids[3])
  assert.equal(result.upcoming[0].startsAt, 180000)
  T.setQueue(s, [vod(3), vod(0), vod(1, 120), vod(2, 30)], 100000)
  assert.equal(T.status(s, 100000).upcoming[0].uuid, ids[3])
})
test('programme clock survives restarts without advancing the paused offset', () => {
  const s = state(0)
  assert.equal(T.status(JSON.parse(JSON.stringify(s)), 200000).current.uuid, ids[2])
  T.applyLive(s, [live(4)], 10000)
  T.setQueue(s, [vod(0), vod(3)], 90000)
  const persisted = JSON.parse(JSON.stringify(s))
  T.applyLive(persisted, [], 100000)
  assert.equal(T.status(persisted, 100000).current.uuid, ids[0])
  assert.equal(T.status(persisted, 100000).elapsedSeconds, 10)
})
test('empty channel and single-item channel behave correctly', () => {
  const s = T.createState(0)
  assert.equal(T.status(s, 0).mode, 'empty')
  T.applyLive(s, [live(4)], 10000)
  assert.equal(T.status(s, 10000).mode, 'live')
  T.applyLive(s, [], 20000)
  assert.equal(T.status(s, 20000).mode, 'empty')
  T.setQueue(s, [vod(0)], 20000)
  T.applyLive(s, [live(4)], 25000)
  T.applyLive(s, [], 30000)
  assert.equal(T.status(s, 30000).current.uuid, ids[0])
  assert.equal(T.status(s, 30000).elapsedSeconds, 5)
})
test('new media without public/published/playable state and zero-length VOD stay out of schedule', () => {
  const s = state(0)
  T.setQueue(s, [null, live(4), { ...vod(2), duration: 0 }, vod(3)], 30000)
  assert.equal(T.status(s, 30000).current.uuid, ids[3])
})

test('PeerTube 8.3.2 public account VOD without state is included in the schedule', () => {
  const raw = {
    uuid: '03b636dc-3bf3-4f53-89af-2827cf2d8453',
    name: 'Example public VOD',
    duration: 13427,
    privacy: { id: 1, label: 'Public' },
    nsfw: false,
    isLive: false,
    publishedAt: '2026-10-24T14:33:47.174Z',
    channel: { name: 'events' }
  }
  const normalized = T.normalizeVideo(raw)
  assert.ok(T.isPlayableVod(normalized))
  assert.equal(normalized.state, 1)
  const s = T.createState(0)
  assert.equal(T.setQueue(s, [normalized], 0), true)
  assert.equal(T.status(s, 0).current.uuid, raw.uuid)
  assert.equal(T.normalizeVideo({ ...raw, privacy: { id: 2 } }), null)
  assert.equal(T.normalizeVideo({ ...raw, publishedAt: null }), null)
  assert.equal(T.normalizeVideo({ ...raw, duration: 0 }), null)
  // Missing state must not turn an upcoming or ended live into on-air content.
  const unknownLive = T.normalizeVideo({ ...raw, isLive: true, duration: 0 })
  assert.equal(unknownLive, null)
  assert.equal(T.isActiveLive(T.normalizeVideo({ ...raw, state: { id: 4 }, isLive: true, duration: 0 })), false)
  assert.equal(T.isActiveLive(T.normalizeVideo({ ...raw, state: { id: 1 }, isLive: true, duration: 0 })), true)
})
