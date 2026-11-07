'use strict'

// Shared renderer for the supported plugin route and the instance Settings tab.
function mountProgramme (rootEl, peertubeHelpers) {
      rootEl.innerHTML = `
        <section class="lt-admin" aria-label="Διαχείριση τηλεοπτικού προγράμματος">
          <header class="lt-admin-header"><div><h1>Προγραμματισμός TV</h1>
            <p>Η αλλαγή της ουράς δεν επηρεάζει το βίντεο που ήδη παίζει.</p></div>
            <a href="/p/tv" target="_blank" rel="noopener">Προβολή Watch</a></header>
          <p class="lt-admin-notice" id="lt-admin-message" role="status" aria-live="polite"></p>
          <section class="lt-admin-card"><h2>Τώρα παίζει</h2><div id="lt-admin-current"></div>
            <div id="lt-admin-active"></div></section>
          <section class="lt-admin-card"><h2>Τρέχουσα playlist — πλήρης επεξεργασία</h2>
            <p>Μετακίνησε, αφαίρεσε ή πρόσθεσε βίντεο. Όσα έχουν ήδη παίξει, ή βρίσκονται πριν από το τρέχον,
              αλλάζουν μόνο στον <strong>επόμενο κύκλο</strong>. Οι αλλαγές στα επόμενα ισχύουν αμέσως,
              χωρίς διακοπή ή μετακίνηση της αναπαραγωγής. Το βίντεο που παίζει παραμένει μέχρι να τελειώσει.</p>
            <ol id="lt-admin-queue" class="lt-admin-queue"></ol>
            <label for="lt-admin-current-search">Προσθήκη δημόσιου βίντεο στην τρέχουσα playlist</label>
            <input id="lt-admin-current-search" placeholder="Αναζήτηση τίτλου βίντεο">
            <p id="lt-admin-current-search-message"></p>
            <div id="lt-admin-current-results" class="lt-admin-library"></div>
            <button type="button" id="lt-admin-order-save" disabled>Αποθήκευση αλλαγών playlist</button></section>
          <section class="lt-admin-card"><h2>Ενδιάμεσα σποτ</h2>
            <p>Τα σποτ παίζουν με τη σειρά τους μετά από κάθε βίντεο, πριν από το επόμενο,
              καθώς και αμέσως μετά το τέλος του live. Δέχονται δημόσια ή μη καταχωρισμένα
              (unlisted) PeerTube βίντεο. Δεν αποτελούν μέρος των κανονικών playlists.</p>
            <ol id="lt-admin-spots" class="lt-admin-queue"></ol>
            <label for="lt-admin-spot-input">UUID ή σύνδεσμος PeerTube σποτ</label>
            <input id="lt-admin-spot-input" placeholder="https://your-peertube.example/w/UUID">
            <button type="button" id="lt-admin-spot-add">Προσθήκη σποτ</button>
            <p id="lt-admin-spots-message" role="status"></p>
            <button type="button" id="lt-admin-spots-save" disabled>Αποθήκευση σποτ</button></section>
          <section class="lt-admin-card"><h2>Επόμενες TV playlists</h2>
            <p>Ξεκινούν διαδοχικά, μόλις ολοκληρωθεί η τρέχουσα playlist.</p>
            <ol id="lt-admin-scheduled" class="lt-admin-queue"></ol>
            <button type="button" id="lt-admin-scheduled-save" disabled>Αποθήκευση σειράς playlists</button></section>
          <section class="lt-admin-card"><h2>Αποθηκευμένες TV playlists</h2>
            <div id="lt-admin-saved"></div></section>
          <section class="lt-admin-card"><h2>Δημιουργία νέας TV playlist</h2>
            <label for="lt-admin-name">Όνομα playlist</label>
            <input id="lt-admin-name" maxlength="100" placeholder="π.χ. Απογευματινό πρόγραμμα">
            <label for="lt-admin-search">Αναζήτηση δημόσιων βίντεο στις επιλεγμένες πηγές</label>
            <input id="lt-admin-search" placeholder="Τίτλος βίντεο">
            <p id="lt-admin-search-message"></p>
            <div id="lt-admin-results" class="lt-admin-library"></div>
            <h3>Βίντεο νέας playlist</h3><ol id="lt-admin-draft" class="lt-admin-queue"></ol>
            <button type="button" id="lt-admin-create" disabled>Αποθήκευση νέας playlist</button>
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
      const stamp = ts => ts === null || !Number.isFinite(ts) ? 'Μετά το live / υπό υπολογισμό'
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
          if (options.remove) actions.appendChild(button('Αφαίρεση', () => options.remove(item, index),
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
          notice('Αποθηκεύτηκε. Η αναπαραγωγή συνεχίζεται χωρίς επανεκκίνηση.')
          render()
          return true
        } catch (err) {
          notice(err.message + ' — ανανέωσε τα στοιχεία.', true)
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
          if (id === currentUuid) prefix = '▶ Τώρα παίζει · '
          else if (played.has(id)) prefix = '✓ Προβλήθηκε · '
          else if (i < currentIndex) prefix = '↺ Επόμενος κύκλος · '
          else prefix = '→ Ακολουθεί · '
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
          ? 'Κατά τη διάρκεια live δεν τροποποιείται η τρέχουσα playlist.'
          : 'Δεν υπάρχουν διαθέσιμα βίντεο.'))
        renderCurrentLibrary()
      }
      function renderCurrentLibrary () {
        els.currentResults.replaceChildren()
        for (const item of currentLibrary) {
          const row = document.createElement('div')
          row.className = 'lt-admin-row'
          row.appendChild(textNode('span', `${item.name} · ${item.channelName} · ${Math.ceil(item.duration / 60)}′`))
          const alreadyAdded = cycleOrder.includes(item.uuid)
          row.appendChild(button(alreadyAdded ? 'Προστέθηκε' : 'Προσθήκη', () => {
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
        if (!items.length) els.spots.appendChild(textNode('li', 'Δεν έχουν οριστεί ενδιάμεσα σποτ.'))
        els.spotsSave.disabled = !spotsDirty || data.interstitial
        els.spotsMessage.textContent = data.interstitial
          ? 'Παίζει σποτ. Η αλλαγή επιτρέπεται μόλις ολοκληρωθεί.'
          : items.length + ' σποτ · διάρκεια διαλείμματος: ' + duration(items) + '′'
      }
      function renderScheduled () {
        const map = new Map(data.pending.map(x => [x.id, x]))
        const items = pendingOrder.map(id => map.get(id)).filter(Boolean)
        buildOrderList(els.scheduled, items.map(x => ({ ...x, name: x.name + ' — ' + x.count +
          ' βίντεο · έναρξη: ' + stamp(x.startsAt) })), (from, to) => {
          if (move(pendingOrder, from, to)) { scheduledDirty = true; renderScheduled() }
        }, { remove: item => mutate('/schedule/' + encodeURIComponent(item.id), 'DELETE', {}) })
        els.scheduledSave.disabled = !scheduledDirty
        if (!items.length) els.scheduled.appendChild(textNode('li', 'Δεν υπάρχουν επόμενες playlists.'))
      }
      function renderSaved () {
        els.saved.replaceChildren()
        for (const item of data.playlists) {
          const div = document.createElement('div')
          div.className = 'lt-admin-row'
          div.appendChild(textNode('span', `${item.name} — ${item.items.length} βίντεο · ${duration(item.items)}′`))
          const actions = document.createElement('div')
          actions.className = 'lt-admin-actions'
          actions.append(button('Προσθήκη μετά την τρέχουσα', () => mutate('/schedule', 'POST', { playlistId: item.id })),
            button('Διαγραφή', () => {
              if (window.confirm('Να διαγραφεί η αποθηκευμένη playlist;')) {
                void mutate('/playlists/' + encodeURIComponent(item.id), 'DELETE', {})
              }
            }))
          div.appendChild(actions)
          els.saved.appendChild(div)
        }
        if (!data.playlists.length) els.saved.appendChild(textNode('p', 'Δεν υπάρχουν αποθηκευμένες playlists.'))
      }
      function renderDraft () {
        buildOrderList(els.draft, draft, (from, to) => { if (move(draft, from, to)) renderDraft() },
          { remove: item => { draft = draft.filter(v => v.uuid !== item.uuid); renderDraft() } })
        els.create.disabled = !draft.length || !els.name.value.trim()
        if (!draft.length) els.draft.appendChild(textNode('li', 'Διάλεξε βίντεο από την αναζήτηση.'))
        renderLibrary()
      }
      function renderLibrary () {
        els.library.replaceChildren()
        for (const item of library) {
          const row = document.createElement('div')
          row.className = 'lt-admin-row'
          row.appendChild(textNode('span', `${item.name} · ${item.channelName} · ${Math.ceil(item.duration / 60)}′`))
          row.appendChild(button(draft.some(v => v.uuid === item.uuid) ? 'Προστέθηκε' : 'Προσθήκη',
            () => { if (!draft.some(v => v.uuid === item.uuid) && draft.length < 100) { draft.push(item); renderDraft() } },
            draft.some(v => v.uuid === item.uuid) || draft.length >= 100))
          els.library.appendChild(row)
        }
      }
      function render () {
        if (!data) return
        els.current.textContent = (data.interstitial ? 'Σποτ · ' : '') + (data.current?.name || 'Χωρίς πρόγραμμα')
        els.active.textContent = `${data.active.name} · ${data.live ? 'LIVE' : data.interstitial ? 'SPOT' : 'VOD'}${data.currentEndsAt === null ? '' : ' · ολοκλήρωση: ' + stamp(data.currentEndsAt)}`
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
        } catch (err) { notice('Δεν ήταν δυνατή η φόρτωση: ' + err.message, true) }
      }
      async function search () {
        try {
          const term = els.search.value.trim()
          els.searchMessage.textContent = 'Αναζήτηση…'
          const result = await api('/library?search=' + encodeURIComponent(term))
          if (!active || term !== els.search.value.trim()) return
          library = result.items || []
          els.searchMessage.textContent = library.length + ' διαθέσιμα δημόσια βίντεο'
          renderLibrary()
        } catch (err) { els.searchMessage.textContent = 'Σφάλμα αναζήτησης: ' + err.message }
      }
      function addSpotInput () {
        const input = els.spotInput.value.trim()
        const found = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
        if (!found) { els.spotsMessage.textContent = 'Χρειάζεται πλήρες UUID βίντεο.'; return }
        const uuid = found[0].toLowerCase()
        if (spotOrder.includes(uuid)) { els.spotsMessage.textContent = 'Το σποτ υπάρχει ήδη.'; return }
        if (spotOrder.length >= 20) { els.spotsMessage.textContent = 'Μέγιστο 20 σποτ.'; return }
        spotOrder.push(uuid)
        spotLookup.set(uuid, { uuid, name: 'Νέο σποτ · ' + uuid, duration: 0 })
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
          els.currentSearchMessage.textContent = 'Αναζήτηση…'
          const result = await api('/library?search=' + encodeURIComponent(term))
          if (!active || term !== els.currentSearch.value.trim()) return
          currentLibrary = result.items || []
          els.currentSearchMessage.textContent = currentLibrary.length + ' διαθέσιμα δημόσια βίντεο'
          renderCurrentLibrary()
        } catch (err) { els.currentSearchMessage.textContent = 'Σφάλμα αναζήτησης: ' + err.message }
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
    title: 'TV — Προγραμματισμός',
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
      tab.textContent = 'Προγραμματισμός TV'
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

export { register, mountProgramme, TV_SETTINGS_URL }
