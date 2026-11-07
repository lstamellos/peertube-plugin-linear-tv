'use strict'

// Generate a paste-ready, responsive embed from the current PeerTube origin.
// Drop the plugin's version component, if present, to keep copied URLs working
// across plugin upgrades. The source must always be a local plugin route.
function generateEmbedCode (origin, routerBase) {
  const site = new URL(origin)
  if (!['http:', 'https:'].includes(site.protocol)) throw new Error('HTTP(S) origin required')
  if (typeof routerBase !== 'string' || !routerBase.startsWith('/') || routerBase.startsWith('//')) {
    throw new Error('Expected a local PeerTube plugin route')
  }
  const stableRouter = routerBase.replace(/\/+$/, '')
    .replace(/\/\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?(?=\/router$)/i, '')
  const embedUrl = new URL(stableRouter + '/embed', site.origin)
  const htmlUrl = embedUrl.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeOrigin = JSON.stringify(site.origin).replace(/</g, '\\u003c')

  return [
    '<iframe',
    '  src="' + htmlUrl + '"',
    '  title="Linear TV"',
    '  scrolling="no"',
    '  style="display:block;width:100%;height:850px;border:0;overflow:hidden"',
    '  allow="autoplay; fullscreen; picture-in-picture"',
    '  allowfullscreen>',
    '</iframe>',
    '<script>',
    '(() => {',
    '  const frame = document.currentScript.previousElementSibling',
    '  const peerTubeOrigin = ' + safeOrigin,
    "  if (!frame || frame.tagName !== 'IFRAME') return",
    "  window.addEventListener('message', event => {",
    "    if (event.origin !== peerTubeOrigin ||",
    "        event.source !== frame.contentWindow ||",
    "        event.data?.type !== 'linear-tv:resize') return",
    '    const height = Number(event.data.height)',
    '    if (Number.isFinite(height) && height >= 200 && height <= 4000) {',
    "      frame.style.height = height + 'px'",
    '    }',
    '  })',
    "  frame.addEventListener('load', () => {",
    "    frame.contentWindow.postMessage({ type: 'linear-tv:request-size' }, peerTubeOrigin)",
    '  })',
    '})()',
    '</script>'
  ].join('\n')
}

// A supported PeerTube custom markup element, recognized by the plugin's
// homepage client script. Unknown tags are removed by PeerTube's sanitizer.
function generateHomepageTag () {
  return '<peertube-container data-linear-tv="true"></peertube-container>'
}

// Keep the embed intact when the viewer enables sound. PeerTube 8.3.x exposes
// its Video.js instance to the same-origin embedding page as videojsPlayer.
// The official embed API supports setVolume(), but not muted(false); changing
// volume alone cannot unmute a player started with ?muted=1.
// English is the default on non-Greek PeerTube pages; preserve the existing
// Greek interface when the instance or standalone embed declares lang="el".
function uiText (el, en) {
  const language = typeof document === 'undefined' ? 'el' : (document.documentElement?.lang || 'el')
  return /^el(?:[-_]|$)/i.test(language) ? el : en
}

function enableSoundInEmbed (videoEl, button) {
  const iframe = videoEl.querySelector('iframe')
  if (!iframe?.isConnected) return false

  try {
    // Both the TV page and its /videos/embed/... frame are served by the
    // same PeerTube host. Do not use cross-origin iframe internals.
    const frameWindow = iframe.contentWindow
    if (!frameWindow || frameWindow.location.origin !== window.location.origin) return false

    const nativePlayer = frameWindow.videojsPlayer
    if (nativePlayer && typeof nativePlayer.muted === 'function') {
      // Synchronous inside the user's click: preserves browser activation.
      nativePlayer.muted(false)
      if (typeof nativePlayer.volume === 'function' && nativePlayer.volume() === 0) {
        nativePlayer.volume(1)
      }
      if (nativePlayer.muted() !== false) return false
    } else {
      // The native player may not yet exist during early iframe startup.
      const video = frameWindow.document.querySelector('video')
      if (!video) return false
      video.muted = false
      if (video.volume === 0) video.volume = 1
      if (video.muted) return false
    }

    button.hidden = true
    return true
  } catch {
    // Leave the button available so the viewer can retry or use player controls.
    return false
  }
}

