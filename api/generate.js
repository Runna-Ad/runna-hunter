import Anthropic from '@anthropic-ai/sdk';

/**
 * /api/generate  (Phase 2 — AI-refine the findings)
 * The client renders the deterministic catalog findings INSTANTLY (first paint +
 * guaranteed fallback). This endpoint then SELECTS exactly 3 finding ids from the
 * candidate pool and SHARPENS their title/body prose for the prospect's situation.
 *
 * Hard isolation of money: Claude only returns ids + prose. It never sees or emits
 * a number — all dollar math stays client-side via calculateImpact() over the
 * catalog formulas. Any failure/timeout returns ok:false so the client keeps the
 * deterministic result (zero visible failure).
 */
const MODEL = 'claude-sonnet-4-6';
const RATE_LIMIT_PER_HOUR = 40; // per IP, security-definer RPC (shared with recommend)

const VALID_INDUSTRIES = new Set([
  'ecommerce','restaurant','realestate','proservices','retail',
  'automotive','fitness','hospitality','trades','other'
]);

const SCHEMA = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      description: 'Exactly 3 chosen findings, in display order (the pinned id first when one is given).',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'A finding id copied verbatim from the candidate list.' },
          title: { type: 'string', description: 'Sharpened headline, max ~80 chars. No numbers, %, $, sources, client names, or geography.' },
          body: { type: 'string', description: 'Sharpened 1-2 sentence explanation, max ~320 chars. No numbers, %, $, hours, timelines, sources, client names, or geography.' }
        },
        required: ['id','title','body'],
        additionalProperties: false
      }
    }
  },
  required: ['picks'],
  additionalProperties: false
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

  const { market, industry, size, timesink, tools, signals, lead, deterministicTop3, candidates } = req.body || {};

  // ── Validation (cheap guards before any LLM spend)
  if (!industry || !VALID_INDUSTRIES.has(industry)) return res.status(400).json({ ok: false, error: 'bad_industry' });
  if (!Array.isArray(candidates) || candidates.length < 3) return res.status(400).json({ ok: false, error: 'no_candidates' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ ok: false, error: 'not_configured' });

  // Candidate index: id → original title/body (the fallback + the number guard).
  const byId = new Map();
  for (const c of candidates) {
    if (c && typeof c.id === 'string') byId.set(c.id, { title: String(c.title || ''), body: String(c.body || '') });
  }
  const pinnedId = typeof lead === 'string' && byId.has(lead) ? lead : null;
  const detTop3 = (Array.isArray(deterministicTop3) ? deterministicTop3 : []).filter(id => byId.has(id));

  // ── Per-IP rate limit (reuses hunter_scans via security-definer RPC)
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;
  if (ip) {
    try {
      const count = await ipRecentCount(ip);
      if (count !== null && count > RATE_LIMIT_PER_HOUR) {
        return res.status(200).json({ ok: false, error: 'rate_limited' });
      }
    } catch { /* fail open — never block a real prospect on a rate-check error */ }
  }

  const isCA = market === 'ca';
  const lang = isCA ? 'English' : 'Spanish (Mexican, natural and warm)';

  const system =
`You are Rünna's senior strategist refining a prospect's self-serve diagnostic.
You will SELECT exactly 3 findings from the candidate list and REWRITE each one's
title and body so they speak directly to this prospect, sharper and more specific.

HARD RULES:
- Choose ONLY ids that appear in the candidate list. Return each id verbatim.
${pinnedId ? `- The pinned finding id "${pinnedId}" MUST be first in your picks (it is the play the prospect was promised).` : '- Lead with the single most relevant finding for their time-sink and tools.'}
- Prefer the deterministic top-3 unless another candidate is clearly a better fit for their time-sink, tools, or website signals.
- NEVER write a number, percentage, dollar amount, hours, timeline, source, statistic, client name, metric, or geography in any title or body. The platform computes and shows all numbers itself; if you emit one it will be discarded.
- Reference a website signal only if it is given to you as detected/not-detected. Never assert anything else about their specific setup.
- Keep titles under ~80 characters and bodies to 1-2 sentences (under ~320 characters). Confident and concrete, never generic filler.
- NEVER use em dashes (—) or en dashes (–). Use commas, colons, or periods. Strict brand rule.
- Write everything in ${lang}.`;

  const userPayload = {
    market: isCA ? 'Canada' : 'Mexico',
    industry, teamSize: size, timesink,
    toolsTheyUse: Array.isArray(tools) ? tools : [],
    websiteSignals: signals || null,
    pinnedId: pinnedId || null,
    deterministicTop3: detTop3,
    candidates: candidates.map(c => ({ id: c.id, title: c.title, body: c.body, solution: c.solution, frame: c.frame }))
  };

  try {
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system,
      messages: [{
        role: 'user',
        content:
`Refine this diagnostic. Pick exactly 3 candidate ids and rewrite each title + body.

${JSON.stringify(userPayload, null, 2)}`
      }]
    });

    const text = (resp.content || []).find(b => b.type === 'text')?.text || '';
    const parsed = JSON.parse(text);

    const picks = selectPicks(parsed.picks, byId, pinnedId, detTop3);
    if (picks.length < 3) return res.status(200).json({ ok: false, error: 'insufficient' });

    return res.status(200).json({ ok: true, picks });
  } catch (err) {
    console.error('generate error:', err?.message);
    return res.status(200).json({ ok: false, error: 'generation_failed' });
  }
}

// Server defenses — exported pure so it can be unit-tested without the LLM.
// Given the model's raw picks, enforce: ids ⊆ candidates, deduped, pin at slot 0,
// backfilled to 3 from the deterministic top-3 then any candidate, prose number-free.
export function selectPicks(rawPicks, byId, pinnedId, detTop3) {
  const seen = new Set();
  let picks = [];
  for (const p of (Array.isArray(rawPicks) ? rawPicks : [])) {
    if (!p || typeof p.id !== 'string' || !byId.has(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    picks.push(sanitizePick(p, byId.get(p.id)));
  }
  if (pinnedId && byId.has(pinnedId)) {
    picks = picks.filter(p => p.id !== pinnedId);
    picks.unshift(sanitizePick({ id: pinnedId }, byId.get(pinnedId)));
    seen.add(pinnedId);
  }
  for (const id of [...(detTop3 || []), ...byId.keys()]) {
    if (picks.length >= 3) break;
    if (!seen.has(id) && byId.has(id)) { seen.add(id); picks.push(sanitizePick({ id }, byId.get(id))); }
  }
  return picks.slice(0, 3);
}

// Keep the refined prose only when it's clean; otherwise fall back to the catalog
// copy. Drops any pick whose prose smuggled in a digit (the money-stays-client rule).
function sanitizePick(pick, original) {
  let title = typeof pick.title === 'string' ? noDashes(pick.title).trim() : '';
  let body = typeof pick.body === 'string' ? noDashes(pick.body).trim() : '';
  if (!title || /\d/.test(title)) title = original.title;
  if (!body || /\d/.test(body)) body = original.body;
  return { id: pick.id, title, body };
}

// Strip em/en dashes (brand rule). " — " → ", ", bare dash → ", ".
function noDashes(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/\s*[—–]\s*/g, ', ');
}

async function ipRecentCount(ip) {
  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  const resp = await fetch(`${base}/rest/v1/rpc/hunter_ip_recent_count`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_ip: ip, p_minutes: 60 })
  });
  if (!resp.ok) return null;
  return await resp.json(); // returns an integer
}
