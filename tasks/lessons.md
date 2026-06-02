# Runna Hunter — Lessons

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
