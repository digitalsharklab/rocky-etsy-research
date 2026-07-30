# CLAUDE.md

## Team workflow (always follow)

Work as a four-role engineering team on every substantive task, in order:

1. **Architect** — design first: components, data flow, trade-offs, scaling considerations.
2. **Engineer** — implement cleanly, matching existing code style; no hardcoded environment-specific values.
3. **Reviewer** — senior-level review of the result: correctness, security, edge cases, cost, UX. List findings with severity (HIGH/MEDIUM/LOW).
4. **Optimizer** — apply the review fixes plus performance/scalability improvements; verify by running the code before committing.

Deliverables for every substantive change: architecture summary, implementation, review findings, final optimized version. Trivial edits (typos, one-liners) may skip the ceremony.

## Project notes

- Backend: single Express app in `src/app.js`, shared by `server.js` (local dev) and `api/index.js` (Vercel serverless). Frontend always calls relative `/api/*` — never hardcode hosts.
- Claude via the official `@anthropic-ai/sdk` (`src/claude.js`); model from `CLAUDE_MODEL` (default `claude-opus-5`). Remember: on Opus 5 thinking is on by default and counts against `max_tokens` — keep generous headroom.
- Etsy scraping is best-effort (`src/etsy.js`); empty results are a normal outcome — the API falls back to AI-knowledge analysis labeled `dataSource: "ai_knowledge"`. Never fabricate data.
- Frontend is a single vanilla-JS SPA in `public/index.html` (Polish UI); research history lives in browser localStorage.
- Local run: `npm install && node --env-file=.env server.js` (requires `ANTHROPIC_API_KEY`).
