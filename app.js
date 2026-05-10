/* =========================================================================
   THE METAL TAPE — APP MODULE
   Underground metal news ticker. Live RSS via Cloudflare Worker.
   ========================================================================= */
(function () {
  'use strict';

  const WORKER = (window.MT && window.MT.WORKER) || '';
  const WATCHLIST_KEY = 'metalTape_watchlist_v1';

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
    feedLoading: true,
    feedError: null,
  };

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
    const set = new Set(state.news.map(n => n.genre).filter(Boolean));
    return ['ALL', ...Array.from(set).sort()];
  }
  function getAllBands() {
    return Array.from(new Set(state.news.map(n => n.band).filter(Boolean))).sort();
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

  // ----------- BAND NAME POST-PROCESSING -----------
  const KNOWN_BANDS_SEED = [
    'WHITECHAPEL','LORNA SHORE','DESPISED ICON','CHELSEA GRIN','CARNIFEX','OCEANO',
    'BRAND OF SACRIFICE','ANGELMAKER','ENTERPRISE EARTH','SHADOW OF INTENT',
    'ARCHSPIRE','BEYOND CREATION','OBSCURA','INFERI','ALLEGAEON','WORMED','GORGUTS',
    'DEVOURMENT','DISENTOMB','DEFEATED SANITY','KRAANIUM','INGESTED','CEREBRAL ROT',
    'ABOMINABLE PUTRIDITY','KATALEPSY','VULVODYNIA','ACRANIUS','PATHOLOGY',
    'TRIVIUM','ARCHITECTS','SPIRITBOX','WAGE WAR','CURRENTS','SILENT PLANET',
    'POLARIS','AUGUST BURNS RED','BRING ME THE HORIZON',
    'KNOCKED LOOSE','TURNSTILE','CODE ORANGE','CONVERGE','HATEBREED',
    'MESHUGGAH','TOOL','PERIPHERY','ANIMALS AS LEADERS','BORN OF OSIRIS','ERRA',
    'CANNIBAL CORPSE','MORBID ANGEL','OBITUARY','GOJIRA','GATECREEPER','NECROT',
    'TOMB MOLD','BLOOD INCANTATION','NAPALM DEATH','CARCASS','PIG DESTROYER',
    'NAILS','FULL OF HELL','MUNICIPAL WASTE','POWER TRIP',
    'METALLICA','SLAYER','MEGADETH','ANTHRAX',
    'ELECTRIC WIZARD','EYEHATEGOD','PALLBEARER',
    'MAYHEM','DARKTHRONE','EMPEROR','MGLA',
    'SLIPKNOT','SYSTEM OF A DOWN','PANTERA','LAMB OF GOD','MACHINE HEAD',
    'DEVILDRIVER','REVOCATION','DYING FETUS','SUFFOCATION','CRYPTOPSY',
    'ORIGIN','NILE','HATE ETERNAL','IMMOLATION','INCANTATION',
    'MISERY INDEX','CATTLE DECAPITATION','THE BLACK DAHLIA MURDER',
    'SHADOW OF INTENT','WHITECHAPEL','VEIL OF MAYA','AFTER THE BURIAL',
    'PARKWAY DRIVE','KILLSWITCH ENGAGE','AS I LAY DYING','ALL THAT REMAINS',
    'UNEARTH','SHADOWS FALL','TERROR','HATEBREED','EVERY TIME I DIE',
    'SACRED REICH','TESTAMENT','EXODUS','OVERKILL','DEATH ANGEL',
    'KREATOR','SODOM','DESTRUCTION','ACCEPT','PRIMAL FEAR',
    'FROZEN SOUL','GATECREEPER','VITRIOL','UNDEATH',
    'RED HOT CHILI PEPPERS','ZZ TOP','PAUL KOSSOFF','FREE',
    'DIMMU BORGIR','CRADLE OF FILTH','BEHEMOTH','WATAIN',
    'AMON AMARTH','ENSLAVED','PRIMORDIAL',
    'OPETH','MASTODON','BARONESS','NEUROSIS',
    'DOWN','CROWBAR','ACID BATH',
    'PANOPTICON','AURORA BOREALIS','KAINE','CONSECRATION',
  ];

  function buildBandIndex(stories) {
    const allBands = new Set(KNOWN_BANDS_SEED);
    stories.forEach(s => {
      if (s.band && s.band !== 'UNKNOWN' && s.band.split(' ').length <= 5) {
        allBands.add(s.band.toUpperCase());
      }
    });
    return Array.from(allBands).sort((a, b) => b.length - a.length);
  }

  function refineBandName(title, currentBand, bandIndex) {
    if (!title) return currentBand;
    const t = title.toUpperCase();

    if (title.match(/^[^:]{2,40}:/) || title.match(/^[^—–]{2,40}[—–]/)) {
      return currentBand;
    }

    for (const band of bandIndex) {
      if (band.length < 3) continue;
      const escaped = band.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('\\b' + escaped + '\\b', 'i');
      if (re.test(t)) return band;
    }

    if (/^["']/.test(title) || currentBand.split(' ').length > 3) {
      const words = title.replace(/^["'\s]+/, '').split(/\s+/).slice(0, 2).join(' ');
      return words.toUpperCase();
    }

    return currentBand;
  }

  function postProcessFeed(stories) {
    if (!stories || stories.length === 0) return stories;
    const bandIndex = buildBandIndex(stories);
    return stories.map(s => {
      const refined = refineBandName(s.band + ' ' + s.headline, s.band, bandIndex);
      if (refined !== s.band) {
        let newHeadline = s.headline;
        if (newHeadline.toUpperCase().startsWith(refined)) {
          newHeadline = newHeadline.slice(refined.length).replace(/^[\s:—–\-]+/, '').trim();
        }
        return { ...s, band: refined, headline: newHeadline || s.headline };
      }
      return s;
    });
  }

  // ----------- ACTIONS -----------
  const MetalTape = {
    setFilter(f) { state.filter = f; render(); },
    setGenre(g) { state.genreFilter = g; render(); },
    setTier(t) { state.tierFilter = t; render(); },
    clearFilters() {
      state.filter = 'ALL'; state.genreFilter = 'ALL'; state.tierFilter = 'ALL';
      state.watchlistFilterMode = false; state.matchedIds = null;
      state.searchQuery = ''; state.aiResponse = null; state.aiError = null;
      render();
    },
    toggleSearchPanel() {
      state.searchOpen = !state.searchOpen; state.watchlistOpen = false;
      render();
      setTimeout(() => { const i = document.getElementById('search-input'); if (i) i.focus(); }, 50);
    },
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
      const wrap = document.getElementById('suggestions-wrap');
      if (wrap) wrap.innerHTML = sug.length === 0 ? '' : `
        <div class="suggestions">
          ${sug.map(b => `
            <div class="suggestion-item" onclick="MetalTape.addBand('${escapeHtml(b)}')">
              <span style="font-size:15px;">${escapeHtml(b)}</span>
              <span class="suggestion-add">+ ADD</span>
            </div>`).join('')}
        </div>`;
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
    removeBand(band) { state.watchlist = state.watchlist.filter(b => b !== band); saveWatchlist(); render(); },
    toggleWatch(band, e) {
      if (e) { e.stopPropagation(); e.preventDefault(); }
      state.watchlist.includes(band) ? MetalTape.removeBand(band) : MetalTape.addBand(band);
    },
    clearWatchlist() {
      if (confirm('Clear all watched bands?')) { state.watchlist = []; saveWatchlist(); render(); }
    },
    toggleWatchlistFilter() { state.watchlistFilterMode = !state.watchlistFilterMode; render(); },
    openArticle(url) {
      if (url && url !== '#') window.open(url, '_blank', 'noopener,noreferrer');
    },

    async runAiSearch() {
      if (!state.searchQuery.trim()) return;
      if (!WORKER) { state.aiError = 'Worker URL not set in index.html'; render(); return; }
      state.aiLoading = true; state.aiError = null; state.aiResponse = null; state.matchedIds = null;
      render();
      const ctx = state.news.map(n => `ID:${n.id} | ${n.band} (${n.genre}, ${n.tier}) | ${n.cat} | ${n.headline}`).join('\n');
      const prompt = `You are a metal music expert assistant for "The Metal Tape" news ticker.\n\nUSER QUERY: "${state.searchQuery}"\n\nAVAILABLE NEWS STORIES:\n${ctx}\n\nAnalyze the query and find matching stories. Respond ONLY with valid JSON:\n{"matchedIds":[array of story ID numbers],"response":"Brief 1-2 sentence answer in metal-appropriate tone"}`;
      try {
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
        state.aiError = 'Connection severed. Try again.';
        console.error('AI search:', err);
      } finally {
        state.aiLoading = false; render();
      }
    },

    // TL;DR — calls /api/summarize which fetches the actual article before summarizing
    async runSummarize(itemId, e) {
      if (e) { e.stopPropagation(); e.preventDefault(); }
      if (state.summaryFor === itemId) {
        state.summaryFor = null; state.summaryText = null; render(); return;
      }
      if (!WORKER) {
        state.summaryFor = itemId;
        state.summaryText = '⛧ Worker not connected. Add ANTHROPIC_API_KEY to Worker env vars in Cloudflare dashboard.';
        render(); return;
      }
      const item = state.news.find(n => n.id === itemId);
      if (!item) return;

      state.summaryFor = itemId;
      state.summaryLoading = true;
      state.summaryText = null;
      render();

      try {
        const res = await fetch(WORKER + '/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            articleUrl: item.url,
            band:       item.band,
            genre:      item.genre,
            headline:   item.headline,
            source:     item.source,
          }),
        });
        if (!res.ok) throw new Error('API ' + res.status);
        const data = await res.json();
        state.summaryText = (data.content || []).map(c => c.text || '').join('\n').trim();
      } catch (err) {
        state.summaryText = '⛧ Could not reach the wire. Try again.';
        console.error('Summary:', err);
      } finally {
        state.summaryLoading = false; render();
      }
    },
  };
  window.MetalTape = MetalTape;

  // ----------- LIVE FEED -----------
  async function fetchLiveFeed() {
    if (!WORKER) {
      state.feedLoading = false;
      state.feedError = 'Worker URL not set. Update window.MT.WORKER in index.html.';
      render(); return;
    }
    try {
      state.feedLoading = true;
      render();
      const res = await fetch(WORKER + '/api/feed');
      if (!res.ok) throw new Error('Feed ' + res.status);
      const data = await res.json();
      if (data.stories && data.stories.length > 0) {
        state.news = postProcessFeed(data.stories);
        state.feedError = null;
      } else {
        state.feedError = 'Feed returned empty. Sources may be temporarily down.';
      }
    } catch (err) {
      state.feedError = 'Could not reach the wire. Retrying in 30 min.';
      console.error('Feed:', err);
    } finally {
      state.feedLoading = false;
      render();
    }
  }

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
    const id = 'w' + Math.random().toString(36).slice(2,7);
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
    if (side === 'left') return `<svg class="blood-splatter" style="top:0;left:0;" width="180" height="120" viewBox="0 0 180 120"><g fill="#8b0000" opacity="0.6"><circle cx="20" cy="15" r="8"/><circle cx="45" cy="8" r="4"/><circle cx="60" cy="25" r="3"/><circle cx="35" cy="35" r="5"/><circle cx="80" cy="18" r="2"/><circle cx="15" cy="50" r="3"/><circle cx="55" cy="55" r="6"/><ellipse cx="30" cy="20" rx="15" ry="3" transform="rotate(25 30 20)"/></g></svg>`;
    return `<svg class="blood-splatter" style="top:0;right:0;" width="200" height="100" viewBox="0 0 200 100"><g fill="#8b0000" opacity="0.5"><circle cx="160" cy="20" r="6"/><circle cx="180" cy="10" r="3"/><circle cx="140" cy="35" r="4"/><circle cx="170" cy="45" r="2"/><circle cx="190" cy="60" r="5"/><ellipse cx="170" cy="30" rx="20" ry="2" transform="rotate(-15 170 30)"/></g></svg>`;
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
    const items = state.news.length > 0
      ? [...state.news.slice(0, 12), ...state.news.slice(0, 12)]
      : ['LOADING THE WIRE', 'FETCHING FEEDS', 'STAND BY', 'LOADING THE WIRE', 'FETCHING FEEDS', 'STAND BY'];
    const html = items.map(i => {
      const label = typeof i === 'object' ? `${i.band} — ${i.headline.slice(0,40)}${i.headline.length>40?'...':''}` : i;
      return `<span class="ticker-item">${escapeHtml(label)}<span class="ticker-cross">✛</span></span>`;
    }).join('');
    return `<div class="ticker">
      ${tplBloodDrip(15,0)}${tplBloodDrip(42,1.3)}${tplBloodDrip(68,2.7)}${tplBloodDrip(88,0.6)}
      <div class="ticker-track">${html}</div>
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
            placeholder="ADD BAND — TYPE TO SEARCH OR ENTER ANY NAME"
            value="${escapeHtml(state.watchlistInput)}"
            oninput="MetalTape.updateWatchlistInput(this.value)"
            onkeydown="MetalTape.watchlistKeydown(event)"/>
          <button id="add-band-btn" class="panel-btn heart" style="display:${state.watchlistInput.trim()?'':'none'};"
            onclick="MetalTape.addBand(document.getElementById('wl-input').value)">ADD</button>
        </div>
        <div id="suggestions-wrap">
          ${sug.length>0?`<div class="suggestions">${sug.map(b=>`<div class="suggestion-item" onclick="MetalTape.addBand('${escapeHtml(b)}')"><span style="font-size:15px;">${escapeHtml(b)}</span><span class="suggestion-add">+ ADD</span></div>`).join('')}</div>`:''}
        </div>
      </div>
      ${state.watchlist.length===0
        ? `<div class="watchlist-empty">⛧ NO BANDS ON THE WIRE — TYPE ABOVE OR CLICK ❤ ON ANY ROW ⛧</div>`
        : `<div class="watchlist-tags">
            ${state.watchlist.map(b=>`<div class="watchlist-tag">${escapeHtml(b)}<span class="watchlist-tag-remove" onclick="MetalTape.removeBand('${escapeHtml(b)}')">${ICONS.x}</span></div>`).join('')}
            ${state.watchlist.length>1?`<button class="clear-all-btn" onclick="MetalTape.clearWatchlist()">CLEAR ALL</button>`:''}
           </div>`}
    </div>`;
  }

  function tplSearchPanel() {
    if (!state.searchOpen) return '';
    return `<div class="panel">
      <div class="panel-row">
        <div class="sparkle-icon" style="display:flex;color:var(--red);">${ICONS.sparkles}</div>
        <div class="panel-input-wrap ${state.searchQuery?'active':''}">
          <input type="text" class="panel-input" id="search-input"
            placeholder='Ask anything... "deathcore tours" · "tech death releases" · "bands like Spiritbox"'
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
      ${state.aiResponse&&!state.aiLoading?`<div class="ai-response">
        <span class="ai-response-label">⛧ CLAUDE:</span>${escapeHtml(state.aiResponse)}
        ${state.matchedIds&&state.matchedIds.length>0?`<span style="color:var(--red);margin-left:8px;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;">▸ ${state.matchedIds.length} MATCHED</span>`:''}
      </div>`:''}
      ${state.aiError?`<div class="ai-error">⛧ ${escapeHtml(state.aiError)}</div>`:''}
    </div>`;
  }

  function tplFilterBars() {
    const tiers = ['ALL', 'MAINSTREAM', 'UNDERGROUND'];
    const genres = getAllGenres();
    return `<div class="filter-bar">
      <span class="filter-label">▸ TIER:</span>
      ${tiers.map(t=>`<button class="filter-btn ${state.tierFilter===t?'active':''} ${state.tierFilter===t&&t==='UNDERGROUND'?'tier-underground':''}" onclick="MetalTape.setTier('${t}')">${t==='UNDERGROUND'?'⛧ '+t:t}</button>`).join('')}
      <div class="filter-divider"></div>
      <span class="filter-label">▸ CAT:</span>
      ${CATS.map(c=>`<button class="filter-btn ${state.filter===c?'active':''}" onclick="MetalTape.setFilter('${c}')">${c}</button>`).join('')}
    </div>
    <div class="filter-bar genre">
      <span class="filter-label">▸ GENRE:</span>
      ${genres.map(g=>`<button class="filter-btn small ${state.genreFilter===g?'active genre-active':''}" onclick="MetalTape.setGenre('${escapeHtml(g)}')">${escapeHtml(g.toUpperCase())}</button>`).join('')}
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

  function tplRow(item) {
    const watched = state.watchlist.includes(item.band);
    const isExpanded = state.summaryFor === item.id;
    const hasUrl = item.url && item.url !== '#';
    const bandEsc = escapeHtml(item.band).replace(/'/g, '&#39;');
    return `<div class="row ${watched?'watched':''}" onclick="MetalTape.openArticle('${escapeHtml(item.url)}')">
      <div class="status-cell">
        ${item.urgent?`<span class="status-hot"></span><span class="status-hot-text">HOT</span>`:`<span class="status-dash">━━</span>`}
      </div>
      <div class="cat-cell ${item.cat}">${catIcon(item.cat)}${item.cat}</div>
      <div class="band-cell">
        <div class="band-name">${escapeHtml(item.band)}${hasUrl?ICONS.external:''}</div>
        <div class="genre-tag">${escapeHtml(item.genre||'')} ${item.tier==='underground'?'⛧':''}</div>
      </div>
      <div class="headline-cell">${escapeHtml(item.headline)}</div>
      <div class="source-cell">▸ ${escapeHtml(item.source)}</div>
      <div class="row-btn-wrap" onclick="event.stopPropagation()">
        <button class="row-action-btn ${watched?'watched':''}" ontouchend="event.preventDefault();MetalTape.toggleWatch('${bandEsc}',event);" onclick="MetalTape.toggleWatch('${bandEsc}',event)">
          ${ICONS.heart(watched)} ${watched?'WATCHING':'WATCH'}
        </button>
      </div>
      <div class="row-btn-wrap" onclick="event.stopPropagation()">
        <button class="row-action-btn tldr-btn ${isExpanded?'active':''}" ontouchend="event.preventDefault();MetalTape.runSummarize(${item.id},event);" onclick="MetalTape.runSummarize(${item.id},event)">
          ${ICONS.sparkles} ${isExpanded?'✕':'TL;DR'}
        </button>
      </div>
      <div class="time-cell">${escapeHtml(item.time)}</div>
    </div>
    ${isExpanded?`<div class="summary-box">
      <div class="summary-label">${ICONS.sparkles} ⛧ TL;DR FROM CLAUDE</div>
      ${state.summaryLoading
        ? `<div class="summary-loading">READING THE ARTICLE ${tplDots()}</div>`
        : `<div class="summary-text">${escapeHtml(state.summaryText||'')}</div>`}
    </div>`:''}`;
  }

  function tplFeed() {
    if (state.feedLoading) {
      return `<div class="empty-state">
        ⛧ TAPPING THE WIRE ${tplDots()}
        <div class="empty-state-sub">Pulling from 10 sources...</div>
      </div>`;
    }
    if (state.feedError && state.news.length === 0) {
      return `<div class="empty-state">
        ⛧ FEED ERROR ⛧
        <div class="empty-state-sub">${escapeHtml(state.feedError)}</div>
      </div>`;
    }
    const filtered = getFilteredNews();
    if (filtered.length === 0) {
      return `<div class="empty-state">⛧ NO STORIES MATCH THE WIRE ⛧
        <div class="empty-state-sub">${state.watchlistFilterMode?'Try removing watchlist filter or adding more bands':hasActiveFilters()?'Try clearing some filters':''}</div>
      </div>`;
    }
    return filtered.map(item => tplRow(item)).join('');
  }

  function tplBottom() {
    return `<div class="bottom-bar">
      <div>⛧ 10 SOURCES · ${state.news.length} STORIES · ${state.watchlist.length} WATCHED ⛧</div>
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
  }

  // ----------- INIT -----------
  function init() {
    render();
    setInterval(() => {
      const c = document.querySelector('.clock');
      if (c) c.textContent = new Date().toTimeString().split(' ')[0];
    }, 1000);
    fetchLiveFeed();
    setInterval(fetchLiveFeed, 1000 * 60 * 30);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
