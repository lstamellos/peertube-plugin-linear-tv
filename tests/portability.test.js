'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { renderEmbedPage } = require('../lib/embed')
const root = join(__dirname, '..')
const sources = [
  'README.md', 'package.json', 'main.js',
  'lib/embed.js', 'lib/programming.js', 'lib/schedule.js',
  'client/common-client-plugin.js', 'client/programme-client-plugin.js',
  'client/embed-client.js', 'docs/USAGE.md', 'docs/FEATURES.md',
  'docs/EMBEDDING.md'
]

test('release sources and documentation do not depend on a particular PeerTube host', () => {
  for (const file of sources) {
    const content = readFileSync(join(root, file), 'utf8')
    assert.doesNotMatch(content, /omniatv|cremedia\.studio/i, file)
  }
})

test('both viewer and programme administrator provide English on non-Greek pages', async () => {
  const originalDocument = globalThis.document
  try {
    for (const file of ['client/common-client-plugin.js', 'client/programme-client-plugin.js']) {
      const source = readFileSync(join(root, file), 'utf8')
      const mod = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
      globalThis.document = { documentElement: { lang: 'en' } }
      assert.equal(mod.uiText('Προγραμματισμός TV', 'TV programme'), 'TV programme')
      globalThis.document.documentElement.lang = 'el'
      assert.equal(mod.uiText('Προγραμματισμός TV', 'TV programme'), 'Προγραμματισμός TV')
    }
  } finally {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})

test('embed document language is generic and constrained to supported locales', () => {
  const page = language => renderEmbedPage({
    routerBase: '/plugins/linear-tv/router', staticBase: '/plugins/linear-tv/static', language
  })
  assert.match(page('en'), /<html lang="en">/)
  assert.match(page('el'), /<html lang="el">/)
  assert.match(page('<script>'), /<html lang="en">/)
})
