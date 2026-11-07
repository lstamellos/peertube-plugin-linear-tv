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

test('after live, play only the next spot and resume the interrupted VOD offset', () => {
  const s = ready()
  T.applyLive(s, [live()], 20000)
  assert.equal(s.paused.offset, 20)
  assert.deepEqual(T.status(s, 50000).upcomingAfterLive.map(x => x.uuid).slice(0, 2),
    [id(1), id(2)])
  assert.equal(T.status(s, 50000).upcomingAfterLive[0].resumeOffsetSeconds, 20)
  assert.ok(T.status(s, 50000).upcomingAfterLive.every(x => !x.interstitial))
  T.applyLive(s, [], 100000)
  assert.equal(T.status(s, 100000).current.uuid, id(5))
  assert.equal(T.status(s, 100000).elapsedSeconds, 0)
  assert.equal(T.status(s, 100000).upcoming[0].uuid, id(1))
  assert.equal(T.status(s, 100000).upcoming[0].startsAt, 105000)
  assert.equal(T.status(s, 100000).upcoming[0].endsAt, 115000)
  assert.equal(T.status(s, 105000).current.uuid, id(1))
  assert.equal(T.status(s, 105000).elapsedSeconds, 20)
  assert.equal(T.status(s, 109000).elapsedSeconds, 24)
  assert.equal(T.status(s, 115000).current.uuid, id(5))
  assert.equal(T.status(s, 120000).current.uuid, id(6))
  assert.equal(T.status(s, 127000).current.uuid, id(2))
})
test('live interruption of an ordinary spot resumes that exact segment after one return spot', () => {
  const s = ready()
  assert.equal(T.status(s, 31000).current.uuid, id(5))
  assert.equal(T.status(s, 31000).elapsedSeconds, 1)
  T.applyLive(s, [live()], 31000)
  assert.equal(s.paused.offset, 31)
  T.applyLive(s, [], 50000)
  assert.equal(T.status(s, 50000).current.uuid, id(5))
  assert.equal(T.status(s, 55000).current.uuid, id(5))
  assert.equal(T.status(s, 55000).elapsedSeconds, 1)
  assert.equal(T.status(s, 59000).current.uuid, id(6))
  assert.equal(T.status(s, 66000).current.uuid, id(2))
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

test('live return with scheduled playlist counts one spot and unplayed remainder only', () => {
  const s = ready()
  P.addPlaylist(s, { id: 'later', name: 'Later', items: [vod(3, 10)] })
  P.schedule(s, 'later', 20000, 'slot')
  T.applyLive(s, [live()], 20000)
  T.applyLive(s, [], 100000)
  P.extendAfterLive(s, 100000)
  assert.equal(s.programming.endsAt, 179000)
  assert.equal(T.status(s, 105000).current.uuid, id(1))
  assert.equal(T.status(s, 105000).elapsedSeconds, 20)
  assert.equal(P.advance(s, 178999), false)
  assert.equal(P.advance(s, 179000), true)
  assert.equal(T.status(s, 179000).current.uuid, id(3))
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

test('legacy state without spots still resumes interrupted VOD at saved offset', () => {
  const s = ready()
  delete s.spots
  assert.equal(T.status(s, 30000).current.uuid, id(2))
  T.applyLive(s, [live()], 31000)
  assert.equal(s.paused.uuid, id(2))
  assert.equal(s.paused.offset, 1)
  T.applyLive(s, [], 50000)
  assert.equal(T.status(s, 50000).current.uuid, id(2))
  assert.equal(T.status(s, 50000).elapsedSeconds, 1)
})

test('consecutive live interruptions rotate only one spot each time', () => {
  const s = ready()
  T.applyLive(s, [live()], 18000)
  T.applyLive(s, [], 40000)
  assert.equal(T.status(s, 40000).current.uuid, id(5))
  assert.equal(T.status(s, 45000).current.uuid, id(1))
  assert.equal(T.status(s, 45000).elapsedSeconds, 18)
  T.applyLive(s, [live()], 47000)
  assert.equal(s.paused.offset, 20)
  assert.equal(T.status(s, 50000).upcomingAfterLive[0].uuid, id(1))
  assert.ok(T.status(s, 50000).upcomingAfterLive.every(x => !x.interstitial))
  T.applyLive(s, [], 80000)
  assert.equal(T.status(s, 80000).current.uuid, id(6))
  assert.equal(T.status(s, 87000).current.uuid, id(1))
  assert.equal(T.status(s, 87000).elapsedSeconds, 20)
  assert.equal(s.nextSpotIndex, 0)
  const saved = JSON.parse(JSON.stringify(s))
  assert.equal(T.status(saved, 88000).elapsedSeconds, 21)
  T.applyLive(saved, [live()], 90000)
  T.applyLive(saved, [], 120000)
  assert.equal(T.status(saved, 120000).current.uuid, id(5))
})

test('restart during return spot preserves the selected spot and the paused offset', () => {
  const s = ready()
  T.applyLive(s, [live()], 19000)
  T.applyLive(s, [], 100000)
  const persisted = JSON.parse(JSON.stringify(s))
  assert.equal(T.status(persisted, 102000).current.uuid, id(5))
  assert.equal(T.status(persisted, 102000).elapsedSeconds, 2)
  assert.equal(T.status(persisted, 105000).current.uuid, id(1))
  assert.equal(T.status(persisted, 105000).elapsedSeconds, 19)
  assert.deepEqual(T.status(persisted, 102000).upcoming.map(v => v.uuid).slice(0, 2),
    [id(1), id(2)])
})

test('reordering sources during a return spot does not advance the paused programme', () => {
  const s = ready()
  T.applyLive(s, [live()], 15000)
  T.applyLive(s, [], 40000)
  assert.equal(T.status(s, 41000).current.uuid, id(5))
  T.setQueue(s, [vod(1), vod(3, 10), vod(2, 40)], 41000)
  assert.equal(T.status(s, 43000).current.uuid, id(5))
  assert.equal(T.status(s, 45000).current.uuid, id(1))
  assert.equal(T.status(s, 45000).elapsedSeconds, 15)
  assert.equal(T.status(s, 57000).upcoming[0].uuid, id(3))
})
