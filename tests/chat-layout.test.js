'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, '..', 'client', 'common-client-plugin.js'), 'utf8')
const sourceURL = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
const loadClient = () => import(sourceURL)

test('chat matches player height but cannot exceed the available desktop viewport', async () => {
  const { fitChatToPlayer } = await loadClient()
  const videoEl = { getBoundingClientRect () { return { height: 320 } } }
  const chat = { hidden: false, style: {}, getBoundingClientRect () { return { top: 92 } } }
  const windowObj = { innerHeight: 900, matchMedia () { return { matches: false } } }
  fitChatToPlayer(videoEl, chat, windowObj)
  assert.equal(chat.style.height, '320px')
  windowObj.innerHeight = 300
  fitChatToPlayer(videoEl, chat, windowObj)
  assert.equal(chat.style.height, '196px', 'chat never stretches below the available viewport')
  chat.hidden = true
  fitChatToPlayer(videoEl, chat, windowObj)
  assert.equal(chat.style.height, '196px', 'do not change chat height while it is hidden')
  chat.hidden = false
  windowObj.matchMedia = () => ({ matches: true })
  fitChatToPlayer(videoEl, chat, windowObj)
  assert.equal(chat.style.height, '', 'mobile layout uses bounded CSS height')
})

test('chat toggle updates accessible state and hides the original iframe without touching its nodes', async () => {
  const { setChatVisibility } = await loadClient()
  const embeddedChat = { src: '/plugins/livechat/router/webchat/room/abc' }
  const chat = { hidden: false, children: [embeddedChat] }
  const layout = { classes: new Set(), classList: { toggle (name, yes) {
    if (yes) layout.classes.add(name)
    else layout.classes.delete(name)
  } } }
  const button = { attrs: {}, setAttribute (name, value) { this.attrs[name] = value } }
  setChatVisibility(chat, layout, button, false)
  assert.equal(chat.hidden, true)
  assert.equal(layout.classes.has('lt-chat-hidden'), true)
  assert.equal(button.attrs['aria-expanded'], 'false')
  assert.equal(button.textContent, 'Εμφάνιση συνομιλίας')
  setChatVisibility(chat, layout, button, true)
  assert.equal(chat.hidden, false)
  assert.equal(layout.classes.has('lt-chat-hidden'), false)
  assert.equal(button.attrs['aria-expanded'], 'true')
  assert.equal(button.textContent, 'Απόκρυψη συνομιλίας')
  assert.strictEqual(chat.children[0], embeddedChat)
})

test('title and video action are created inside a single EPG content cell', async () => {
  const { createEPGEntry } = await loadClient()
  const previousDocument = globalThis.document
  const createElement = tag => ({
    tagName: tag.toUpperCase(), className: '', textContent: '', children: [],
    setAttribute () {},
    appendChild (node) { this.children.push(node) }
  })
  try {
    globalThis.document = { createElement }
    const video = { uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'A video' }
    const { content, label } = createEPGEntry(video, video.name)
    assert.equal(content.className, 'lt-epg-entry')
    assert.strictEqual(content.children[0], label)
    assert.equal(label.className, 'lt-epg-title')
    assert.equal(content.children[1].href, '/w/' + video.uuid)
    assert.equal(content.children.length, 2)
  } finally {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
})

test('layout CSS cannot stretch chat to EPG height and aligns each action to the row right', () => {
  const css = readFileSync(join(__dirname, '..', 'client', 'linear-tv.css'), 'utf8')
  assert.match(css, /\.lt-layout\s*\{[^}]*align-items:\s*start/)
  assert.match(css, /\.lt-chat\s*\{[^}]*align-self:\s*start/)
  assert.match(css, /\.lt-chat\[hidden\]\s*\{[^}]*display:\s*none/)
  assert.match(css, /\.lt-epg-entry\s*\{[^}]*display:\s*flex/)
  assert.match(css, /\.lt-epg-entry > \.lt-video-link\s*\{[^}]*margin-left:\s*auto/)
  assert.doesNotMatch(css, /min-height:\s*470px/)
})
