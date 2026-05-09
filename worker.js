/* =========================================================================
   THE METAL TAPE — CLOUDFLARE WORKER
   Proxies Anthropic API + RSS feed aggregation.
   Deploy as a true Worker (not static assets).
   
   SETUP:
   1. In Cloudflare Dashboard → Workers → metal-tape → Settings → Variables
   2. Add: ANTHROPIC_API_KEY = (your key from platform.anthropic.com)
   ========================================================================= */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {

      // ── ANTHROPIC (POST /api/brief) ──
      // Proxy for AI search + TL;DR summaries
      if (path === '/api/brief' && request.method === 'POST') {
        const body = await request.json();
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001', // Fast + cheap for short tasks
            max_tokens: 1024,
            messages: body.messages,
            system: body.system || 'You are a metal music expert. Be direct, knowledgeable, and concise.',
          }),
        });
        const data = await resp.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ── RSS FEED AGGREGATION (GET /api/feed) ──
      // Pulls from 9 metal news sources, dedupes, sorts by date
      if (path === '/api/feed') {
        const cache = caches.default;
        const cacheKey = new Request(url.toString());
        const cachedResp = await cache.match(cacheKey);
        if (cachedResp) {
          return new Response(cachedResp.body, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const SOURCES = [
          // Mainstream
          { name: 'BLABBERMOUTH', url: 'https://blabbermouth.net/feed/', tier: 'mainstream' },
          { name: 'METAL INJECTION', url: 'https://metalinjection.net/feed', tier: 'mainstream' },
          { name: 'LOUDWIRE', url: 'https://loudwire.com/feed/', tier: 'mainstream' },
          { name: 'KERRANG', url: 'https://www.kerrang.com/feed', tier: 'mainstream' },
          { name: 'METAL HAMMER', url: 'https://www.loudersound.com/feeds.xml?categories=metal-hammer', tier: 'mainstream' },
          // Underground
          { name: 'LAMBGOAT', url: 'https://lambgoat.com/news/rss', tier: 'underground' },
          { name: 'NO CLEAN SINGING', url: 'https://www.nocleansinging.com/feed/', tier: 'underground' },
          { name: 'TECH DEATH METAL', url: 'https://technicaldeathmetal.org/feed', tier: 'underground' },
          { name: 'DEATH METAL UG', url: 'https://www.deathmetal.org/feed/', tier: 'underground' },
        ];

        const allItems = [];
        await Promise.all(SOURCES.map(async (src) => {
          try {
            const r = await fetch(src.url, {
              headers: { 'User-Agent': 'TheMetalTape/1.0' },
              cf: { cacheTtl: 1800, cacheEverything: true },
            });
            if (!r.ok) return;
            const xml = await r.text();
            const items = parseRSS(xml).slice(0, 20);
            items.forEach(it => {
              allItems.push({
                ...it,
                source: src.name,
                tier: src.tier,
                cat: categorize(it.title, it.description),
                urgent: isUrgent(it.title, it.description),
                genre: 'metal',
                band: extractBand(it.title),
                headline: cleanHeadline(it.title),
                time: relativeTime(it.pubDate),
              });
            });
          } catch (e) {
            // Skip failed feeds silently
          }
        }));

        // Sort newest first, dedupe by similar titles
        allItems.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
        const seen = new Set();
        const stories = allItems.filter(s => {
          const key = (s.band + s.headline).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 200).map((s, i) => ({ ...s, id: i + 1 }));

        const json = JSON.stringify({
          stories,
          sources: SOURCES.length,
          total: stories.length,
          timestamp: new Date().toISOString(),
        });

        const toCache = new Response(json, {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' }, // 30 min
        });
        await cache.put(cacheKey, toCache.clone());

        return new Response(json, {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ── HEALTH CHECK ──
      if (path === '/' || path === '/api/health') {
        return new Response(JSON.stringify({
          status: 'METAL TAPE WORKER ACTIVE',
          endpoints: ['/api/brief (POST)', '/api/feed (GET)'],
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response('Not found', { status: 404, headers: corsHeaders });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

// Lightweight RSS parser (no library needed in Workers)
function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    items.push({
      title: getTag(itemXml, 'title'),
      link: getTag(itemXml, 'link'),
      description: stripHtml(getTag(itemXml, 'description') || ''),
      pubDate: getTag(itemXml, 'pubDate') || getTag(itemXml, 'dc:date') || '',
    });
  }
  return items;
}

function getTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function categorize(title = '', desc = '') {
  const t = (title + ' ' + desc).toLowerCase();
  if (/festival|hellfest|download|wacken|summer slaughter|knotfest|riot fest|bloodstock|maryland deathfest/.test(t)) return 'FEST';
  if (/tour|live|dates|shows|on the road|leg|headline|opens for|supporting/.test(t)) return 'TOUR';
  if (/album|single|release|drops|streaming|premiere|track|video|EP|LP|listen|debut|demo|split|reissue|signs to|new song|stream/.test(t)) return 'RELEASE';
  return 'NEWS';
}

function isUrgent(title = '', desc = '') {
  const t = (title + ' ' + desc).toLowerCase();
  return /breaking|exclusive|just announced|reunion|grammy|dies|dead|drops today|premiere|surprise|leaked/.test(t);
}

function extractBand(title = '') {
  if (!title) return 'UNKNOWN';
  const patterns = [
    /^([A-Z][A-Z0-9\s&'!?\.\-]+?)(?::|—|–|-\s|'s\s|announces|drops|releases|reveals|confirms|adds|cancels|teases|premieres)/i,
    /^([A-Z][A-Z0-9\s&'!?\.\-]+?)(?=\s+[a-z])/,
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m && m[1].length < 50 && m[1].length > 2) return m[1].trim().toUpperCase();
  }
  return title.split(/\s+/).slice(0, 3).join(' ').toUpperCase();
}

function cleanHeadline(title = '') {
  // Remove extracted band from front of headline
  const band = extractBand(title);
  return title.replace(new RegExp(`^${band}[\\s:—–-]+`, 'i'), '').toUpperCase().slice(0, 100);
}

function relativeTime(dateStr) {
  if (!dateStr) return '?';
  const d = new Date(dateStr);
  if (isNaN(d)) return '?';
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (m < 60) return Math.max(1, m) + 'M';
  if (h < 24) return h + 'H';
  if (days < 30) return days + 'D';
  return Math.floor(days / 30) + 'MO';
}
