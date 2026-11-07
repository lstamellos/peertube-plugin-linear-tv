'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

test('browser client ESM registers /p/tv with PeerTube route loader', async () => {
  const script = readFileSync(join(__dirname, '..', 'client', 'common-client-plugin.js'), 'utf8')
  const url = 'data:text/javascript;base64,' + Buffer.from(script, 'utf8').toString('base64')
  // PeerTube 8.x loads client scripts through dynamic import, not require().
  const client = await import(url)
  assert.equal(typeof client.register, 'function')
  let received
  client.register({
    registerClientRoute (options) { received = options },
    peertubeHelpers: {}
  })
  assert.equal(received.route, 'tv')
  assert.equal(typeof received.onMount, 'function')
})
