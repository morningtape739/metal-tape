/* =========================================================================
   THE METAL TAPE — APP MODULE
   Underground metal news ticker. Calls Cloudflare Worker proxy at window.MT.WORKER
   ========================================================================= */
(function () {
  'use strict';

  const WORKER = (window.MT && window.MT.WORKER) || '';
  const WATCHLIST_KEY = 'metalTape_watchlist_v1';
  const USE_LIVE_FEED = false; // Flip to true after Worker is deployed

  // ----------- STATE -----------
  const state = {
    filter: 'ALL',
    genreFilter: 'ALL',
    tierFilter: 'ALL',
    searchOpen: false,
    searchQuery: '',
    aiResponse: null,
    aiLoading: false,
    aiError: null,
    matchedIds: null,
    summaryFor: null,
    summaryText: null,
    summaryLoading: false,
    watchlist: loadWatchlist(),
    watchlistOpen: false,
    watchlistInput: '',
    watchlistFilterMode: false,
    news: [],
  };

  // ----------- MOCK DATA -----------
  const MOCK_NEWS = [
    { id:1, band:'WHITECHAPEL', headline:"DROPS NEW SINGLE 'KIN' — BRUTAL DEATHCORE RETURN", cat:'RELEASE', time:'14M', urgent:true, source:'BLABBERMOUTH', genre:'deathcore', tier:'mainstream', url:'https://blabbermouth.net' },
    { id:2, band:'TRIVIUM', headline:'ANNOUNCES 2026 WORLD TOUR — 47 DATES CONFIRMED', cat:'TOUR', time:'32M', urgent:true, source:'METAL INJECTION', genre:'metalcore', tier:'mainstream', url:'https://metalinjection.net' },
    { id:3, band:'SPIRITBOX', headline:'DOWNLOAD FESTIVAL 2026 — MAIN STAGE LOCKED IN', cat:'FEST', time:'1H', urgent:false, source:'LOUDWIRE', genre:'metalcore', tier:'mainstream', url:'https://loudwire.com' },
    { id:4, band:'DESPISED ICON', headline:'REUNION ALBUM CONFIRMED — FIRST IN 7 YEARS', cat:'RELEASE', time:'2H', urgent:true, source:'BLABBERMOUTH', genre:'deathcore', tier:'mainstream', url:'https://blabbermouth.net' },
    { id:5, band:'DEVILDRIVER', headline:'DEZ FAFARA: NEW LP "DARKER THAN ANYTHING WE\'VE DONE"', cat:'NEWS', time:'3H', urgent:false, source:'METAL HAMMER', genre:'groove metal', tier:'mainstream', url:'https://loudersound.com' },
    { id:6, band:'REVOCATION', headline:'ADDS SECOND NORTH AMERICAN LEG — TICKETS LIVE', cat:'TOUR', time:'4H', urgent:false, source:'METAL INJECTION', genre:'tech death', tier:'mainstream', url:'https://metalinjection.net' },
    { id:7, band:'LORNA SHORE', headline:'CRYPTOPSY TOUR — SUMMER 2026 CO-HEADLINE', cat:'TOUR', time:'5H', urgent:true, source:'BLABBERMOUTH', genre:'deathcore', tier:'mainstream', url:'https://blabbermouth.net' },
    { id:8, band:'KNOCKED LOOSE', headline:'GRAMMY NOMINATION — METAL PERFORMANCE CATEGORY', cat:'NEWS', time:'6H', urgent:true, source:'LOUDWIRE', genre:'hardcore', tier:'mainstream', url:'https://loudwire.com' },
    { id:9, band:'ARCHITECTS', headline:'NEW ALBUM RECORDING WRAPPED — Q2 RELEASE', cat:'RELEASE', time:'7H', urgent:false, source:'KERRANG', genre:'metalcore', tier:'mainstream', url:'https://kerrang.com' },
    { id:10, band:'GOJIRA', headline:'HELLFEST 2026 HEADLINER — SET DETAILS LEAKED', cat:'FEST', time:'8H', urgent:false, source:'METAL INJECTION', genre:'death metal', tier:'mainstream', url:'https://metalinjection.net' },
    { id:11, band:'SLAUGHTER TO PREVAIL', headline:'ALEX TERRIBLE ANNOUNCES SOLO PROJECT', cat:'NEWS', time:'9H', urgent:false, source:'BLABBERMOUTH', genre:'deathcore', tier:'mainstream', url:'https://blabbermouth.net' },
    { id:12, band:'BAD OMENS', headline:'NOAH SEBASTIAN COLLAB WITH POPPY — TEASE DROPS', cat:'RELEASE', time:'10H', urgent:false, source:'LOUDWIRE', genre:'metalcore', tier:'mainstream', url:'https://loudwire.com' },
    { id:13, band:'CARNIFEX', headline:'WORLD IS HELL TOUR — EUROPEAN DATES ADDED', cat:'TOUR', time:'11H', urgent:false, source:'METAL HAMMER', genre:'deathcore', tier:'mainstream', url:'https://loudersound.com' },
    { id:14, band:'FIT FOR AN AUTOPSY', headline:'WILL PUTNEY: PRODUCING NEW SPIRITBOX RECORD', cat:'NEWS', time:'12H', urgent:false, source:'BLABBERMOUTH', genre:'deathcore', tier:'mainstream', url:'https://blabbermouth.net' },
    { id:15, band:'POLARIS', headline:'TRIBUTE ALBUM FOR JESSE BREZINSKI — RELEASE DATE SET', cat:'RELEASE', time:'13H', urgent:true, source:'METAL INJECTION', genre:'metalcore', tier:'mainstream', url:'https://metalinjection.net' },
    { id:16, band:'XENOSIS', headline:'PROLAPSED TWIN ENTOMBMENT — NEW VIDEO PREMIERES', cat:'RELEASE', time:'14H', urgent:false, source:'TECH DEATH METAL', genre:'tech death', tier:'underground', url:'https://technicaldeathmetal.org' },
    { id:17, band:'AETHEREUS', headline:'SOPHOMORE LP "LEIDEN FROST" — TRACK BY TRACK BREAKDOWN', cat:'RELEASE', time:'15H', urgent:false, source:'TECH DEATH METAL', genre:'tech death', tier:'underground', url:'https://technicaldeathmetal.org' },
    { id:18, band:'INFERI', headline:'SUMERIAN HORDES TOUR — SUPPORT FROM ABYSMAL DAWN', cat:'TOUR', time:'16H', urgent:false, source:'TECH DEATH METAL', genre:'tech death', tier:'underground', url:'https://technicaldeathmetal.org' },
    { id:19, band:'DISENTOMB', headline:'AUSTRALIAN SLAM TITANS DROP NEW EP', cat:'RELEASE', time:'17H', urgent:true, source:'NO CLEAN SINGING', genre:'slam', tier:'underground', url:'https://nocleansinging.com' },
    { id:20, band:'WORMED', headline:'COSMIC DEATH METAL LEGENDS ANNOUNCE TOUR', cat:'TOUR', time:'18H', urgent:false, source:'TECH DEATH METAL', genre:'tech death', tier:'underground', url:'https://technicaldeathmetal.org' },
    { id:21, band:'GORGUTS', headline:'LUC LEMAY: NEW MATERIAL IN PRODUCTION', cat:'NEWS', time:'19H', urgent:false, source:'DEATH METAL UG', genre:'tech death', tier:'underground', url:'https://deathmetal.org' },
    { id:22, band:'ARCHSPIRE', headline:'BLEED THE FUTURE FOLLOWUP — DEMOS LEAKED', cat:'RELEASE', time:'20H', urgent:true, source:'TECH DEATH METAL', genre:'tech death', tier:'underground', url:'https://technicaldeathmetal.org' },
    { id:23, band:'BEYOND CREATION', headline:'CANADIAN PROG DEATH GIANTS RECORDING NEW LP', cat:'RELEASE', time:'21H', urgent:false, source:'TECH DEATH METAL', genre:'tech death', tier:'underground', url:'https://technicaldeathmetal.org' },
    { id:24, band:'CATTLE DECAPITATION', headline:'TRAVIS RYAN: VOCAL DEMONSTRATION VIDEO', cat:'NEWS', time:'22H', urgent:false, source:'NO CLEAN SINGING', genre:'death metal', tier:'underground', url:'https://nocleansinging.com' },
    { id:25, band:'DEFEATED SANITY', headline:'GERMAN BRUTALITY KINGS RETURN WITH NEW DRUMMER', cat:'NEWS', time:'23H', urgent:false, source:'TECH DEATH METAL', genre:'slam', tier:'underground', url:'https://technicaldeathmetal.org' },
    { id:26, band:'BURIAL IN THE SKY', headline:'CONCEPT ALBUM "NEXT TO NOTHING" REVEALED', cat:'RELEASE', time:'1D', urgent:false, source:'TECH DEATH METAL', genre:'tech death', tier:'underground', url:'https://technicaldeathmetal.org' },
    { id:27, band:'OBSCURA', headline:'GERMAN PROG DEATH MASTERS — US TOUR ANNOUNCED', cat:'TOUR', time:'1D', urgent:true, source:'TECH DEATH METAL', genre:'tech death', tier:'underground', url:'https://technicaldeathmetal.org' },
    { id:28, band:'OCEANO', headline:'FIRST SINGLE IN 4 YEARS DROPS — "DEAD EMPIRE"', cat:'RELEASE', time:'1D', urgent:true, source:'LAMBGOAT', genre:'deathcore', tier:'underground', url:'https://lambgoat.com' },
    { id:29, band:'BRAND OF SACRIFICE', headline:'AUSTRALIAN TOUR ANNOUNCED — FIRST TIME IN 5 YEARS', cat:'TOUR', time:'1D', urgent:false, source:'KERRANG', genre:'deathcore', tier:'mainstream', url:'https://kerrang.com' },
    { id:30, band:'ANGELMAKER', headline:'NEW LP "BLOOD OF MY ENEMY" RELEASE DATE', cat:'RELEASE', time:'1D', urgent:false, source:'METAL INJECTION', genre:'deathcore', tier:'mainstream', url:'https://metalinjection.net' },
    { id:31, band:'PYRREXIA', headline:'NJ DEATH METAL VETS ANNOUNCE COMEBACK ALBUM', cat:'RELEASE', time:'1D', urgent:false, source:'DEATH METAL UG', genre:'death metal', tier:'underground', url:'https://deathmetal.org' },
    { id:32, band:'NECROT', headline:'OAKLAND DEATH SQUAD TOURING WITH GATECREEPER', cat:'TOUR', time:'1D', urgent:false, source:'NO CLEAN SINGING', genre:'death metal', tier:'underground', url:'https://nocleansinging.com' },
    { id:33, band:'ULCERATE', headline:'NZ DISSONANT DEATH GODS RETURN', cat:'RELEASE', time:'2D', urgent:true, source:'NO CLEAN SINGING', genre:'death metal', tier:'underground', url:'https://nocleansinging.com' },
    { id:34, band:'INFANT ANNIHILATOR', headline:'TEASES NEW MATERIAL — RETURN OF DAN WATSON?', cat:'RELEASE', time:'2D', urgent:true, source:'LAMBGOAT', genre:'deathcore', tier:'underground', url:'https://lambgoat.com' },
    { id:35, band:'WAGE WAR', headline:'TOUR WITH SLEEP TOKEN — DATES ANNOUNCED', cat:'TOUR', time:'2D', urgent:true, source:'BLABBERMOUTH', genre:'metalcore', tier:'mainstream', url:'https://blabbermouth.net' },
    { id:36, band:'AUGUST BURNS RED', headline:'CONSTELLATIONS 15TH ANNIVERSARY TOUR', cat:'TOUR', time:'2D', urgent:false, source:'METAL INJECTION', genre:'metalcore', tier:'mainstream', url:'https://metalinjection.net' },
    { id:37, band:'BLOOD INCANTATION', headline:'COSMIC DEATH METAL EXPERIMENTALISTS DROP TEASER', cat:'RELEASE', time:'2D', urgent:true, source:'TECH DEATH METAL', genre:'death metal', tier:'underground', url:'https://technicaldeathmetal.org' },
    { id:38, band:'MESHUGGAH', headline:'SWEDISH METAL GIANTS REVEAL NEW ALBUM CYCLE', cat:'RELEASE', time:'2D', urgent:false, source:'KERRANG', genre:'progressive metal', tier:'mainstream', url:'https://kerrang.com' },
    { id:39, band:'CEPHALIC CARNAGE', headline:'COLORADO GRINDCORE LEGENDS REUNION SHOW', cat:'TOUR', time:'2D', urgent:true, source:'NO CLEAN SINGING', genre:'grindcore', tier:'underground', url:'https://nocleansinging.com' },
    { id:40, band:'PIG DESTROYER', headline:'ANNOUNCES SPLIT EP WITH NAILS', cat:'RELEASE', time:'3D', urgent:true, source:'NO CLEAN SINGING', genre:'grindcore', tier:'underground', url:'https://nocleansinging.com' },
    { id:41, band:'NAILS', headline:'TODD JONES INTERVIEW — NEW MATERIAL IN THE WORKS', cat:'NEWS', time:'3D', urgent:false, source:'LAMBGOAT', genre:'grindcore', tier:'underground', url:'https://lambgoat.com' },
    { id:42, band:'FULL OF HELL', headline:'POWER VIOLENCE GIANTS DROP SURPRISE EP', cat:'RELEASE', time:'3D', urgent:true, source:'NO CLEAN SINGING', genre:'grindcore', tier:'underground', url:'https://nocleansinging.com' },
    { id:43, band:'BABYMETAL', headline:'BLOODYWOOD TOUR — METAL CROSSOVER OF THE YEAR', cat:'TOUR', time:'3D', urgent:true, source:'LOUDWIRE', genre:'kawaii metal', tier:'mainstream', url:'https://loudwire.com' },
    { id:44, band:'ICE NINE KILLS', headline:'NEW HORROR-THEMED LP IN PRODUCTION', cat:'RELEASE', time:'3D', urgent:false, source:'METAL INJECTION', genre:'metalcore', tier:'mainstream', url:'https://metalinjection.net' },
    { id:45, band:'MORTICIAN', headline:'BROOKLYN DEATH/GRIND OG\'S RETURN AFTER 15 YEARS', cat:'RELEASE', time:'3D', urgent:true, source:'DEATH METAL UG', genre:'grindcore', tier:'underground', url:'https://deathmetal.org' },
    { id:46, band:'TURNSTILE', headline:'NEW MATERIAL — GLOW ON FOLLOW-UP DUE 2026', cat:'RELEASE', time:'4D', urgent:false, source:'KERRANG', genre:'hardcore', tier:'mainstream', url:'https://kerrang.com' },
    { id:47, band:'VENOM PRISON', headline:'EUROPEAN TOUR — BRUTALITY ON FULL DISPLAY', cat:'TOUR', time:'4D', urgent:false, source:'METAL HAMMER', genre:'death metal', tier:'mainstream', url:'https://loudersound.com' },
    { id:48, band:'MUNICIPAL WASTE', headline:'CROSSOVER LEGENDS DROP NEW SINGLE', cat:'RELEASE', time:'4D', urgent:false, source:'BLABBERMOUTH', genre:'thrash', tier:'mainstream', url:'https://blabbermouth.net' },
    { id:49, band:'POWER TRIP', headline:'TRIBUTE ALBUM FEATURING METAL ROYALTY ANNOUNCED', cat:'RELEASE', time:'4D', urgent:true, source:'LAMBGOAT', genre:'thrash', tier:'underground', url:'https://lambgoat.com' },
    { id:50, band:'COUNTERPARTS', headline:'BRENDAN MURPHY DISCUSSES NEW MATERIAL', cat:'NEWS', time:'4D', urgent:false, source:'METAL INJECTION', genre:'hardcore', tier:'mainstream', url:'https://metalinjection.net' },
    { id:51, band:'CONVERGE', headline:'JACOB BANNON: BLOODMOON II IN THE WORKS', cat:'RELEASE', time:'4D', urgent:true, source:'NO CLEAN SINGING', genre:'mathcore', tier:'underground', url:'https://nocleansinging.com' },
    { id:52, band:'THE GHOST INSIDE', headline:'NEW ALBUM TITLE & TRACKLIST REVEALED', cat:'RELEASE', time:'5D', urgent:false, source:'KERRANG', genre:'metalcore', tier:'mainstream', url:'https://kerrang.com' },
    { id:53, band:'SUMMONING THE LICH', headline:'TECH DEATH RIPPERS DEBUT FULL-LENGTH', cat:'RELEASE', time:'5D', urgent:true, source:'TECH DEATH METAL', genre:'tech death', tier:'underground', url:'https://technicaldeathmetal.org' },
    { id:54, band:'IRON MAIDEN', headline:'FUTURE PAST WORLD TOUR FINAL LEG ANNOUNCED', cat:'TOUR', time:'5D', urgent:true, source:'METAL HAMMER', genre:'heavy metal', tier:'mainstream', url:'https://loudersound.com' },
    { id:55, band:'SLAYER', headline:'RIOT FEST RETURN — TOM ARAYA HEALTH UPDATE', cat:'NEWS', time:'5D', urgent:true, source:'BLABBERMOUTH', genre:'thrash', tier:'mainstream', url:'https://blabbermouth.net' },
    { id:56, band:'PANTERA', headline:'2026 TOUR DATES — PHIL ANSELMO INTERVIEW', cat:'TOUR', time:'5D', urgent:false, source:'METAL INJECTION', genre:'groove metal', tier:'mainstream', url:'https://metalinjection.net' },
    { id:57, band:'METALLICA', headline:'M72 EXTENDED — ASIA & SOUTH AMERICA DATES', cat:'TOUR', time:'6D', urgent:true, source:'LOUDWIRE', genre:'thrash', tier:'mainstream', url:'https://loudwire.com' },
    { id:58, band:'JUDAS PRIEST', headline:'INVINCIBLE SHIELD ANNIVERSARY EDITION COMING', cat:'RELEASE', time:'6D', urgent:false, source:'KERRANG', genre:'heavy metal', tier:'mainstream', url:'https://kerrang.com' },
    { id:59, band:'ALLEGAEON', headline:'COLORADO TECH DEATH WIZARDS DROP SINGLE', cat:'RELEASE', time:'6D', urgent:false, source:'TECH DEATH METAL', genre:'tech death', tier:'underground', url:'https://technicaldeathmetal.org' },
    { id:60, band:'INGESTED', headline:'UK TOUR ADDS 12 NEW DATES — TICKETS ON SALE', cat:'TOUR', time:'7D', urgent:false, source:'KERRANG', genre:'deathcore', tier:'mainstream', url:'https://kerrang.com' },
    { id:61, band:'VITAL REMAINS', headline:'DEATH METAL VETERANS ANNOUNCE FIRST ALBUM IN 12 YEARS', cat:'RELEASE', time:'7D', urgent:true, source:'DEATH METAL UG', genre:'death metal', tier:'underground', url:'https://deathmetal.org' },
    { id:62, band:'TOMB MOLD', headline:'CANADIAN DEATH METAL UNDERGROUND DROPS NEW MATERIAL', cat:'RELEASE', time:'7D', urgent:false, source:'NO CLEAN SINGING', genre:'death metal', tier:'underground', url:'https://nocleansinging.com' },
    { id:63, band:'GATECREEPER', headline:'ARIZONA DEATH METAL CRUSHERS — TOUR DATES ADDED', cat:'TOUR', time:'8D', urgent:false, source:'NO CLEAN SINGING', genre:'death metal', tier:'underground', url:'https://nocleansinging.com' },
    { id:64, band:'BORN OF OSIRIS', headline:'CELEBRATING 20 YEARS — ANNIVERSARY TOUR ANNOUNCED', cat:'TOUR', time:'8D', urgent:true, source:'METAL INJECTION', genre:'progressive metal', tier:'mainstream', url:'https://metalinjection.net' },
    { id:65, band:'CHELSEA GRIN', headline:'TOM BARBER RETURNS — FIRST SHOWS BACK ANNOUNCED', cat:'TOUR', time:'8D', urgent:true, source:'BLABBERMOUTH', genre:'deathcore', tier:'mainstream', url:'https://blabbermouth.net' },
  ];

  state.news = MOCK_NEWS;

  const TICKER_ITEMS = [
    'WHITECHAPEL DROPS "KIN"', 'TRIVIUM 2026 TOUR ANNOUNCED', 'XENOSIS NEW VIDEO PREMIERES',
    'DESPISED ICON REUNION CONFIRMED', 'LORNA SHORE × CRYPTOPSY SUMMER TOUR',
    'BLOOD INCANTATION COSMIC TEASER', 'KNOCKED LOOSE GRAMMY NOM', 'GOJIRA HEADLINING HELLFEST',
    'PIG DESTROYER × NAILS SPLIT', 'METALLICA M72 ASIA DATES', 'CONVERGE BLOODMOON II',
    'VITAL REMAINS RETURN AFTER 12 YEARS',
  ];

  const CATS = ['ALL', 'TOUR', 'RELEASE', 'FEST', 'NEWS'];

  // ----------- HELPERS -----------
  function loadWatchlist() {
    try { const s = localStorage.getItem(WATCHLIST_KEY); return s ? JSON.parse(s) : []; } catch (e) { return []; }
  }
  function saveWatchlist() {
    try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(state.watchlist)); } catch (e) {}
  }
  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }
  function getFilteredNews() {
    let f = state.news;
    if (state.filter !== 'ALL') f = f.filter(n => n.cat === state.filter);
    if (state.genreFilter !== 'ALL') f = f.filter(n => n.genre === state.genreFilter);
    if (state.tierFilter !== 'ALL') f = f.filter(n => n.tier === state.tierFilter.toLowerCase());
    if (state.watchlistFilterMode && state.watchlist.length > 0) f = f.filter(n => state.watchlist.includes(n.band));
    if (state.matchedIds !== null) f = f.filter(n => state.matchedIds.includes(n.id));
    return f;
  }
  function getAllGenres() {
    const set = new Set(state.news.map(n => n.genre));
    return ['ALL', ...Array.from(set).sort()];
  }
  function getAllBands() {
    return Array.from(new Set(state.news.map(n => n.band))).sort();
  }
  function getWatchlistSuggestions() {
    if (!state.watchlistInput.trim()) return [];
    const q = state.watchlistInput.toUpperCase().trim();
    return getAllBands().filter(b => b.includes(q) && !state.watchlist.includes(b)).slice(0, 6);
  }
  function hasActiveFilters() {
    return state.filter !== 'ALL' || state.genreFilter !== 'ALL' || state.tierFilter !== 'ALL'
      || state.watchlistFilterMode || state.matchedIds !== null;
  }

  // ----------- ACTIONS (exposed via MetalTape global) -----------
  const MetalTape = {
    setFilter(f) { state.filter = f; render(); },
    setGenre(g) { state.genreFilter = g; render(); },
    setTier(t) { state.tierFilter = t; render(); },
    clearFilters() {
      state.filter = 'ALL'; state.genreFilter = 'ALL'; state.tierFilter = 'ALL';
      state.watchlistFilterMode = false; state.matchedIds = null; state.searchQuery = '';
      state.aiResponse = null; state.aiError = null;
      render();
    },
    toggleSearchPanel() { state.searchOpen = !state.searchOpen; state.watchlistOpen = false; render(); setTimeout(() => { const i = document.getElementById('search-input'); if (i) i.focus(); }, 50); },
    toggleWatchlistPanel() { state.watchlistOpen = !state.watchlistOpen; state.searchOpen = false; render(); },
    updateSearchInput(v) { state.searchQuery = v; },
    searchKeydown(e) { if (e.key === 'Enter') MetalTape.runAiSearch(); },
    clearSearch() {
      state.searchQuery = ''; state.aiResponse = null; state.aiError = null; state.matchedIds = null;
      render();
    },
    updateWatchlistInput(v) {
      state.watchlistInput = v;
      const sug = getWatchlistSuggestions();
      // Selectively re-render only suggestions for typing speed
      const wrap = document.getElementById('suggestions-wrap');
      if (wrap) wrap.innerHTML = sug.length === 0 ? '' : `
        <div class="suggestions">
          ${sug.map(b => `
            <div class="suggestion-item" onclick="MetalTape.addBand('${escapeHtml(b)}')">
              <span style="font-size:15px;">${escapeHtml(b)}</span>
              <span class="suggestion-add">+ ADD</span>
            </div>
          `).join('')}
        </div>
      `;
      const addBtn = document.getElementById('add-band-btn');
      if (addBtn) addBtn.style.display = v.trim() ? '' : 'none';
    },
    watchlistKeydown(e) {
      if (e.key === 'Enter' && state.watchlistInput.trim()) MetalTape.addBand(state.watchlistInput);
      if (e.key === 'Escape') { state.watchlistInput = ''; render(); }
    },
    addBand(band) {
      const u = band.toUpperCase().trim();
      if (!u || state.watchlist.includes(u)) return;
      state.watchlist = [...state.watchlist, u];
      state.watchlistInput = '';
      saveWatchlist(); render();
    },
    removeBand(band) {
      state.watchlist = state.watchlist.filter(b => b !== band);
      saveWatchlist(); render();
    },
    toggleWatch(band, e) {
      if (e) e.stopPropagation();
      if (state.watchlist.includes(band)) MetalTape.removeBand(band);
      else MetalTape.addBand(band);
    },
    clearWatchlist() {
      if (confirm('Clear all watched bands?')) { state.watchlist = []; saveWatchlist(); render(); }
    },
    toggleWatchlistFilter() { state.watchlistFilterMode = !state.watchlistFilterMode; render(); },
    openArticle(url, e) {
      if (e) e.stopPropagation();
      if (url && url !== '#') window.open(url, '_blank', 'noopener,noreferrer');
    },
    async runAiSearch() {
      if (!state.searchQuery.trim()) return;
      state.aiLoading = true; state.aiError = null; state.aiResponse = null; state.matchedIds = null;
      render();
      const ctx = state.news.map(n => `ID:${n.id} | ${n.band} (${n.genre}, ${n.tier}) | ${n.cat} | ${n.headline}`).join('\n');
      const prompt = `You are a metal music expert assistant for "The Metal Tape" news ticker.

USER QUERY: "${state.searchQuery}"

AVAILABLE NEWS STORIES:
${ctx}

Analyze the query and find matching stories. Respond ONLY with valid JSON:
{"matchedIds":[array of story ID numbers],"response":"Brief 1-2 sentence answer in metal-appropriate tone"}`;
      try {
        if (!WORKER) throw new Error('Worker URL not set');
        const res = await fetch(WORKER + '/api/brief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            system: 'You are a metal music expert. Respond only with valid JSON. No preamble, no markdown fences.',
          }),
        });
        if (!res.ok) throw new Error('API ' + res.status);
        const data = await res.json();
        const text = (data.content || []).map(c => c.text || '').join('\n').replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(text);
        state.aiResponse = parsed.response;
        state.matchedIds = parsed.matchedIds || [];
      } catch (err) {
        state.aiError = err.message.includes('Worker URL') ? 'Worker not connected. Update window.MT.WORKER in index.html.' : 'Connection severed. Try again.';
      } finally {
        state.aiLoading = false; render();
      }
    },
    async runSummarize(itemId, e) {
      if (e) e.stopPropagation();
      if (state.summaryFor === itemId) {
        state.summaryFor = null; state.summaryText = null; render(); return;
      }
      const item = state.news.find(n => n.id === itemId);
      if (!item) return;
      state.summaryFor = itemId; state.summaryLoading = true; state.summaryText = null;
      render();
      const prompt = `Summarize this metal news in 2-3 sentences with direct, knowledgeable tone:
Band: ${item.band}
Genre: ${item.genre}
Category: ${item.cat}
Headline: ${item.headline}
Source: ${item.source}
Make it up plausibly based on metal context if needed. No preamble.`;
      try {
        if (!WORKER) throw new Error('Worker URL not set');
        const res = await fetch(WORKER + '/api/brief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            system: 'You are a metal music expert. Be direct and knowledgeable.',
          }),
        });
        if (!res.ok) throw new Error('API ' + res.status);
        const data = await res.json();
        state.summaryText = (data.content || []).map(c => c.text || '').join('\n').trim();
      } catch (err) {
        state.summaryText = err.message.includes('Worker URL')
          ? '⛧ Worker not connected. Update window.MT.WORKER in index.html.'
          : '⛧ Could not reach the wire. Try again.';
      } finally {
        state.summaryLoading = false; render();
      }
    },
  };
  window.MetalTape = MetalTape;

  // ----------- ICONS -----------
  const ICONS = {
    skull: '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9h.01"/><path d="M15 9h.01"/><path d="M12 15v.01"/><circle cx="12" cy="11" r="9"/><path d="M9 18v3"/><path d="M15 18v3"/></svg>',
    search: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    heart: f => `<svg width="11" height="11" viewBox="0 0 24 24" fill="${f?'currentColor':'none'}" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    sparkles: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    flame: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    disc: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="8" stroke-linecap="round"/></svg>',
    zap: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    external: '<svg class="external-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  };
  function catIcon(cat) {
    if (cat === 'TOUR' || cat === 'FEST') return ICONS.flame;
    if (cat === 'RELEASE') return ICONS.disc;
    return ICONS.zap;
  }

  // ----------- TEMPLATES -----------
  function tplBarbedWire() {
    const id = 'wire-' + Math.random().toString(36).slice(2, 7);
    return `<div class="barbed-wire"><svg viewBox="0 0 800 24" preserveAspectRatio="none">
      <defs><pattern id="${id}" x="0" y="0" width="40" height="24" patternUnits="userSpaceOnUse">
        <line x1="0" y1="12" x2="40" y2="12" stroke="#3a0000" stroke-width="1.5"/>
        <line x1="20" y1="4" x2="14" y2="20" stroke="#3a0000" stroke-width="1.5"/>
        <line x1="20" y1="4" x2="26" y2="20" stroke="#3a0000" stroke-width="1.5"/>
        <line x1="14" y1="4" x2="20" y2="20" stroke="#3a0000" stroke-width="1.5"/>
        <line x1="26" y1="4" x2="20" y2="20" stroke="#3a0000" stroke-width="1.5"/>
      </pattern></defs>
      <rect width="800" height="24" fill="url(#${id})"/>
    </svg></div>`;
  }

  function tplBloodSplatter(side) {
    if (side === 'left') return `<svg class="blood-splatter" style="top:0;left:0;" width="180" height="120" viewBox="0 0 180 120"><g fill="#8b0000" opacity="0.6"><circle cx="20" cy="15" r="8"/><circle cx="45" cy="8" r="4"/><circle cx="60" cy="25" r="3"/><circle cx="35" cy="35" r="5"/><circle cx="80" cy="18" r="2"/><circle cx="15" cy="50" r="3"/><circle cx="55" cy="55" r="6"/><circle cx="90" cy="40" r="2"/><ellipse cx="30" cy="20" rx="15" ry="3" transform="rotate(25 30 20)"/></g></svg>`;
    return `<svg class="blood-splatter" style="top:0;right:0;" width="200" height="100" viewBox="0 0 200 100"><g fill="#8b0000" opacity="0.5"><circle cx="160" cy="20" r="6"/><circle cx="180" cy="10" r="3"/><circle cx="140" cy="35" r="4"/><circle cx="170" cy="45" r="2"/><circle cx="120" cy="25" r="2"/><circle cx="190" cy="60" r="5"/><ellipse cx="170" cy="30" rx="20" ry="2" transform="rotate(-15 170 30)"/></g></svg>`;
  }

  function tplBloodDrip(x, delay) {
    return `<div style="position:absolute;top:100%;left:${x}%;width:8px;pointer-events:none;z-index:5;"><svg width="8" height="60" viewBox="0 0 8 60"><path d="M 4 0 L 4 40 Q 4 55, 4 58" stroke="#8b0000" stroke-width="3" fill="none" style="stroke-dasharray:60;stroke-dashoffset:60;animation:drip 4s ease-in ${delay}s infinite;"/><circle cx="4" cy="56" r="3" fill="#8b0000" style="animation:dripBall 4s ease-in ${delay}s infinite;"/></svg></div>`;
  }

  function tplDots() {
    return '<span><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></span>';
  }

  function tplMasthead() {
    const wc = state.watchlist.length;
    const t = new Date().toTimeString().split(' ')[0];
    return `<div class="masthead">
      ${tplBloodSplatter('left')}${tplBloodSplatter('right')}
      <div class="masthead-left">
        <div class="skull-icon">${ICONS.skull}</div>
        <div>
          <div class="logo">The Metal Tape</div>
          <div class="tagline">⛧ UNDERGROUND NEWS WIRE ⛧ EST. MMXXVI ⛧</div>
        </div>
      </div>
      <div class="masthead-right">
        <button class="toggle-btn ${state.watchlistOpen?'active-watchlist':''}" onclick="MetalTape.toggleWatchlistPanel()">
          <span style="display:flex;${wc>0?'animation:pulseHeart 2s infinite;':''}">${ICONS.heart(wc>0)}</span>
          WATCHLIST${wc>0?' ['+wc+']':''}
        </button>
        <button class="toggle-btn ${state.searchOpen?'active-search':''}" onclick="MetalTape.toggleSearchPanel()">
          ${ICONS.search} ASK CLAUDE
        </button>
        <div class="live-badge"><span class="live-dot">●</span> LIVE</div>
        <div class="clock">${t}</div>
      </div>
    </div>`;
  }

  function tplTicker() {
    const items = [...TICKER_ITEMS, ...TICKER_ITEMS]
      .map(i => `<span class="ticker-item">${escapeHtml(i)}<span class="ticker-cross">✛</span></span>`).join('');
    return `<div class="ticker">
      ${tplBloodDrip(15, 0)}${tplBloodDrip(42, 1.3)}${tplBloodDrip(68, 2.7)}${tplBloodDrip(88, 0.6)}
      <div class="ticker-track">${items}</div>
    </div>`;
  }

  function tplWatchlistPanel() {
    if (!state.watchlistOpen) return '';
    const sug = getWatchlistSuggestions();
    const watched = state.news.filter(n => state.watchlist.includes(n.band)).length;
    return `<div class="panel watchlist-panel">
      <div class="watchlist-header">
        <div class="watchlist-title">
          <span class="${state.watchlist.length>0?'heart-pulse':''}" style="color:var(--red-bright);">${ICONS.heart(true)}</span>
          ⛧ YOUR WATCHLIST [${state.watchlist.length} BANDS · ${watched} STORIES] ⛧
        </div>
        ${state.watchlist.length>0?`<button class="watchlist-filter-toggle ${state.watchlistFilterMode?'active':''}" onclick="MetalTape.toggleWatchlistFilter()">${state.watchlistFilterMode?'✓ FILTERING':'SHOW ONLY MY BANDS'}</button>`:''}
      </div>
      <div style="position:relative;margin-bottom:14px;">
        <div class="panel-input-wrap ${state.watchlistInput?'active-heart':''}">
          <span style="color:var(--text-muted);margin-right:8px;display:flex;">${ICONS.plus}</span>
          <input type="text" class="panel-input" id="wl-input"
            placeholder="ADD BAND (e.g. WHITECHAPEL, INFERI, ARCHSPIRE...)"
            value="${escapeHtml(state.watchlistInput)}"
            oninput="MetalTape.updateWatchlistInput(this.value)"
            onkeydown="MetalTape.watchlistKeydown(event)"/>
          <button id="add-band-btn" class="panel-btn heart" style="display:${state.watchlistInput.trim()?'':'none'};" onclick="MetalTape.addBand(document.getElementById('wl-input').value)">ADD</button>
        </div>
        <div id="suggestions-wrap">
          ${sug.length>0?`<div class="suggestions">${sug.map(b=>`<div class="suggestion-item" onclick="MetalTape.addBand('${escapeHtml(b)}')"><span style="font-size:15px;">${escapeHtml(b)}</span><span class="suggestion-add">+ ADD</span></div>`).join('')}</div>`:''}
        </div>
      </div>
      ${state.watchlist.length===0?`<div class="watchlist-empty">⛧ NO BANDS ON THE WIRE — TYPE ABOVE OR CLICK ❤ ON ANY BAND IN THE FEED ⛧</div>`:`<div class="watchlist-tags">${state.watchlist.map(b=>`<div class="watchlist-tag">${escapeHtml(b)}<span class="watchlist-tag-remove" onclick="MetalTape.removeBand('${escapeHtml(b)}')">${ICONS.x}</span></div>`).join('')}${state.watchlist.length>1?`<button class="clear-all-btn" onclick="MetalTape.clearWatchlist()">CLEAR ALL</button>`:''}</div>`}
    </div>`;
  }

  function tplSearchPanel() {
    if (!state.searchOpen) return '';
    return `<div class="panel">
      <div class="panel-row">
        <div class="sparkle-icon" style="display:flex;color:var(--red);">${ICONS.sparkles}</div>
        <div class="panel-input-wrap ${state.searchQuery?'active':''}">
          <input type="text" class="panel-input" id="search-input"
            placeholder='Ask anything... "tech death tours" · "underground slam" · "reunion announcements"'
            value="${escapeHtml(state.searchQuery)}"
            oninput="MetalTape.updateSearchInput(this.value)"
            onkeydown="MetalTape.searchKeydown(event)" ${state.aiLoading?'disabled':''}/>
          ${state.searchQuery?`<button class="icon-btn" onclick="MetalTape.clearSearch()">${ICONS.x}</button>`:''}
        </div>
        <button class="panel-btn" onclick="MetalTape.runAiSearch()" ${(!state.searchQuery.trim()||state.aiLoading)?'disabled':''}>
          ${state.aiLoading?'...':'ASK'}
        </button>
      </div>
      ${state.aiLoading?`<div class="ai-loading">⛧ SUMMONING THE WIRE ${tplDots()}</div>`:''}
      ${state.aiResponse&&!state.aiLoading?`<div class="ai-response"><span class="ai-response-label">⛧ CLAUDE:</span>${escapeHtml(state.aiResponse)}${state.matchedIds&&state.matchedIds.length>0?`<span style="color:var(--red);margin-left:8px;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;">▸ ${state.matchedIds.length} MATCHED</span>`:''}</div>`:''}
      ${state.aiError?`<div class="ai-error">⛧ ${escapeHtml(state.aiError)}</div>`:''}
    </div>`;
  }

  function tplFilterBars() {
    const tiers = ['ALL', 'MAINSTREAM', 'UNDERGROUND'];
    const genres = getAllGenres();
    return `<div class="filter-bar">
      <span class="filter-label">▸ TIER:</span>
      ${tiers.map(t => `<button class="filter-btn ${state.tierFilter===t?'active':''} ${state.tierFilter===t&&t==='UNDERGROUND'?'tier-underground':''}" onclick="MetalTape.setTier('${t}')">${t==='UNDERGROUND'?'⛧ '+t:t}</button>`).join('')}
      <div class="filter-divider"></div>
      <span class="filter-label">▸ CAT:</span>
      ${CATS.map(c => `<button class="filter-btn ${state.filter===c?'active':''}" onclick="MetalTape.setFilter('${c}')">${c}</button>`).join('')}
    </div>
    <div class="filter-bar genre">
      <span class="filter-label">▸ GENRE:</span>
      ${genres.map(g => `<button class="filter-btn small ${state.genreFilter===g?'active genre-active':''}" onclick="MetalTape.setGenre('${escapeHtml(g)}')">${escapeHtml(g.toUpperCase())}</button>`).join('')}
      <div class="filter-spacer"></div>
      ${hasActiveFilters()?`<button class="clear-filters-btn" onclick="MetalTape.clearFilters()">✕ CLEAR FILTERS</button>`:''}
      <span class="filter-status ${hasActiveFilters()?'active':''}">[${getFilteredNews().length}/${state.news.length}]</span>
    </div>`;
  }

  function tplColHeaders() {
    return `<div class="col-headers">
      <div>▸ STAT</div><div>▸ CAT</div><div>▸ BAND</div><div>▸ HEADLINE</div>
      <div>▸ SOURCE</div><div></div><div></div><div style="text-align:right;">TIME ◂</div>
    </div>`;
  }

  function tplRow(item, idx) {
    const watched = state.watchlist.includes(item.band);
    const isExpanded = state.summaryFor === item.id;
    return `<div class="row ${watched?'watched':''}" onclick="MetalTape.openArticle('${escapeHtml(item.url)}')">
      <div class="status-cell">
        ${item.urgent?`<span class="status-hot"></span><span class="status-hot-text">HOT</span>`:`<span class="status-dash">━━</span>`}
      </div>
      <div class="cat-cell ${item.cat}">${catIcon(item.cat)}${item.cat}</div>
      <div class="band-cell">
        <div class="band-name">${escapeHtml(item.band)}<span class="external-icon">${ICONS.external}</span></div>
        <div class="genre-tag">${escapeHtml(item.genre)} ${item.tier==='underground'?'⛧':''}</div>
      </div>
      <div class="headline-cell">${escapeHtml(item.headline)}</div>
      <div class="source-cell">▸ ${escapeHtml(item.source)}</div>
      <button class="row-action-btn ${watched?'watched':''}" onclick="MetalTape.toggleWatch('${escapeHtml(item.band)}', event)" title="${watched?'Unwatch':'Watch'} ${escapeHtml(item.band)}">
        ${ICONS.heart(watched)} ${watched?'WATCHING':'WATCH'}
      </button>
      <button class="row-action-btn ${isExpanded?'active':''}" onclick="MetalTape.runSummarize(${item.id}, event)">
        ${ICONS.sparkles} ${isExpanded?'CLOSE':'TL;DR'}
      </button>
      <div class="time-cell">${escapeHtml(item.time)}</div>
    </div>
    ${isExpanded?`<div class="summary-box">
      <div class="summary-label">${ICONS.sparkles} ⛧ TL;DR FROM CLAUDE</div>
      ${state.summaryLoading?`<div class="summary-loading">LOADING ${tplDots()}</div>`:`<div class="summary-text">${escapeHtml(state.summaryText||'')}</div>`}
    </div>`:''}`;
  }

  function tplFeed() {
    const filtered = getFilteredNews();
    if (filtered.length === 0) {
      return `<div class="empty-state">⛧ NO STORIES MATCH THE WIRE ⛧
        <div class="empty-state-sub">${state.watchlistFilterMode?'Try removing the watchlist filter or adding more bands':hasActiveFilters()?'Try clearing some filters':''}</div>
      </div>`;
    }
    return filtered.map((item, idx) => tplRow(item, idx)).join('');
  }

  function tplBottom() {
    return `<div class="bottom-bar">
      <div>⛧ 9 SOURCES (5 MAINSTREAM + 4 UNDERGROUND) · ${state.news.length} STORIES · ${state.watchlist.length} WATCHED ⛧</div>
      <div class="bottom-active">${ICONS.sparkles} CLAUDE ${WORKER?'STANDING BY':'NOT CONNECTED'}</div>
    </div>`;
  }

  // ----------- RENDER -----------
  function render() {
    const app = document.getElementById('app');
    if (!app) return;
    app.innerHTML =
      tplMasthead() +
      tplBarbedWire() +
      tplTicker() +
      tplBarbedWire() +
      tplWatchlistPanel() +
      tplSearchPanel() +
      tplFilterBars() +
      tplColHeaders() +
      tplFeed() +
      tplBarbedWire() +
      tplBottom();
    // Restore focus to inputs after re-render
    if (state.searchOpen) { const i = document.getElementById('search-input'); if (i && document.activeElement?.id !== 'search-input') {} }
  }

  // ----------- INIT -----------
  function init() {
    render();
    // Update clock every second without full re-render
    setInterval(() => {
      const clock = document.querySelector('.clock');
      if (clock) clock.textContent = new Date().toTimeString().split(' ')[0];
    }, 1000);
    // Fetch live feed if enabled
    if (USE_LIVE_FEED && WORKER) {
      fetchLiveFeed();
      setInterval(fetchLiveFeed, 1000 * 60 * 30);
    }
  }

  async function fetchLiveFeed() {
    try {
      const res = await fetch(WORKER + '/api/feed');
      if (!res.ok) return;
      const data = await res.json();
      if (data.stories && data.stories.length > 0) {
        state.news = data.stories;
        render();
      }
    } catch (e) { console.error('Feed:', e); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
