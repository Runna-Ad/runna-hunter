# Inefficiency Hunter — Phase 1: Lead Capture + Website Signals

## Scope (Phase 1 — NO LLM yet)
Make the tool capture leads + add deterministic, defensible personalization.

### 1. Supabase logging — every scan captured silently
- [ ] Create `hunter_scans` table in S.P.A.M project (`ybbrpqzbedaxsmotgtkh`)
- [ ] RLS: anon INSERT-only (least privilege; no public SELECT)
- [ ] Columns: id, created_at, market, industry, team_size, timesink, tools[], website_url, signals jsonb, results jsonb, ip, user_agent
- [ ] Add SUPABASE_URL + SUPABASE_ANON_KEY to Vercel env

### 2. Website signals — optional URL field (deterministic, no LLM)
- [ ] Add optional "Website" field to scan form (bilingual label)
- [ ] New `api/scan.js`: SSRF-safe fetch of the URL, extract factual signals:
      - Meta Pixel, Google Analytics/GTM, TikTok pixel
      - Email capture form (Klaviyo/Mailchimp/input[type=email])
      - Social links (IG/FB/TikTok/LinkedIn/YouTube)
      - Open Graph / SEO tags, mobile viewport
- [ ] SSRF guards: http(s) only, block private/loopback/metadata IPs, 5s timeout, size cap
- [ ] Log the scan row to Supabase from this route (fire-and-forget safe)
- [ ] Frontend: call /api/scan during the hunting animation; show a compact
      "Website signals" strip in results (facts only, e.g. "No Meta Pixel detected")

### 3. Contact email bundle — meeting requests include full context
- [ ] Frontend submitContact: include scan inputs + results + signals in payload
- [ ] api/contact.js: render scan context block in the email (so the call is pre-briefed)

## Verification
- [x] Local: scan with a real URL → signals show, row lands in Supabase (201)
- [x] SSRF: localhost / 169.254.169.254 / private IP all rejected
- [x] Contact email scan-context block renders (unit-tested)
- [x] Bilingual signal labels correct (verified MX in browser)
- [x] No em dashes in new copy (0 across all files)
- [x] Frontend flow verified in browser (signals strip + findings render)
- [x] Test rows cleaned from Supabase
- [x] Reframe all 74 finding titles to benchmark/opportunity framing (Pedro caught
      definitive claims about the prospect, e.g. rvsnappad "has no email flows")
- [x] Add benchmark disclaimer line under results title (bilingual)
- [x] Re-verified in browser: titles + note read correctly, signals factual
- [ ] Get Pedro approval BEFORE deploy  ← CURRENT

## Review (Phase 1)
What shipped: optional website field → SSRF-safe /api/scan extracts deterministic
signals (Meta Pixel, GA, email capture, social) → shown as on-brand strip + logged
to Supabase hunter_scans (anon insert-only RLS) → contact email now bundles full
scan context (inputs + results + signals) as a call pre-brief.
Key gotchas hit: (1) serverless freezes after response → must await the Supabase
insert; (2) `vercel env add` needs --value in non-interactive mode + --no-sensitive
to be pullable; (3) vercel dev uses DEVELOPMENT env, so vars needed there too.

## Phase 1.5 — Conversion tracking (contacted flag)  ✅ built + tested
Goal: SPAM can show a real funnel (scanned → booked a call).
- [x] Client generates scan id (crypto.randomUUID) at hunt start, passes to /api/scan
- [x] /api/scan inserts row with that id (client knows it without a SELECT policy)
- [x] Migration: contacted_at column + security-definer RPC mark_hunter_contacted(id),
      execute granted to anon ONLY (anon cannot read or broad-update the table)
- [x] Contact form passes scanId; /api/contact calls the RPC after sending email
- [x] Verified locally: insert with known id → RPC → contacted=true + contacted_at set
- [ ] Deploy (awaiting Pedro approval)

## Out of scope (Phase 2)
- Claude solution-mapping layer + Runna Offering Catalog
- PageSpeed API score (needs Google API key — Phase 1.5)
