# The Metal Tape 🤘

Underground metal news ticker. Aggregates 9 RSS sources (Blabbermouth, Metal Injection, Tech Death Metal, Lambgoat, etc.) into a single brutalist news wire.

## Features
- Live news feed from 9 metal sources (5 mainstream + 4 underground)
- Tier toggle: mainstream vs. underground
- Genre filtering (deathcore, tech death, slam, grindcore, etc.)
- Band watchlist with localStorage persistence
- AI search powered by Claude (via Cloudflare Worker proxy)
- TL;DR summaries per story
- Click any row to read the full article

## Stack
- Vanilla HTML/CSS/JS (no build step)
- Cloudflare Pages (hosting)
- Cloudflare Worker (API proxy + RSS aggregator + caching)
- Anthropic Claude API (AI features)

## Files
- `index.html` — UI + styles
- `app.js` — App logic
- `worker.js` — Cloudflare Worker (deploy separately)

## Deployment
See `SETUP.md` for full step-by-step instructions.
