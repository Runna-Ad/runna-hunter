# Runna Hunter — Lessons

[2026-06-XX] LESSON: i18n leak — contact modal input PLACEHOLDERS stayed Spanish on CA
ROOT CAUSE: openContact() swapped every label/title/button via T[currentMarket] but the
three input `placeholder` attributes (cf-name, cf-company, cf-email) were hardcoded
Spanish in the static HTML and never updated, so the Canadian/English modal showed
"Tu nombre", "Nombre de tu empresa", "tu@empresa.com". Placeholders are easy to miss
because they're an attribute, not text content.
RULE: For per-locale UI, every user-visible string must be driven by the i18n object —
including placeholder, aria-label, title, and value attributes, not just textContent.
When auditing a bilingual component, grep the static markup for any literal copy and
confirm each one is overwritten on locale switch. Pedro's rule: each version must be
100% its language, zero cross-language leaks.
TAGS: #bug #i18n #ux #accessibility

[2026-06-03] LESSON: requestAnimationFrame fade-in never fired in background/headless tabs
ROOT CAUSE: The Phase 2 AI layer used `requestAnimationFrame(() => el.classList.add('show'))`
to trigger the CSS opacity transition. rAF callbacks are throttled/suspended when the tab
is not visible (headless preview, or a real user who tabs away during the ~30s scan), so
`.show` was never added and the whole AI layer stayed at opacity:0 — content present in the
DOM but invisible.
RULE: For "render now, animate in next tick" patterns, use `setTimeout(fn, ~30)`, not
requestAnimationFrame — setTimeout fires regardless of tab visibility. Reserve rAF for
animations that genuinely should pause when off-screen.
TAGS: #bug #ux #animation #frontend

[2026-06-03] LESSON: The LLM ignored the no-em-dash brand rule until told explicitly + sanitized
ROOT CAUSE: Claude's default prose style uses em dashes heavily. Phase 2's generated copy
(game plan + offering pitches) was full of "—", violating Pedro's standing no-em-dash rule,
even though the rest of the site is em-dash-free.
RULE: For LLM-generated user-facing copy, (1) state brand formatting rules explicitly in the
system prompt ("NEVER use em/en dashes; use commas/colons/periods") AND (2) sanitize
server-side as a backstop (regex replace [—–] → ', '). Prompt instruction alone is not
reliable enough for a strict brand rule — belt and suspenders.
TAGS: #ai #copy #brand #credibility

[2026-06-02] PEDRO_OVERRIDE: Phase 2 should be AI-first, not deterministic-first
WHAT CLAUDE SUGGESTED: Build a free deterministic finding→offering mapping first (2a),
add the Claude personalization layer second (2b). Reasoning: lower cost/risk, value sooner.
PEDRO'S CALL: AI plays the big role from day one. A deterministic pairing that isn't an
exact match reads robotic and "instantly breaks all the trust" — worse than showing
nothing. He wants AI to analyze/audit/pair and own all wording + hooks so it always
reads compelling and makes sense.
WHY HE WAS RIGHT: The value of AI here IS the judgment + persuasive wording. A templated
near-miss pairing looks dumb and is felt instantly by the prospect. AI-first directly
solves the "not-exact-match" failure mode that deterministic can't.
RULE: For prospect-facing recommendation/pairing engines, lead with the LLM (judgment +
wording); keep deterministic only for facts that must be consistent ($ math) or safe
(benchmark claims). The fallback for an LLM failure is GRACEFUL OMISSION (drop the layer,
show clean facts), never a robotic template — two good states, zero broken states.
TAGS: #override #ai #ux #credibility #architecture

[2026-06-02] LESSON: Supabase insert silently dropped on every scan (no row, no error)
ROOT CAUSE: The /api/scan route did `logScan(...).catch()` WITHOUT awaiting, then
returned the response. A Vercel serverless function is frozen/killed the instant it
responds, so the non-awaited insert never completed. No error surfaced because the
process was gone before the promise settled.
RULE: In serverless handlers, ALWAYS `await` any background work (DB writes, logging,
webhooks) before `res.json()`. Wrap in try/catch so the write failing never breaks the
user response, but it MUST be awaited. "Fire-and-forget" does not exist in serverless.
TAGS: #bug #serverless #vercel #supabase #data-loss

[2026-06-02] LESSON: `vercel env add` stored empty values; `env pull` returned ""
ROOT CAUSE: Two compounding issues. (1) In non-interactive/agent mode, `vercel env add`
does NOT read the value from a piped stdin reliably — it needs the `--value` flag.
(2) Production env vars default to SENSITIVE, and `vercel env pull` writes sensitive
vars as empty `""` (they're write-only after creation). So even a correctly-stored key
looked empty locally.
RULE: Set env vars non-interactively with `vercel env add NAME ENV --value "..."`.
For values that need to be readable locally (and are safe to expose, e.g. a Supabase
anon/publishable key), add `--no-sensitive`. Past lesson about `printf` vs `echo`
(trailing newline) still applies, but `--value` is the robust path.
TAGS: #vercel #env #credentials #cli

[2026-06-02] LESSON: `vercel dev` couldn't see Production-only env vars
ROOT CAUSE: `vercel dev` injects the DEVELOPMENT environment's variables, not
Production. Vars added only to `production` are absent locally (process.env undefined),
so the function behaved as "not configured."
RULE: For anything tested via `vercel dev`, add the env var to the `development`
environment too (e.g. `vercel env add NAME development --value ...`). Keep public keys
(anon/publishable) non-sensitive so `vercel env pull` can hydrate `.env.local`.
TAGS: #vercel #env #local-dev

[2026-06-02] PEDRO_OVERRIDE: Findings made definitive claims about the prospect
WHAT CLAUDE SHIPPED: The hardcoded inefficiency pool used accusatory titles like
"No email automation, welcome & abandoned cart flows missing" — phrased as confirmed
facts about THIS business. I'd flagged the credibility risk in the abstract but left
the pre-existing copy as-is.
PEDRO CAUGHT IT: Tested rvsnappad.com (which DOES have email flows) and the tool told
him he had none. A false definitive claim in front of a real prospect = instant loss
of trust in the whole report.
WHY HE WAS RIGHT: These findings are industry BENCHMARKS, not an audit of their stack.
The body copy already hedged ("most stores"), but the title asserted. The honest frame
names the lever + the benchmark, never a claim about them.
RULE: In any auto-generated diagnostic, findings must be true-by-construction —
benchmark/opportunity framing ("Email automation: the highest-ROI channel most stores
underuse"), never "you don't have X." Add an explicit "these are common gaps, we
confirm which apply on the call" disclaimer. Verifiable facts (website signals) may be
stated directly; everything else stays conditional. This applies to the Phase 2 LLM
layer too — constrain it to benchmark framing.
TAGS: #override #ux #credibility #copy #sales

[2026-06-02] DISCOVERY: SSRF guard pattern for user-supplied URLs in serverless
USE WHEN: Any endpoint that fetches a URL the user typed (website analyzers, link
previewers, webhooks). Guard BEFORE fetch: require http(s); block hostnames
(localhost/.local/.internal/metadata.google.internal); dns.lookup the host and reject
private/loopback/link-local/CGNAT ranges incl. 169.254.169.254 (cloud metadata) and
IPv6 ::1/fc00::/fe80::; cap fetch with AbortController timeout + a byte cap on the
streamed body. Implemented in api/scan.js (isBlockedHost + isPrivateIp).
SOURCE: This session.
TAGS: #security #ssrf #serverless #pattern
