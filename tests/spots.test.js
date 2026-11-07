'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const T = require('../lib/schedule')
const P = require('../lib/programming')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const vod = (n, duration = 30) => ({
  uuid: id(n), name: 'Video ' + n, duration, state: 1,
  isLive: false, playable: true, privacy: 1, publishedAt: '2026-10-01T00:00:00Z'
})
const spot = (n, duration = 5) => ({
  ...vod(n, duration), privacy: 2, interstitial: true
})
const live = () => ({ ...vod(9, 0), isLive: true })
function ready () {
  const s = T.createState(0)
  s.queue = [vod(1), vod(2, 40)]
  s.anchorUuid = id(1)
  s.spots = [spot(5, 5), spot(6, 7)]
  P.ensureProgramming(s)
  P.updateAuto(s, s.queue)
  return s
}

test('unlisted spot by UUID is allowed, but not as regular playlist content', () => {
  const raw = { ...vod(5, 5), privacy: { id: 2 }, state: { id: 1 } }
  assert.equal(T.normalizeVideo(raw), null)
  assert.equal(T.normalizeSpot(raw).interstitial, true)
  assert.equal(T.normalizeSpot(raw).privacy, 2)
  assert.ok(T.normalizeSpot({ ...raw, privacy: { id: 1 } }))
  for (const privacy of [3, 4, 5]) {
    assert.equal(T.normalizeSpot({ ...raw, privacy: { id: privacy } }), null)
  }
  assert.equal(T.normalizeSpot({ ...raw, isLive: true }), null)
  assert.equal(T.normalizeSpot({ ...raw, nsfw: true }), null)
})

test('successive spots run between VODs with synchronized boundaries and correct EPG', () => {
  const s = ready()
  const at = time => T.status(s, time)
  assert.equal(at(29999).current.uuid, id(1))
  assert.equal(at(30000).current.uuid, id(5))
  assert.equal(at(30000).interstitial, true)
  assert.equal(at(34999).elapsedSeconds, 4.999)
  assert.equal(at(35000).current.uuid, id(6))
  assert.equal(at(42000).current.uuid, id(2))
  assert.equal(at(42000).elapsedSeconds, 0)
  assert.equal(at(82000).current.uuid, id(5))
  assert.equal(at(87000).current.uuid, id(6))
  assert.equal(at(94000).current.uuid, id(1))
  assert.equal(at(1000).upcoming[0].startsAt, 42000)
  assert.equal(at(36000).upcoming[0].startsAt, 42000)
  assert.equal(T.status(JSON.parse(JSON.stringify(s)), 42000).current.uuid, id(2))
})

test('after live, show all spots before the next entire VOD', () => {
  const s = ready()
  T.applyLive(s, [live()], 20000)
  assert.deepEqual(T.status(s, 50000).upcomingAfterLive.slice(0, 3).map(x => x.uuid),
    [id(5), id(6), id(2)])
  T.applyLive(s, [], 100000)
  assert.equal(T.status(s, 100000).current.uuid, id(5))
  assert.equal(T.status(s, 100000).upcoming[0].startsAt, 112000)
  assert.equal(T.status(s, 105000).current.uuid, id(6))
  assert.equal(T.status(s, 112000).current.uuid, id(2))
  assert.equal(T.status(s, 112000).elapsedSeconds, 0)
  assert.equal(T.status(s, 152000).current.uuid, id(5))
})

test('a live interrupting a spot returns to fresh spots then the next programme', () => {
  const s = ready()
  T.applyLive(s, [live()], 31000)
  T.applyLive(s, [], 50000)
  assert.equal(T.status(s, 50000).current.uuid, id(5))
  assert.equal(T.status(s, 62000).current.uuid, id(2))
})

test('scheduled playlists transition after the last interstitial, not before', () => {
  const s = ready()
  P.addPlaylist(s, { id: 'next', name: 'Next', items: [vod(3, 10)] })
  P.schedule(s, 'next', 15000, 'slot')
  assert.equal(s.programming.endsAt, 94000)
  const epg = P.publicSchedule(s, T.status(s, 16000))
  assert.deepEqual(epg.upcoming.map(x => x.uuid), [id(2), id(3)])
  assert.equal(epg.upcoming[1].startsAt, 94000)
  assert.equal(P.advance(s, 93999), false)
  assert.equal(P.advance(s, 94000), true)
  assert.equal(T.status(s, 94000).current.uuid, id(3))
  assert.equal(s.programming.endsAt, 116000)
})

test('live with a scheduled playlist adds intro and all subsequent breaks', () => {
  const s = ready()
  P.addPlaylist(s, { id: 'later', name: 'Later', items: [vod(3, 10)] })
  P.schedule(s, 'later', 20000, 'slot')
  T.applyLive(s, [live()], 20000)
  T.applyLive(s, [], 100000)
  P.extendAfterLive(s, 100000)
  assert.equal(s.programming.endsAt, 206000)
  assert.equal(P.advance(s, 205999), false)
  assert.equal(P.advance(s, 206000), true)
  assert.equal(T.status(s, 206000).current.uuid, id(3))
})

test('spot edits preserve a playing VOD and cannot interrupt an airing spot', () => {
  const s = ready()
  P.setSpots(s, [spot(7, 8)], 16000)
  assert.equal(T.status(s, 16000).elapsedSeconds, 16)
  assert.equal(T.status(s, 30000).current.uuid, id(7))
  assert.equal(T.status(s, 38000).current.uuid, id(2))
  assert.throws(() => P.setSpots(s, [], 35000), /Wait until/)
  P.setSpots(s, [], 39000)
  assert.equal(T.status(s, 39000).current.uuid, id(2))
})

test('legacy saved programme without spots remains unchanged', () => {
  const s = ready()
  delete s.spots
  assert.equal(T.status(s, 30000).current.uuid, id(2))
  T.applyLive(s, [live()], 31000)
  T.applyLive(s, [], 50000)
  assert.equal(T.status(s, 50000).current.uuid, id(1))
})
