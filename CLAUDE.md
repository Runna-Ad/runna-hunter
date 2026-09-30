# Rünna Inefficiency Hunter

## What this is
Bilingual (MX/CA) lead-gen tool: a prospect runs a 30-second marketing diagnostic, sees benchmark-framed "profit leaks" in dollars, and an AI layer maps each finding to a real Rünna service, then books a meeting.

## Stack
Single static `index.html` (vanilla JS, `T.mx`/`T.ca` i18n) + Vercel serverless functions in `api/` (`scan.js`, `recommend.js`, `contact.js`, `_catalog.js`). Supabase (S.P.A.M project `ybbrpqzbedaxsmotgtkh`, table `hunter_scans`). Anthropic SDK (Sonnet) · Nodemailer via Gmail SMTP.

## Commands
- Dev: `vercel dev`
- Build: none (static + serverless)
- Test: none yet

## Deploy
`git push` to `main` → Vercel auto-deploys → https://runna-hunter.vercel.app. Repo `Runna-Ad/runna-hunter`. Never zip-deploy.

## Key conventions
- AI recommendations are constrained to the offerings in `api/_catalog.js` (full text in `offering-catalog.md`) — update both together.
- `hunter_scans` is anon INSERT-only RLS; client generates the row UUID, updates go through security-definer RPCs.
- Website fetch in `scan.js` is SSRF-guarded — keep the guard when touching it.
- Findings are benchmark framing, never accusations.
