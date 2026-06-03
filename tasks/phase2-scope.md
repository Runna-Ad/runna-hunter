# Phase 2 Scope — "Here's the system Rünna would build you"

## Goal
Every finding ends with a specific, proof-backed Rünna offering, plus a personalized
"game plan" close, so the prospect sees the exact deliverable, not just a problem.

## Core principle (from the credibility lesson)
- Deterministic findings + $ math STAY (defensible, never invented).
- Claude is a MAPPING + PERSONALIZATION layer, constrained to the catalog. It never
  invents services or makes unverified claims about the prospect.

---

## DECISION (Pedro override): AI-first from day one
Deterministic finding→offering pairing was rejected: a "close but not exact" pairing
reads robotic and breaks trust HARDER than showing nothing. Claude leads the pairing +
wording + hooks from launch, using judgment so pairings always read naturally.

## Architecture — AI-first, one path

**Claude runs on every scan.** Inputs: prospect answers + website signals + the 3
deterministic findings + the full offering catalog. Output (structured JSON, market's
language): per-finding offering pairing + compelling wording/hooks + a personalized
"Your Rünna game plan" close.

- **Stays deterministic (never AI):** the $ figures (consistent/defensible) and the
  benchmark facts (claims stay safe). Everything PERSUASIVE is Claude.
- **Model:** Sonnet. **Cost:** ~1.7¢/scan (~$17 per 1,000 scans). **Latency:** ~4–7s.
- **UX:** findings + $ render INSTANTLY (deterministic); the AI pairing + game plan
  fade in ~3–5s later, covered by the hunt animation.

### Fallback = graceful omission (NOT robotic templates)
If Claude errors/times out: show the clean findings + $ + a soft line ("Book a call and
we'll map each gap to the exact fix"). Drop the offering layer entirely. The prospect
NEVER sees an awkward pairing. Two good states (Claude output OR clean omission), zero
broken states.

---

## Guardrails
- Claude receives the catalog + is told to ONLY use these offerings, never invent.
- Benchmark framing enforced; only verified website signals stated as fact.
- Structured JSON output (offering match per finding + synthesis paragraph), low temp.
- **Deterministic fallback:** if Claude errors/times out, show the 2a mapping. Never
  a broken or empty result.
- Rate limit per IP + monthly token cap (abuse / runaway-cost guard).
- Anthropic API key in Vercel env (reuse SPAM's key or a separate one).

---

## UI changes
- Per finding card: an offering CTA chip ("→ Rünna fix: [Offering]").
- New section above the contact CTA: "Your Rünna game plan" + top 1–2 recommended
  offerings with pitch lines.
- Bilingual: 2a needs Spanish pitch lines added to the catalog; 2b Claude outputs
  in the market's language automatically.

## Investment bands
Stay INTERNAL (never shown to prospect). The pitch shows the deliverable + proof,
the call sets scope/price.

---

## What I need from Pedro
1. AI-first approach — confirmed.
2. Model: Sonnet — confirmed.
3. Anthropic API key for the Hunter (reuse SPAM's or a separate one) for Vercel env.

## Build order (AI-first)
1. Claude call (catalog + findings + signals + inputs) → structured JSON: pairings +
   compelling wording/hooks + "Your Rünna game plan", in the market's language.
2. Guardrails: catalog-only, benchmark framing, low temp, JSON schema validation,
   rate-limit per IP + monthly token cap, graceful-omission fallback.
3. Frontend: findings + $ instant; AI pairings + game plan fade in when the call returns.
4. Test locally (incl. forced-failure → graceful omission), then deploy.
