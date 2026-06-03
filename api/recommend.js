import Anthropic from '@anthropic-ai/sdk';
import { CATALOG } from './_catalog.js';

/**
 * /api/recommend  (Phase 2 — AI solution-mapping)
 * Maps the prospect's deterministic findings to real Rünna offerings + writes a
 * personalized "game plan", constrained to the catalog. Claude Sonnet 4.6.
 * Any failure returns ok:false so the client gracefully omits the layer.
 */
const MODEL = 'claude-sonnet-4-6';
const RATE_LIMIT_PER_HOUR = 30; // per IP, enforced via security-definer RPC

const VALID_INDUSTRIES = new Set([
  'ecommerce','restaurant','realestate','proservices','retail',
  'automotive','fitness','hospitality','trades','other'
]);

const OFFERINGS = [
  'AI Enhancements','Unlimited Design','Digital Media Ads',
  'Social Media Management','Package Design','Website & Web Platforms'
];

const SCHEMA = {
  type: 'object',
  properties: {
    gamePlan: {
      type: 'string',
      description: '2-3 sentence personalized close addressed to the prospect, tying their situation to how Rünna would help. Benchmark-framed, never a false claim about them.'
    },
    pairings: {
      type: 'array',
      description: 'One entry per finding, in order. Maps each finding to the single best-fit Rünna offering.',
      items: {
        type: 'object',
        properties: {
          findingTitle: { type: 'string', description: 'Echo the finding title verbatim.' },
          offering: { type: 'string', enum: OFFERINGS, description: 'The single best-fit offering (must be one of the catalog names).' },
          pitch: { type: 'string', description: 'One compelling sentence: the specific system Rünna would build them for this gap. Uses a proof point from the catalog when natural. No invented metrics.' }
        },
        required: ['findingTitle','offering','pitch'],
        additionalProperties: false
      }
    }
  },
  required: ['gamePlan','pairings'],
  additionalProperties: false
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

  const { market, industry, teamSize, timesink, tools, signals, findings } = req.body || {};

  // ── Validation (cheap bot/garbage guard before any LLM spend)
  if (!industry || !VALID_INDUSTRIES.has(industry)) return res.status(400).json({ ok: false, error: 'bad_industry' });
  if (!Array.isArray(findings) || findings.length === 0) return res.status(400).json({ ok: false, error: 'no_findings' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ ok: false, error: 'not_configured' });

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

  const system = [
    {
      type: 'text',
      text:
`You are Rünna's senior strategist. Rünna is a creative + AI agency serving Mexico and Canada.
A prospect just ran our diagnostic. You will map each finding to the single best-fit Rünna
offering and write a short, compelling, personalized "game plan".

HARD RULES:
- ONLY recommend offerings from the catalog below. Never invent a service.
- Never invent metrics, proof points, client names, or timelines. Use ONLY catalog proof.
- Only the "AI Enhancements" offering may mention a timeline ("4–8 weeks"). No other offering mentions timing.
- Stay benchmark-framed. State a website-signal fact only if it is given to you as detected/not-detected. Never assert anything else about the prospect's specific setup.
- Pick exactly ONE offering per finding — the best fit. Two findings may map to the same offering if that is genuinely best.
- Be specific and confident, not generic. Make the pairing read naturally even when it is not a perfect 1:1.
- NEVER use em dashes (—) or en dashes (–). Use commas, colons, or periods instead. This is a strict brand rule.
- Write everything in ${lang}.`
    },
    {
      type: 'text',
      text: CATALOG,
      cache_control: { type: 'ephemeral' } // large stable block — cache it
    }
  ];

  const userPayload = {
    market: isCA ? 'Canada' : 'Mexico',
    industry, teamSize, timesink,
    toolsTheyUse: Array.isArray(tools) ? tools : [],
    websiteSignals: signals || null,
    findings: findings.map(f => ({ title: f.title, solution: f.solution, monthlyImpact: f.amount, frame: f.frame }))
  };

  try {
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system,
      messages: [{
        role: 'user',
        content:
`Here is the prospect's diagnostic. Map each finding to the best Rünna offering and write the game plan.

${JSON.stringify(userPayload, null, 2)}`
      }]
    });

    const text = (resp.content || []).find(b => b.type === 'text')?.text || '';
    const recommendation = JSON.parse(text);

    // Defensive: drop any pairing whose offering somehow isn't in the catalog
    recommendation.pairings = (recommendation.pairings || [])
      .filter(p => OFFERINGS.includes(p.offering))
      .map(p => ({ ...p, pitch: noDashes(p.pitch) }));
    recommendation.gamePlan = noDashes(recommendation.gamePlan);

    return res.status(200).json({ ok: true, recommendation });
  } catch (err) {
    console.error('recommend error:', err?.message);
    return res.status(200).json({ ok: false, error: 'generation_failed' });
  }
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
