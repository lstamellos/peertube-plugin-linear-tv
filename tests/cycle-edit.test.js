'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const t = require('../lib/schedule')
const p = require('../lib/programming')
const id = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const vid = (n, secs = 30) => ({ uuid: id(n), name: 'Video '+n, duration: secs,
  isLive: false, state: 1, playable: true, publishedAt: '2026-10-27T00:00:00Z' })
function make () {
  const s = t.createState(0)
  s.queue = [vid(1), vid(2), vid(3)]
  s.anchorAt = 0
  s.anchorUuid = id(1)
  p.ensureProgramming(s)
  p.updateAuto(s, s.queue)
  return s
}
test('full playlist edit: remove future, add future, defer inserted video before playhead', () => {
  const s = make()
  const before = t.currentVod(s, 45000)
  // Current video is #2, #1 has already played. #4 is inserted before the playhead.
  p.editCycle(s, [vid(4), vid(1), vid(2), vid(5)], 45000)
  const after = t.currentVod(s, 45000)
  assert.equal(after.video.uuid, before.video.uuid)
  assert.equal(after.offset, before.offset)
  assert.deepEqual(s.queue.map(x => x.uuid), [id(2), id(5)], 'Future #3 removed; #5 plays next')
  assert.equal(s.programming.endsAt, 90000)
  const admin = p.adminStatus(s, 45000)
  assert.deepEqual(admin.cycle.items.map(x => x.uuid), [id(4), id(1), id(2), id(5)])
  assert.deepEqual(admin.cycle.playedUuids, [id(1)])
  assert.deepEqual(admin.upcoming.map(x => x.uuid), [id(5)])
  assert.equal(t.currentVod(s, 60000).video.uuid, id(5))
  assert.equal(p.advance(s, 89999), false)
  assert.equal(p.advance(s, 90000), true)
  assert.deepEqual(s.queue.map(x => x.uuid), [id(4), id(1), id(2), id(5)], 'Edited past applies next cycle')
  assert.equal(t.currentVod(s, 90000).video.uuid, id(4))
  assert.equal(s.programming.endsAt, null)
})
test('editing an already-played item and moving it after current never replays it during this cycle', () => {
  const s = make()
  p.editCycle(s, [vid(1), vid(2), vid(5), vid(3)], 45000)
  assert.deepEqual(s.queue.map(x => x.uuid), [id(2), id(5), id(3)])
  // #5 is now on air. #2 is already played but is moved after #5 in the next cycle.
  p.editCycle(s, [vid(5), vid(2), vid(3), vid(1)], 75000)
  assert.equal(t.currentVod(s, 75000).video.uuid, id(5))
  assert.equal(t.currentVod(s, 75000).offset, 15)
  assert.deepEqual(s.queue.map(x => x.uuid), [id(5), id(3)], 'Already played #2 and #1 deferred')
  assert.deepEqual(p.adminStatus(s, 75000).cycle.playedUuids, [id(1), id(2)])
  assert.equal(s.programming.endsAt, 120000)
  p.advance(s, 120000)
  assert.deepEqual(s.queue.map(x => x.uuid), [id(5), id(2), id(3), id(1)])
})
test('edited cycle waits for saved/scheduled TV playlists then applies full next-cycle order', () => {
  const s = make()
  p.editCycle(s, [vid(1), vid(2), vid(4)], 45000)
  p.addPlaylist(s, { id: 'special', name: 'Special', items: [vid(6, 45)] })
  p.schedule(s, 'special', 45000, 'session')
  assert.equal(s.programming.endsAt, 90000)
  assert.equal(p.advance(s, 90000), true)
  assert.equal(t.currentVod(s, 90000).video.uuid, id(6))
  assert.equal(s.programming.endsAt, 135000)
  assert.equal(p.advance(s, 135000), true)
  assert.deepEqual(s.queue.map(x => x.uuid), [id(1), id(2), id(4)])
  assert.equal(t.currentVod(s, 135000).video.uuid, id(1))
})
test('cycle edits reject empty/duplicate/not playable/current removal; live must not be edited', () => {
  const s = make()
  const bad = { ...vid(4), playable: false }
  assert.throws(() => p.editCycle(s, [], 45000), /1–100/)
  assert.throws(() => p.editCycle(s, [vid(2), vid(2)], 45000), /duplicate/)
  assert.throws(() => p.editCycle(s, [bad, vid(2)], 45000), /unavailable/)
  assert.throws(() => p.editCycle(s, [vid(1), vid(3)], 45000), /currently playing/)
  s.live = { ...vid(7), isLive: true }
  assert.throws(() => p.editCycle(s, [vid(1), vid(2), vid(3)], 45000), /during live/)
})
test('public EPG transitions from edited remainder to next-cycle full playlist', () => {
  const s = make()
  p.editCycle(s, [vid(4), vid(1), vid(2), vid(5)], 45000)
  const result = p.publicSchedule(s, t.status(s, 45000, 8), 8)
  assert.deepEqual(result.upcoming.slice(0, 5).map(x => x.uuid), [id(5), id(4), id(1), id(2), id(5)])
  assert.equal(result.upcoming[0].startsAt, 60000)
  assert.equal(result.upcoming[1].startsAt, 90000)
})