// PeerTube 8.3.x renders its native sidebar from this client filter. Using an
// internal path (rather than an external URL) keeps SPA navigation and the
// active sidebar state working for visitors whether or not they are logged in.
function addWatchMenuLink (sections, label) {
  if (!Array.isArray(sections)) return sections
  if (sections.some(section => section.links?.some(link => link.path === '/p/tv'))) return sections

  const watchLink = { path: '/p/tv', icon: 'play', label }
  const quickAccess = sections.find(section => section.key === 'quick-access')
  if (quickAccess) {
    return sections.map(section => section === quickAccess
      ? { ...section, links: [ ...section.links, watchLink ] }
      : section)
  }
  return [ { key: 'linear-tv-watch', title: '', links: [ watchLink ] }, ...sections ]
}

// A navigation link is the semantically correct control for visiting a video.
// Keep it independent of TV playback: opening a VOD must not seek/skip the EPG.
function createVideoWatchLink (video) {
  if (!video?.uuid) return null
  const link = document.createElement('a')
  link.className = 'lt-video-link'
  link.href = '/w/' + encodeURIComponent(video.uuid)
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.title = uiText("Άνοιγμα βίντεο", "Open video")
  link.setAttribute('aria-label', uiText("Άνοιγμα βίντεο: ", "Open video: ") + (video.name || ''))
  // Text and a filled visual treatment make the action apparent, not just
  // a small arrow at the end of a long programme title. Inline fallback also
  // handles browsers temporarily retaining the previous plugin stylesheet.
  link.textContent = uiText("Άνοιγμα ↗", "Open ↗")
  link.setAttribute('style', [
    'box-sizing:border-box', 'display:inline-flex', 'align-items:center', 'justify-content:center',
    'flex:0 0 auto', 'margin-left:auto', 'width:auto', 'height:auto', 'min-height:2rem',
    'padding:.4rem .65rem', 'border:1px solid #069ca4', 'border-radius:5px',
    'background:#037780', 'color:#fff', 'font-size:.8rem', 'font-weight:700',
    'line-height:1.1', 'white-space:nowrap', 'text-decoration:none'
  ].join(';'))
  return link
}

// Keep the chat panel within the player and the initial viewport. A measured
// height avoids stretching it to the full EPG column on desktop.
function fitChatToPlayer (videoEl, chatPanel, browserWindow, embedded = false) {
  if (chatPanel.hidden || typeof videoEl.getBoundingClientRect !== 'function' ||
      typeof chatPanel.getBoundingClientRect !== 'function') return

  if (browserWindow.matchMedia?.('(max-width: 800px)').matches) {
    chatPanel.style.height = '' // Mobile chat is stacked and sized by CSS.
    return
  }

  const playerHeight = videoEl.getBoundingClientRect().height
  const chatTop = chatPanel.getBoundingClientRect().top
  const viewportHeight = browserWindow.visualViewport?.height || browserWindow.innerHeight
  if (!Number.isFinite(playerHeight) || playerHeight <= 0 ||
      !Number.isFinite(chatTop) || !Number.isFinite(viewportHeight)) return

  const remainingViewport = Math.max(0, viewportHeight - Math.max(0, chatTop) - 12)
  // An embedded document does not own the host page's viewport. Prevent the
  // iframe's initial height from artificially truncating its chat panel.
  chatPanel.style.height = Math.floor(embedded ? playerHeight : Math.min(playerHeight, remainingViewport)) + 'px'
}

function setChatVisibility (chatPanel, layoutEl, toggle, visible) {
  chatPanel.hidden = !visible
  layoutEl.classList.toggle('lt-chat-hidden', !visible)
  toggle.textContent = visible ? uiText("Απόκρυψη συνομιλίας", "Hide chat") : uiText("Εμφάνιση συνομιλίας", "Show chat")
  toggle.setAttribute('aria-expanded', String(visible))
}

// A single content cell keeps the video action to the right of its title,
// including when an older two-column EPG stylesheet remains browser-cached.
function createEPGEntry (video, labelText) {
  const content = document.createElement('div')
  content.className = 'lt-epg-entry'
  // Guard the same-row layout even when the browser serves an older CSS file.
  content.setAttribute('style', 'display:flex;align-items:center;gap:.65rem;width:100%;min-width:0')
  const label = document.createElement('span')
  label.className = 'lt-epg-title'
  label.setAttribute('style', 'flex:1 1 auto;min-width:0;overflow-wrap:anywhere')
  label.textContent = labelText
  const link = createVideoWatchLink(video)
  content.appendChild(label)
  if (link) content.appendChild(link)
  return { content, label }
}

