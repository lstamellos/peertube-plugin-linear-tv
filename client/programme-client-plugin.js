'use strict'

// Shared renderer for the supported plugin route and the instance Settings tab.
// Match the PeerTube document language. Tests without a document language retain
// the original Greek captions; non-Greek installations receive English UI.
function uiText (el, en) {
  const language = typeof document === 'undefined' ? 'el' : (document.documentElement?.lang || 'el')
  return /^el(?:[-_]|$)/i.test(language) ? el : en
}

function mountProgramme (rootEl, peertubeHelpers) {
      rootEl.innerHTML = `
        <section class="lt-admin" aria-label="${uiText("Διαχείριση τηλεοπτικού προγράμματος", "TV programme management")}">
          <header class="lt-admin-header"><div><h1>${uiText("Προγραμματισμός TV", "TV programme")}</h1>
            <p>${uiText("Η αλλαγή της ουράς δεν επηρεάζει το βίντεο που ήδη παίζει.", "Editing the queue does not interrupt the on-air video.")}</p></div>
            <a href="/p/tv" target="_blank" rel="noopener">${uiText("Προβολή Watch", "Open Watch")}</a></header>
          <p class="lt-admin-notice" id="lt-admin-message" role="status" aria-live="polite"></p>
          <section class="lt-admin-card"><h2>${uiText("Τώρα παίζει", "Now playing")}</h2><div id="lt-admin-current"></div>
            <div id="lt-admin-active"></div></section>
          <section class="lt-admin-card"><h2>${uiText("Τρέχουσα playlist — πλήρης επεξεργασία", "Current playlist — full editor")}</h2>
            <p>${uiText("Μετακίνησε, αφαίρεσε ή πρόσθεσε βίντεο. Όσα έχουν ήδη παίξει, ή βρίσκονται πριν από το τρέχον, αλλάζουν μόνο στον <strong>επόμενο κύκλο</strong>. Οι αλλαγές στα επόμενα ισχύουν αμέσως, χωρίς διακοπή ή μετακίνηση της αναπαραγωγής. Το βίντεο που παίζει παραμένει μέχρι να τελειώσει.", "Reorder, remove or add videos. Already played items, or items before the current one, change only in the <strong>next cycle</strong>. Upcoming items change immediately without seeking or interrupting playback; the playing video remains until it ends.")}</p>
            <ol id="lt-admin-queue" class="lt-admin-queue"></ol>
            <label for="lt-admin-current-search">${uiText("Προσθήκη δημόσιου βίντεο στην τρέχουσα playlist", "Add a public video to the current playlist")}</label>
            <input id="lt-admin-current-search" placeholder="${uiText("Αναζήτηση τίτλου βίντεο", "Search video titles")}">
            <p id="lt-admin-current-search-message"></p>
            <div id="lt-admin-current-results" class="lt-admin-library"></div>
            <button type="button" id="lt-admin-order-save" disabled>${uiText("Αποθήκευση αλλαγών playlist", "Save playlist changes")}</button></section>
          <section class="lt-admin-card"><h2>${uiText("Ενδιάμεσα σποτ", "Interstitial spots")}</h2>
            <p>${uiText("Τα σποτ παίζουν με τη σειρά τους μετά από κάθε βίντεο, πριν από το επόμενο, καθώς και αμέσως μετά το τέλος του live. Δέχονται δημόσια ή μη καταχωρισμένα (unlisted) PeerTube βίντεο. Δεν αποτελούν μέρος των κανονικών playlists.", "Spots play in order between programme videos. After live, only the next spot plays before the interrupted video resumes. Public and unlisted PeerTube videos are supported. Spots are not part of programme playlists.")}</p>
            <ol id="lt-admin-spots" class="lt-admin-queue"></ol>
            <label for="lt-admin-spot-input">${uiText("UUID ή σύνδεσμος PeerTube σποτ", "Spot UUID or PeerTube URL")}</label>
            <input id="lt-admin-spot-input" placeholder="https://your-peertube.example/w/UUID">
            <button type="button" id="lt-admin-spot-add">${uiText("Προσθήκη σποτ", "Add spot")}</button>
            <p id="lt-admin-spots-message" role="status"></p>
            <button type="button" id="lt-admin-spots-save" disabled>${uiText("Αποθήκευση σποτ", "Save spots")}</button></section>
          <section class="lt-admin-card"><h2>${uiText("Επόμενες TV playlists", "Upcoming TV playlists")}</h2>
            <p>${uiText("Ξεκινούν διαδοχικά, μόλις ολοκληρωθεί η τρέχουσα playlist.", "These play in order after the current playlist finishes.")}</p>
            <ol id="lt-admin-scheduled" class="lt-admin-queue"></ol>
            <button type="button" id="lt-admin-scheduled-save" disabled>${uiText("Αποθήκευση σειράς playlists", "Save playlist order")}</button></section>
          <section class="lt-admin-card"><h2>${uiText("Αποθηκευμένες TV playlists", "Saved TV playlists")}</h2>
            <div id="lt-admin-saved"></div></section>
          <section class="lt-admin-card"><h2>${uiText("Δημιουργία νέας TV playlist", "Create a TV playlist")}</h2>
            <label for="lt-admin-name">${uiText("Όνομα playlist", "Playlist name")}</label>
            <input id="lt-admin-name" maxlength="100" placeholder="${uiText("π.χ. Απογευματινό πρόγραμμα", "e.g. Afternoon programme")}">
            <label for="lt-admin-search">${uiText("Αναζήτηση δημόσιων βίντεο στις επιλεγμένες πηγές", "Search public videos from configured sources")}</label>
            <input id="lt-admin-search" placeholder="${uiText("Τίτλος βίντεο", "Video title")}">
            <p id="lt-admin-search-message"></p>
            <div id="lt-admin-results" class="lt-admin-library"></div>
            <h3>${uiText("Βίντεο νέας playlist", "Videos in new playlist")}</h3><ol id="lt-admin-draft" class="lt-admin-queue"></ol>
            <button type="button" id="lt-admin-create" disabled>${uiText("Αποθήκευση νέας playlist", "Save new playlist")}</button>
          </section>
        </section>`
      const $ = sel => rootEl.querySelector(sel)
      const base = peertubeHelpers.getBaseRouterRoute() + '/admin'
      const els = {
        message: $('#lt-admin-message'), current: $('#lt-admin-current'), active: $('#lt-admin-active'),
        queue: $('#lt-admin-queue'), queueSave: $('#lt-admin-order-save'),
        currentSearch: $('#lt-admin-current-search'), currentResults: $('#lt-admin-current-results'),
        currentSearchMessage: $('#lt-admin-current-search-message'),
        scheduled: $('#lt-admin-scheduled'), scheduledSave: $('#lt-admin-scheduled-save'),
        saved: $('#lt-admin-saved'), library: $('#lt-admin-results'), draft: $('#lt-admin-draft'),
        search: $('#lt-admin-search'), searchMessage: $('#lt-admin-search-message'),
        name: $('#lt-admin-name'), create: $('#lt-admin-create'),
        spots: $('#lt-admin-spots'), spotInput: $('#lt-admin-spot-input'),
        spotAdd: $('#lt-admin-spot-add'), spotsSave: $('#lt-admin-spots-save'),
        spotsMessage: $('#lt-admin-spots-message')
      }
      let data = null
      let cycleOrder = []
      let cycleLookup = new Map()
      let currentLibrary = []
      let pendingOrder = []
      let draft = []
      let library = []
      let isDirty = false
      let scheduledDirty = false
      let spotsDirty = false
      let spotOrder = []
      let spotLookup = new Map()
      let active = true
      let searchTimer
      const stamp = ts => ts === null || !Number.isFinite(ts) ? uiText("Μετά το live / υπό υπολογισμό", "After live / calculating")
        : new Date(ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
      const duration = items => Math.ceil(items.reduce((sum, item) => sum + item.duration, 0) / 60)
      const notice = (message, isError = false) => {
        els.message.textContent = message
        els.message.classList.toggle('lt-admin-error', isError)
      }
      function button (caption, handler, disabled = false) {
        const b = document.createElement('button')
        b.type = 'button'
        b.textContent = caption
        b.disabled = disabled
        b.addEventListener('click', handler)
        return b
      }
      function textNode (tag, content) {
        const node = document.createElement(tag)
        node.textContent = content
        return node
      }
      function move (arr, from, to) {
        if (to < 0 || to >= arr.length || from === to) return false
        arr.splice(to, 0, arr.splice(from, 1)[0])
        return true
      }
      function buildOrderList (element, items, onMove, options = {}) {
        element.replaceChildren()
        items.forEach((item, index) => {
          const li = document.createElement('li')
          li.draggable = true
          li.dataset.id = item.uuid || item.id
          li.appendChild(textNode('span', item.name + (item.duration != null ? ` (${Math.ceil(item.duration / 60)}′)` : '')))
          const actions = document.createElement('div')
          actions.className = 'lt-admin-actions'
          li.appendChild(actions)
          actions.appendChild(button('↑', () => onMove(index, index - 1), index === 0 || options.disabled))
          actions.appendChild(button('↓', () => onMove(index, index + 1), index === items.length - 1 || options.disabled))
          if (options.remove) actions.appendChild(button(uiText("Αφαίρεση", "Remove"), () => options.remove(item, index),
            !!options.disabled || !!options.removeDisabled?.(item, index)))
          li.addEventListener('dragstart', event => {
            if (options.disabled) { event.preventDefault(); return }
            event.dataTransfer.setData('text/plain', String(index))
            event.dataTransfer.effectAllowed = 'move'
          })
          li.addEventListener('dragover', event => { if (!options.disabled) event.preventDefault() })
          li.addEventListener('drop', event => {
            event.preventDefault()
            if (options.disabled) return
            const from = Number(event.dataTransfer.getData('text/plain'))
            if (Number.isInteger(from)) onMove(from, index)
          })
          element.appendChild(li)
        })
      }
      async function api (path, method = 'GET', body) {
        const headers = { ...(peertubeHelpers.getAuthHeader() || {}) }
        if (body !== undefined) headers['Content-Type'] = 'application/json'
        const response = await fetch(base + path, { method, headers,
          body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`)
        return result
      }
      async function mutate (path, method, body) {
        if (!data) return
        try {
          const result = await api(path, method, { ...body, revision: data.revision })
          data = result
          isDirty = false
          scheduledDirty = false
          spotsDirty = false
          notice(uiText("Αποθηκεύτηκε. Η αναπαραγωγή συνεχίζεται χωρίς επανεκκίνηση.", "Saved. Playback continues without restarting."))
          render()
          return true
        } catch (err) {
          notice(err.message + uiText(" — ανανέωσε τα στοιχεία.", " — refresh the data."), true)
          await reload()
          return false
        }
      }
      function renderQueue () {
        const currentUuid = data.cycle?.currentUuid
        const played = new Set(data.cycle?.playedUuids || [])
        const currentIndex = cycleOrder.indexOf(currentUuid)
        const items = cycleOrder.map((id, i) => {
          const v = cycleLookup.get(id)
          if (!v) return null
          let prefix
          if (id === currentUuid) prefix = uiText("▶ Τώρα παίζει · ", "▶ Now playing · ")
          else if (played.has(id)) prefix = uiText("✓ Προβλήθηκε · ", "✓ Played · ")
          else if (i < currentIndex) prefix = uiText("↺ Επόμενος κύκλος · ", "↺ Next cycle · ")
          else prefix = uiText("→ Ακολουθεί · ", "→ Upcoming · ")
          return { ...v, name: prefix + v.name }
        }).filter(Boolean)
        buildOrderList(els.queue, items, (from, to) => {
          if (move(cycleOrder, from, to)) { isDirty = true; renderQueue() }
        }, {
          disabled: data.live,
          removeDisabled: item => item.uuid === currentUuid || cycleOrder.length <= 1,
          remove: (item, index) => {
            cycleOrder.splice(index, 1)
            isDirty = true
            renderQueue()
          }
        })
        els.queueSave.disabled = data.live || !isDirty || !cycleOrder.length
        if (!items.length) els.queue.appendChild(textNode('li', data.live
          ? uiText("Κατά τη διάρκεια live δεν τροποποιείται η τρέχουσα playlist.", "The current playlist cannot be edited during live.")
          : uiText("Δεν υπάρχουν διαθέσιμα βίντεο.", "No available videos.")))
        renderCurrentLibrary()
      }
      function renderCurrentLibrary () {
        els.currentResults.replaceChildren()
        for (const item of currentLibrary) {
          const row = document.createElement('div')
          row.className = 'lt-admin-row'
          row.appendChild(textNode('span', `${item.name} · ${item.channelName} · ${Math.ceil(item.duration / 60)}′`))
          const alreadyAdded = cycleOrder.includes(item.uuid)
          row.appendChild(button(alreadyAdded ? uiText("Προστέθηκε", "Added") : uiText("Προσθήκη", "Add"), () => {
            if (cycleOrder.includes(item.uuid) || cycleOrder.length >= 100 || data.live) return
            cycleLookup.set(item.uuid, item)
            cycleOrder.push(item.uuid)
            isDirty = true
            renderQueue()
          }, alreadyAdded || cycleOrder.length >= 100 || data.live))
          els.currentResults.appendChild(row)
        }
      }
      function renderSpots () {
        const items = spotOrder.map(uuid => spotLookup.get(uuid)).filter(Boolean)
        buildOrderList(els.spots, items, (from, to) => {
          if (move(spotOrder, from, to)) { spotsDirty = true; renderSpots() }
        }, {
          remove: (_, index) => { spotOrder.splice(index, 1); spotsDirty = true; renderSpots() }
        })
        if (!items.length) els.spots.appendChild(textNode('li', uiText("Δεν έχουν οριστεί ενδιάμεσα σποτ.", "No interstitial spots configured.")))
        els.spotsSave.disabled = !spotsDirty || data.interstitial
        els.spotsMessage.textContent = data.interstitial
          ? uiText("Παίζει σποτ. Η αλλαγή επιτρέπεται μόλις ολοκληρωθεί.", "A spot is playing. Changes are allowed after it finishes.")
          : items.length + uiText(" σποτ · διάρκεια διαλείμματος: ", " spots · break duration: ") + duration(items) + '′'
      }
      function renderScheduled () {
        const map = new Map(data.pending.map(x => [x.id, x]))
        const items = pendingOrder.map(id => map.get(id)).filter(Boolean)
        buildOrderList(els.scheduled, items.map(x => ({ ...x, name: x.name + ' — ' + x.count +
          uiText(" βίντεο · έναρξη: ", " videos · starts: ") + stamp(x.startsAt) })), (from, to) => {
          if (move(pendingOrder, from, to)) { scheduledDirty = true; renderScheduled() }
        }, { remove: item => mutate('/schedule/' + encodeURIComponent(item.id), 'DELETE', {}) })
        els.scheduledSave.disabled = !scheduledDirty
        if (!items.length) els.scheduled.appendChild(textNode('li', uiText("Δεν υπάρχουν επόμενες playlists.", "No upcoming playlists.")))
      }
      function renderSaved () {
        els.saved.replaceChildren()
        for (const item of data.playlists) {
          const div = document.createElement('div')
          div.className = 'lt-admin-row'
          div.appendChild(textNode('span', `${item.name} — ${item.items.length} ${uiText("βίντεο · ", "videos · ")}${duration(item.items)}′`))
          const actions = document.createElement('div')
          actions.className = 'lt-admin-actions'
          actions.append(button(uiText("Προσθήκη μετά την τρέχουσα", "Schedule after current"), () => mutate('/schedule', 'POST', { playlistId: item.id })),
            button(uiText("Διαγραφή", "Delete"), () => {
              if (window.confirm(uiText("Να διαγραφεί η αποθηκευμένη playlist;", "Delete this saved playlist?"))) {
                void mutate('/playlists/' + encodeURIComponent(item.id), 'DELETE', {})
              }
            }))
          div.appendChild(actions)
          els.saved.appendChild(div)
        }
        if (!data.playlists.length) els.saved.appendChild(textNode('p', uiText("Δεν υπάρχουν αποθηκευμένες playlists.", "No saved playlists.")))
      }
      function renderDraft () {
        buildOrderList(els.draft, draft, (from, to) => { if (move(draft, from, to)) renderDraft() },
          { remove: item => { draft = draft.filter(v => v.uuid !== item.uuid); renderDraft() } })
        els.create.disabled = !draft.length || !els.name.value.trim()
        if (!draft.length) els.draft.appendChild(textNode('li', uiText("Διάλεξε βίντεο από την αναζήτηση.", "Select videos from the search results.")))
        renderLibrary()
      }
      function renderLibrary () {
        els.library.replaceChildren()
        for (const item of library) {
          const row = document.createElement('div')
          row.className = 'lt-admin-row'
          row.appendChild(textNode('span', `${item.name} · ${item.channelName} · ${Math.ceil(item.duration / 60)}′`))
          row.appendChild(button(draft.some(v => v.uuid === item.uuid) ? uiText("Προστέθηκε", "Added") : uiText("Προσθήκη", "Add"),
            () => { if (!draft.some(v => v.uuid === item.uuid) && draft.length < 100) { draft.push(item); renderDraft() } },
            draft.some(v => v.uuid === item.uuid) || draft.length >= 100))
          els.library.appendChild(row)
        }
      }
      function render () {
        if (!data) return
        els.current.textContent = (data.interstitial ? uiText("Σποτ · ", "Spot · ") : '') + (data.current?.name || uiText("Χωρίς πρόγραμμα", "No programme"))
        els.active.textContent = `${data.active.type === 'auto' ? uiText('Αυτόματο πρόγραμμα', 'Automatic programme') : data.active.name} · ${data.live ? 'LIVE' : data.interstitial ? 'SPOT' : 'VOD'}${data.currentEndsAt === null ? '' : uiText(" · ολοκλήρωση: ", " · ends: ") + stamp(data.currentEndsAt)}`
        if (!isDirty) {
          const items = data.cycle?.items || data.upcoming
          cycleOrder = items.map(x => x.uuid)
          cycleLookup = new Map(items.map(x => [x.uuid, x]))
        }
        if (!scheduledDirty) pendingOrder = data.pending.map(x => x.id)
        if (!spotsDirty) {
          spotOrder = (data.spots || []).map(x => x.uuid)
          spotLookup = new Map((data.spots || []).map(x => [x.uuid, x]))
        }
        renderQueue(); renderSpots(); renderScheduled(); renderSaved(); renderDraft()
      }
      async function reload () {
        try {
          const newData = await api('/state')
          if (!active || !rootEl.isConnected) return
          data = newData
          render()
          return true
        } catch (err) { notice(uiText("Δεν ήταν δυνατή η φόρτωση: ", "Could not load: ") + err.message, true) }
      }
      async function search () {
        try {
          const term = els.search.value.trim()
          els.searchMessage.textContent = uiText("Αναζήτηση…", "Searching…")
          const result = await api('/library?search=' + encodeURIComponent(term))
          if (!active || term !== els.search.value.trim()) return
          library = result.items || []
          els.searchMessage.textContent = library.length + uiText(" διαθέσιμα δημόσια βίντεο", " available public videos")
          renderLibrary()
        } catch (err) { els.searchMessage.textContent = uiText("Σφάλμα αναζήτησης: ", "Search error: ") + err.message }
      }
      function addSpotInput () {
        const input = els.spotInput.value.trim()
        const found = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
        if (!found) { els.spotsMessage.textContent = uiText("Χρειάζεται πλήρες UUID βίντεο.", "A complete video UUID is required."); return }
        const uuid = found[0].toLowerCase()
        if (spotOrder.includes(uuid)) { els.spotsMessage.textContent = uiText("Το σποτ υπάρχει ήδη.", "This spot is already listed."); return }
        if (spotOrder.length >= 20) { els.spotsMessage.textContent = uiText("Μέγιστο 20 σποτ.", "Maximum 20 spots."); return }
        spotOrder.push(uuid)
        spotLookup.set(uuid, { uuid, name: uiText("Νέο σποτ · ", "New spot · ") + uuid, duration: 0 })
        els.spotInput.value = ''
        spotsDirty = true
        renderSpots()
      }
      els.spotAdd.addEventListener('click', addSpotInput)
      els.spotInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); addSpotInput() }
      })
      els.spotsSave.addEventListener('click', () => {
        void mutate('/spots', 'PUT', { uuids: spotOrder })
      })
      els.queueSave.addEventListener('click', () => { void mutate('/cycle', 'PUT', { uuids: cycleOrder }) })
      els.scheduledSave.addEventListener('click', () => { void mutate('/schedule', 'PUT', { ids: pendingOrder }) })
      els.name.addEventListener('input', renderDraft)
      els.create.addEventListener('click', async () => {
        if (!draft.length || !els.name.value.trim()) return
        const saved = await mutate('/playlists', 'POST', { name: els.name.value, uuids: draft.map(x => x.uuid) })
        if (saved) { draft = []; els.name.value = ''; renderDraft() }
      })
      let currentSearchTimer
      async function searchForCurrent () {
        try {
          const term = els.currentSearch.value.trim()
          els.currentSearchMessage.textContent = uiText("Αναζήτηση…", "Searching…")
          const result = await api('/library?search=' + encodeURIComponent(term))
          if (!active || term !== els.currentSearch.value.trim()) return
          currentLibrary = result.items || []
          els.currentSearchMessage.textContent = currentLibrary.length + uiText(" διαθέσιμα δημόσια βίντεο", " available public videos")
          renderCurrentLibrary()
        } catch (err) { els.currentSearchMessage.textContent = uiText("Σφάλμα αναζήτησης: ", "Search error: ") + err.message }
      }
      els.currentSearch.addEventListener('input', () => {
        clearTimeout(currentSearchTimer)
        currentSearchTimer = setTimeout(() => void searchForCurrent(), 350)
      })
      els.search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => void search(), 350) })
      void reload().then(() => { void search(); void searchForCurrent() })
      const timer = setInterval(() => {
        if (!rootEl.isConnected) { active = false; clearTimeout(searchTimer); clearTimeout(currentSearchTimer); clearInterval(timer); return }
        if (!isDirty && !scheduledDirty && !spotsDirty) void reload()
      }, 15000)
  return () => {
    active = false
    clearTimeout(searchTimer)
    clearTimeout(currentSearchTimer)
    clearInterval(timer)
  }
}

const TV_SETTINGS_PATH = '/admin/settings/config/general'
const TV_SETTINGS_URL = TV_SETTINGS_PATH + '?tv-programme=1'

// PeerTube 8.3's public plugin route API only supports /p/* (and /my-account/p/*).
// We therefore provide a Settings-side tab on an existing supported admin route.
function register ({ registerClientRoute, registerHook, peertubeHelpers, router }) {
  registerClientRoute({
    route: 'tv-programme',
    title: uiText("TV — Προγραμματισμός", "TV — Programme"),
    onMount: ({ rootEl }) => { mountProgramme(rootEl, peertubeHelpers) }
  })

  const tabClass = 'lt-settings-programme-tab'
  let currentPanel = null
  let currentCleanup = null
  let hiddenNodes = []
  let pendingRetry = null
  let sequence = 0

  function clearPanel () {
    if (pendingRetry) { clearTimeout(pendingRetry); pendingRetry = null }
    if (currentCleanup) { currentCleanup(); currentCleanup = null }
    if (currentPanel) { currentPanel.remove(); currentPanel = null }
    for (const [node, previousDisplay] of hiddenNodes) node.style.display = previousDisplay
    hiddenNodes = []
  }

  function isTVTab () {
    const url = new URL(window.location.href)
    return url.pathname === TV_SETTINGS_PATH && url.searchParams.get('tv-programme') === '1'
  }

  function syncTab () {
    const path = window.location.pathname
    const insideSettings = path.startsWith('/admin/settings/config/')
    if (!insideSettings) { clearPanel(); return true }

    const root = document.querySelector('my-admin-config')
    const nav = root?.querySelector('my-lateral-menu ul.ul-unstyle')
    const content = root?.querySelector('.root > .flex-grow-1')
    if (!nav || !content) return false

    let tab = nav.querySelector('.' + tabClass)
    if (!tab) {
      tab = document.createElement('a')
      tab.className = tabClass
      tab.href = TV_SETTINGS_URL
      tab.textContent = uiText("Προγραμματισμός TV", "TV programme")
      tab.addEventListener('click', event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        router.navigateByUrl(TV_SETTINGS_URL)
      })
      const liveLink = nav.querySelector('a[href$="/live"]')
      if (liveLink) liveLink.after(tab)
      else nav.appendChild(tab)
    }
    tab.classList.toggle('active', isTVTab())
    if (isTVTab()) tab.setAttribute('aria-current', 'page')
    else tab.removeAttribute('aria-current')

    if (!isTVTab()) { clearPanel(); return true }
    // Wait for Angular to mount General; the router-outlet alone is not enough.
    if (!content.querySelector('router-outlet') || !content.querySelector('my-admin-config-general')) return false
    if (currentPanel && currentPanel.isConnected && currentPanel.parentNode === content) return true
    clearPanel()
    for (const node of Array.from(content.children)) {
      if (node.tagName === 'ROUTER-OUTLET') continue
      hiddenNodes.push([node, node.style.display])
      node.style.display = 'none'
    }
    currentPanel = document.createElement('div')
    currentPanel.className = 'lt-settings-panel'
    content.appendChild(currentPanel)
    currentCleanup = mountProgramme(currentPanel, peertubeHelpers)
    return true
  }

  function scheduleSync () {
    const request = ++sequence
    if (pendingRetry) { clearTimeout(pendingRetry); pendingRetry = null }
    let attempts = 0
    function check () {
      if (request !== sequence) return
      if (syncTab()) return
      if (++attempts < 15) pendingRetry = setTimeout(check, 100)
    }
    pendingRetry = setTimeout(check, 0)
  }

  registerHook({ target: 'action:router.navigation-end', handler: scheduleSync })
  // Handles a hard refresh directly on the Settings tab too.
  if (typeof window !== 'undefined' && typeof document !== 'undefined') scheduleSync()
}

export { register, mountProgramme, TV_SETTINGS_URL, uiText }
