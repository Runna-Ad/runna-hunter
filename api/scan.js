import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * /api/scan
 * 1. (Optional) SSRF-safe fetch of the prospect's website → deterministic signals
 * 2. Logs the full scan (inputs + signals + results) to Supabase (anon insert-only)
 * No LLM. All signal claims are factual / verifiable.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    scanId, market, industry, teamSize, timesink, tools,
    websiteUrl, results
  } = req.body || {};

  // 1 ── Website signals (best-effort; never throws to the client)
  let signals = null;
  if (websiteUrl && typeof websiteUrl === 'string') {
    signals = await safeAnalyze(websiteUrl.trim());
  }

  // 2. Log to Supabase. Must AWAIT (a serverless function is frozen once it
  //    responds, so a non-awaited insert gets killed before it completes.
  //      A logging failure must never break the user-facing response.
  try {
    await logScan({
      id: scanId, market, industry, teamSize, timesink, tools,
      websiteUrl, signals, results,
      ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null,
      userAgent: req.headers['user-agent'] || null
    });
  } catch (err) {
    console.error('Supabase log error:', err?.message);
  }

  return res.status(200).json({ ok: true, signals });
}

/* ── SSRF-safe website analysis ─────────────────────────── */
async function safeAnalyze(rawUrl) {
  let url;
  try {
    if (!/^https?:\/\//i.test(rawUrl)) rawUrl = 'https://' + rawUrl;
    url = new URL(rawUrl);
  } catch {
    return { reachable: false, reason: 'invalid_url' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { reachable: false, reason: 'bad_protocol' };
  }

  // Block private / loopback / link-local / metadata addresses
  const host = url.hostname;
  if (isBlockedHost(host)) return { reachable: false, reason: 'blocked_host' };
  try {
    const addrs = await dns.lookup(host, { all: true });
    if (addrs.some(a => isPrivateIp(a.address))) {
      return { reachable: false, reason: 'private_ip' };
    }
  } catch {
    return { reachable: false, reason: 'dns_failed' };
  }

  // Fetch with timeout + size cap
  let html = '';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'RunnaHunterBot/1.0 (+https://runna-hunter.vercel.app)' }
    });
    clearTimeout(timer);
    if (!resp.ok) return { reachable: false, reason: 'http_' + resp.status };

    const reader = resp.body?.getReader?.();
    if (reader) {
      const dec = new TextDecoder();
      let bytes = 0;
      const MAX = 600_000; // ~600KB cap
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        html += dec.decode(value, { stream: true });
        if (bytes > MAX) { try { await reader.cancel(); } catch {} break; }
      }
    } else {
      html = (await resp.text()).slice(0, 600_000);
    }
  } catch {
    return { reachable: false, reason: 'fetch_failed' };
  }

  return extractSignals(html);
}

function extractSignals(html) {
  const h = html.toLowerCase();
  const has = re => re.test(h);

  return {
    reachable: true,
    metaPixel:    has(/fbq\(|connect\.facebook\.net\/[^"']*fbevents/),
    analytics:    has(/gtag\(|googletagmanager\.com|google-analytics\.com|\bg-[a-z0-9]{6,}\b|\bua-\d{4,}/),
    tiktokPixel:  has(/analytics\.tiktok\.com|ttq\.(load|track)/),
    emailCapture: has(/klaviyo|mailchimp|list-manage\.com|mc-embedded|type=["']email["']|name=["']email["']/),
    social: {
      instagram: has(/instagram\.com\//),
      facebook:  has(/facebook\.com\//),
      tiktok:    has(/tiktok\.com\//),
      linkedin:  has(/linkedin\.com\//),
      youtube:   has(/youtube\.com\/|youtu\.be\//)
    },
    seo: {
      ogTags:          has(/property=["']og:/),
      metaDescription: has(/name=["']description["']/),
      title:           has(/<title[^>]*>[^<]{3,}/)
    },
    mobileViewport: has(/name=["']viewport["']/)
  };
}

/* ── IP / host blocklist helpers ────────────────────────── */
function isBlockedHost(host) {
  const h = host.toLowerCase();
  return (
    h === 'localhost' || h.endsWith('.localhost') ||
    h === 'metadata.google.internal' ||
    h.endsWith('.internal') || h.endsWith('.local')
  );
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||           // link-local + AWS/GCP metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)    // CGNAT
    );
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    return (
      x === '::1' || x === '::' ||
      x.startsWith('fc') || x.startsWith('fd') ||  // unique local
      x.startsWith('fe80') ||                       // link-local
      x.startsWith('::ffff:')                       // IPv4-mapped (re-check upstream)
    );
  }
  return false;
}

/* ── Supabase insert (anon, insert-only RLS) ────────────── */
async function logScan(row) {
  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return; // not configured → skip silently

  const resp = await fetch(`${base}/rest/v1/hunter_scans`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      ...(row.id ? { id: row.id } : {}),
      market:     row.market || null,
      industry:   row.industry || null,
      team_size:  row.teamSize || null,
      timesink:   row.timesink || null,
      tools:      Array.isArray(row.tools) ? row.tools : [],
      website_url: row.websiteUrl || null,
      signals:    row.signals || null,
      results:    row.results || null,
      ip:         row.ip,
      user_agent: row.userAgent
    })
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    console.error('[logScan] insert failed', resp.status, body.slice(0, 300));
  }
}