// Hide the complete EPG while live; it will be rebuilt from the fresh
// server programme times once the livestream ends.
function setProgrammeVisibility (panel, mode) {
  panel.hidden = mode === 'live'
  return !panel.hidden
}

function register ({ registerClientRoute, registerHook, peertubeHelpers }) {
  if (typeof registerHook === 'function') {
    registerHook({
      target: 'filter:left-menu.links.create.result',
      handler: async sections => {
        let label = 'Watch'
        try {
          if (typeof peertubeHelpers?.translate === 'function') {
            label = (await peertubeHelpers.translate('Watch')) || label
          }
        } catch { /* English fallback if translations are unavailable */ }
        return addWatchMenuLink(sections, label)
      }
    })
  }

  registerClientRoute({
    route: 'tv',
    title: 'Linear TV',
    onMount: ({ rootEl }) => mountLinearTV(rootEl, {
      routerBase: peertubeHelpers.getBaseRouterRoute(),
      staticBase: peertubeHelpers.getBaseStaticRoute()
    })
  })
}

// This same TV app is mounted by PeerTube's /p/tv route and by the standalone
// cross-site embed page. Both use one status feed and identical video/chat logic.
function mountLinearTV (rootEl, { routerBase, staticBase, embedded = false }) {
  rootEl.innerHTML = `
    <section id="linear-tv-app" class="${embedded ? 'lt-embed' : ''}" aria-label="Television stream">
      <header class="lt-header"><h1 class="lt-title">${uiText("Συνεχής ροή", "Continuous channel")}</h1><span class="lt-badge" hidden>● LIVE</span></header>
      <div class="lt-layout">
        <main class="lt-main">
          <div class="lt-video" id="lt-video"><div class="lt-placeholder">${uiText("Φόρτωση προγράμματος…", "Loading programme…")}</div></div>
          <div class="lt-player-actions">
            <button type="button" class="lt-sound" id="lt-sound">${uiText("Ενεργοποίηση ήχου", "Enable sound")}</button>
            <button type="button" class="lt-chat-toggle" id="lt-chat-toggle" aria-controls="lt-chat" aria-expanded="true">${uiText("Απόκρυψη συνομιλίας", "Hide chat")}</button>
            <button type="button" class="lt-embed-toggle" id="lt-embed-toggle" aria-controls="lt-embed-panel" aria-expanded="false">${uiText("Ενσωμάτωση", "Embed")}</button>
          </div>
          <section id="lt-embed-panel" class="lt-embed-panel" hidden>
            <label for="lt-embed-code">${uiText("Κώδικας ενσωμάτωσης", "Embed code")}</label>
            <textarea id="lt-embed-code" readonly rows="11" spellcheck="false"></textarea>
            <div class="lt-embed-controls">
              <button type="button" id="lt-embed-copy">${uiText("Αντιγραφή κώδικα", "Copy code")}</button>
              <span id="lt-embed-feedback" role="status" aria-live="polite"></span>
            </div>
            <label for="lt-homepage-code">${uiText("Tag αρχικής σελίδας PeerTube", "PeerTube homepage tag")}</label>
            <textarea id="lt-homepage-code" readonly rows="2" spellcheck="false"></textarea>
            <div class="lt-embed-controls">
              <button type="button" id="lt-homepage-copy">${uiText("Αντιγραφή tag", "Copy tag")}</button>
              <span id="lt-homepage-feedback" role="status" aria-live="polite"></span>
            </div>
            <p>${uiText("Το tag χρησιμοποιείται στην προσαρμοσμένη αρχική σελίδα του ίδιου PeerTube instance και δεν απαιτεί ρύθμιση εξωτερικού domain.", "Use this tag in the custom homepage of the same PeerTube instance. No external origin setting is needed.")}</p>
            <p>${uiText("Για εξωτερική ενσωμάτωση, ο διαχειριστής του PeerTube πρέπει να προσθέσει το domain της ιστοσελίδας στα Allowed external embed origins. Ο κώδικας περιλαμβάνει αυτόματη προσαρμογή ύψους όπου επιτρέπεται JavaScript.", "To embed on an external site, the PeerTube administrator must add that site's origin under Allowed external embed origins. The code includes automatic height adjustment where JavaScript is permitted.")}</p>
          </section>
          <div class="lt-now"><span class="lt-eyebrow">${uiText("ΤΩΡΑ ΠΑΙΖΕΙ", "NOW PLAYING")}</span>
            <h2 id="lt-current">—</h2><p id="lt-current-meta"></p></div>
          <section class="lt-epg"><h2>${embedded ? uiText('Προσεχώς', 'Upcoming') : uiText('Ακολουθεί', 'Next')}</h2><p id="lt-schedule-message"></p>
            <ol id="lt-queue" aria-label="${uiText("Πρόγραμμα", "Programme")}"></ol></section>
        </main>
        <aside class="lt-chat" id="lt-chat"><h2>${uiText("Ζωντανή συζήτηση", "Live chat")}</h2>
          <div id="lt-chat-body" class="lt-chat-body"><p>${uiText("Το chat ενεργοποιείται από τις ρυθμίσεις του plugin.", "Chat is enabled in the plugin settings.")}</p></div>
        </aside>
      </div>
      <p class="lt-footer" id="lt-status" aria-live="polite"></p>
    </section>`
  const el = selector => rootEl.querySelector(selector)
  const titleEl = el('.lt-title')
  const currentEl = el('#lt-current')
  const currentMetaEl = el('#lt-current-meta')
  const videoEl = el('#lt-video')
  const schedulePanel = el('.lt-epg')
  const listEl = el('#lt-queue')
  const scheduleMsgEl = el('#lt-schedule-message')
  const statusEl = el('#lt-status')
  const badge = el('.lt-badge')
  const soundBtn = el('#lt-sound')
  const chatBody = el('#lt-chat-body')
  const chatPanel = el('#lt-chat')
  const chatToggle = el('#lt-chat-toggle')
  const embedToggle = el('#lt-embed-toggle')
  const embedPanel = el('#lt-embed-panel')
  const embedCode = el('#lt-embed-code')
  const embedCopy = el('#lt-embed-copy')
  const embedFeedback = el('#lt-embed-feedback')
  const homepageCode = el('#lt-homepage-code')
  const homepageCopy = el('#lt-homepage-copy')
  const homepageFeedback = el('#lt-homepage-feedback')
  const layoutEl = el('.lt-layout')
  let activeUUID = null
  let soundEnabled = false
  let isLive = false
  let player = null
  let playerToken = 0
  let sdkPromise = null
  let chatAnchor = null
  let active = true
  let requestBusy = false
  let tickTimer = null
  let boundaryTimer = null
  let lastPayload = null
  let lastReceived = 0

  const clock = ms => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const text = (node, value) => { node.textContent = value || '' }
  function expectedOffset () {
    if (!lastPayload || lastPayload.mode !== 'vod') return 0
    const elapsed = lastPayload.elapsedSeconds + (performance.now() - lastReceived) / 1000
    return Math.max(0, Math.min(elapsed, Math.max(0, lastPayload.current.duration - 0.5)))
  }
  function loadSDK () {
    if (sdkPromise) return sdkPromise
    sdkPromise = new Promise(resolve => {
      if (window.PeerTubePlayer) return resolve(window.PeerTubePlayer)
      const script = document.createElement('script')
      script.src = staticBase + '/embed-api/player.min.js'
      script.onload = () => resolve(window.PeerTubePlayer || null)
      script.onerror = () => resolve(null)
      document.head.appendChild(script)
    })
    return sdkPromise
  }
  async function attachPlayer (iframe, token) {
    const PlayerClass = await loadSDK()
    if (!PlayerClass || !active || playerToken !== token || !iframe.isConnected) return
    try {
      const instance = new PlayerClass(iframe)
      await instance.ready
      if (!active || playerToken !== token) return
      player = instance
      await synchronizePlayer()
    } catch { /* iframe may have been replaced before API initialization */ }
  }
  async function synchronizePlayer () {
    if (!player || !lastPayload || lastPayload.mode !== 'vod') return
    const expected = expectedOffset()
    try {
      const actual = await player.getCurrentTime()
      if (Number.isFinite(actual) && Math.abs(actual - expected) > 3.5) {
        await player.seek(expected)
      }
      // Respect browser autoplay policies: if it cannot play, the viewer can press Play.
      if (!(await player.isPlaying())) await player.play().catch(() => {})
    } catch { /* player not ready or navigation underway */ }
  }
  function setVideo (payload, force = false) {
    if (!payload.current) {
      videoEl.replaceChildren(Object.assign(document.createElement('p'), {
        className: 'lt-placeholder', textContent: uiText("Δεν υπάρχουν διαθέσιμα βίντεο.", "No available videos.")
      }))
      activeUUID = null; player = null
      return
    }
    if (!force && payload.current.uuid === activeUUID && (payload.mode === 'live') === isLive) return
    activeUUID = payload.current.uuid
    isLive = payload.mode === 'live'
    player = null
    const token = ++playerToken
    const iframe = document.createElement('iframe')
    iframe.title = payload.current.name
    iframe.allow = 'autoplay; fullscreen; picture-in-picture'
    iframe.allowFullscreen = true
    iframe.referrerPolicy = 'strict-origin-when-cross-origin'
    const start = payload.mode === 'vod' ? Math.floor(expectedOffset()) : 0
    // Native embed API and native PeerTube transcoded media: no second streaming service.
    const params = new URLSearchParams({ autoplay: '1', muted: soundEnabled ? '0' : '1', controls: '1',
      api: '1', start: String(start), warningTitle: '0' })
    iframe.src = '/videos/embed/' + encodeURIComponent(activeUUID) + '?' + params.toString()
    videoEl.replaceChildren(iframe)
    void attachPlayer(iframe, token)
  }
  soundBtn.addEventListener('click', () => {
    // Never call setVideo() here: replacing the iframe reloads the video.
    if (enableSoundInEmbed(videoEl, soundBtn)) soundEnabled = true
  })
  // The generator uses the current PeerTube origin even inside an iframe.
  // Displaying or copying the snippet never changes the playing media.
  embedToggle?.addEventListener?.('click', () => {
    embedPanel.hidden = !embedPanel.hidden
    embedToggle.setAttribute('aria-expanded', String(!embedPanel.hidden))
    if (!embedPanel.hidden) {
      embedCode.value = generateEmbedCode(window.location.origin, routerBase)
      homepageCode.value = generateHomepageTag()
      embedFeedback.textContent = ''
      homepageFeedback.textContent = ''
    }
  })
  embedCopy?.addEventListener?.('click', async () => {
    if (!embedCode.value) return
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await globalThis.navigator.clipboard.writeText(embedCode.value)
      embedFeedback.textContent = uiText('Αντιγράφηκε!', 'Copied!')
    } catch {
      embedCode.focus()
      embedCode.select()
      embedFeedback.textContent = uiText('Επίλεξε τον κώδικα και αντέγραψέ τον.', 'Select the code and copy it.')
    }
  })
  homepageCopy?.addEventListener?.('click', async () => {
    if (!homepageCode.value) return
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await globalThis.navigator.clipboard.writeText(homepageCode.value)
      homepageFeedback.textContent = uiText('Αντιγράφηκε!', 'Copied!')
    } catch {
      homepageCode.focus()
      homepageCode.select()
      homepageFeedback.textContent = uiText('Επίλεξε το tag και αντέγραψέ το.', 'Select the tag and copy it.')
    }
  })
  const resizeChat = () => fitChatToPlayer(videoEl, chatPanel, window, embedded)
  chatToggle.addEventListener('click', () => {
    setChatVisibility(chatPanel, layoutEl, chatToggle, chatPanel.hidden)
    if (!chatPanel.hidden) resizeChat()
    // Do not recreate the video or chat iframe: just toggle its visibility.
  })
  const chatResizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(resizeChat)
    : null
  chatResizeObserver?.observe(videoEl)
  window.addEventListener?.('resize', resizeChat)
  resizeChat()
  function renderSchedule (payload) {
    // Never expose undated or stale programme entries during a live broadcast.
    // On the first post-live status, the entire list is rebuilt with new times.
    listEl.replaceChildren()
    if (!setProgrammeVisibility(schedulePanel, payload.mode)) {
      text(scheduleMsgEl, '')
      return
    }
    text(scheduleMsgEl, payload.mode === 'empty' ? uiText("Δεν έχει οριστεί πρόγραμμα.", "No programme configured.") : '')
    for (const video of payload.upcoming || []) {
      const li = document.createElement('li')
      const when = document.createElement('time')
      when.dateTime = new Date(video.startsAt).toISOString()
      text(when, clock(video.startsAt))
      const { content, label } = createEPGEntry(video, video.resumed ? uiText("Συνέχεια · ", "Resuming · ") + video.name : video.name)
      const duration = document.createElement('small')
      text(duration, ` · ${Math.ceil(video.duration / 60)}′`)
      label.appendChild(duration)
      li.append(when, content)
      listEl.appendChild(li)
    }
  }
  function updateChat (anchor) {
    if (chatAnchor === anchor) return
    chatAnchor = anchor
    if (!anchor) return
    const iframe = document.createElement('iframe')
    iframe.title = uiText("Συζήτηση της ροής", "Channel chat")
    iframe.loading = 'lazy'
    iframe.referrerPolicy = 'same-origin'
    iframe.src = '/plugins/livechat/router/webchat/room/' + encodeURIComponent(anchor)
    chatBody.replaceChildren(iframe)
  }
  function scheduleBoundaryUpdate (payload) {
    clearTimeout(boundaryTimer)
    boundaryTimer = null
    if (payload.mode !== 'vod' || !Number.isFinite(payload.endsAt)) return
    // Supplement the ordinary 5-second health poll with an on-boundary poll,
    // so short consecutive spots are not skipped between regular polls.
    const delay = Math.max(150, payload.endsAt - payload.serverTime + 100)
    boundaryTimer = setTimeout(() => { void update() }, delay)
  }
  async function update () {
    if (!active || requestBusy) return
    requestBusy = true
    try {
      const response = await fetch(routerBase + '/status', { cache: 'no-store' })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      const payload = await response.json()
      if (!active || !rootEl.isConnected) return
      lastPayload = payload
      lastReceived = performance.now()
      text(titleEl, payload.title || 'Linear TV')
      if (!embedded) document.title = (payload.title || 'Linear TV') + ' — PeerTube'
      badge.hidden = payload.mode !== 'live'
      text(currentEl, (payload.interstitial ? uiText("Σποτ · ", "Spot · ") : '') + (payload.current?.name || uiText("Χωρίς πρόγραμμα", "No programme")))
      text(currentMetaEl, payload.mode === 'live' ? uiText("Ζωντανή μετάδοση", "Live broadcast")
        : payload.interstitial ? `${uiText('Ενδιάμεσο σποτ · έως ', 'Interstitial spot · until ')}${clock(payload.endsAt)}`
          : payload.mode === 'vod' ? `${uiText('Έως ', 'Until ')}${clock(payload.endsAt)} · ${payload.current.channelName}` : '')
      setVideo(payload)
      scheduleBoundaryUpdate(payload)
      renderSchedule(payload)
      updateChat(payload.chatAnchor)
      text(statusEl, payload.healthy ? '' : uiText("Προσωρινό πρόβλημα ενημέρωσης πηγών. Εμφανίζεται το τελευταίο διαθέσιμο πρόγραμμα.", "Source update temporarily unavailable. Showing the last known programme."))
      await synchronizePlayer()
    } catch {
      text(statusEl, uiText("Δεν ήταν δυνατή η ανάκτηση του προγράμματος. Νέα προσπάθεια αυτόματα.", "Unable to retrieve the programme. Retrying automatically."))
    } finally { requestBusy = false }
  }
  void update()
  tickTimer = setInterval(() => {
    if (!rootEl.isConnected) {
      active = false
      clearInterval(tickTimer)
      clearTimeout(boundaryTimer)
      chatResizeObserver?.disconnect()
      window.removeEventListener?.('resize', resizeChat)
      return
    }
    void update()
  }, 5000)
}
export { register, mountLinearTV, enableSoundInEmbed, addWatchMenuLink, createVideoWatchLink, fitChatToPlayer, setChatVisibility, createEPGEntry, setProgrammeVisibility, uiText, generateEmbedCode, generateHomepageTag }
