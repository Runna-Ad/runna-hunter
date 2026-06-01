import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, company, email, phone, message, market } = req.body || {};

  if (!name || !company || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,   // pedro@runnareach.com
      pass: process.env.GMAIL_PASS    // 16-char App Password from Google
    }
  });

  const isCA   = market === 'ca';
  const flag   = isCA ? '🇨🇦' : '🇲🇽';
  const subject = isCA
    ? `New contact: ${name} — ${company} [CA]`
    : `Nuevo contacto: ${name} — ${company} [MX]`;

  try {
    await transporter.sendMail({
      from:    `"Rünna Hunter" <${process.env.GMAIL_USER}>`,
      to:      'nils@runna.com.mx, pedro@runnareach.com',
      replyTo: email,
      subject,
      html:    buildEmailHtml({ name, company, email, phone, message, market, isCA, flag, subject })
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Email error:', err);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}

/* ── Branded HTML email ─────────────────────────────────── */
function buildEmailHtml({ name, company, email, phone, message, market, isCA, flag, subject }) {
  const marketLabel = isCA ? 'Canada' : 'México';
  const row = (label, value, link) => `
    <tr>
      <td style="padding:11px 16px;border-bottom:1px solid rgba(119,92,191,0.10);background:#13112a;">
        <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:0.10em;color:#775cbf;font-weight:700;">${label}</p>
        <p style="margin:5px 0 0;font-size:15px;color:#f5f3fa;font-weight:500;">
          ${link ? `<a href="${link}" style="color:#b09de8;text-decoration:none;">${e(value)}</a>` : e(value)}
        </p>
      </td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0d1e;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0d1e;padding:36px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <!-- Header bar -->
  <tr><td style="background:linear-gradient(135deg,#775cbf 0%,#de5a5f 100%);border-radius:16px 16px 0 0;padding:26px 28px;">
    <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.65);font-weight:600;">RÜNNA INEFFICIENCY HUNTER</p>
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.01em;">
      New inquiry ${flag}
    </h1>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#1a1836;border-radius:0 0 16px 16px;padding:28px;">

    <!-- Contact rows -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px;overflow:hidden;margin-bottom:22px;">
      ${row('Name', name)}
      ${row('Company', company)}
      ${row('Email', email, `mailto:${e(email)}`)}
      ${phone ? row('Phone', phone) : ''}
      ${row('Market', `${flag} ${marketLabel}`)}
    </table>

    <!-- Message block -->
    ${message ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="background:#13112a;border-left:3px solid #775cbf;border-radius:8px;padding:14px 16px;">
        <p style="margin:0 0 7px;font-size:10px;text-transform:uppercase;letter-spacing:0.10em;color:#775cbf;font-weight:700;">Their challenge</p>
        <p style="margin:0;font-size:14px;color:#c4b8e8;line-height:1.7;">${e(message)}</p>
      </td></tr>
    </table>` : ''}

    <!-- Reply CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
      <tr><td align="center">
        <a href="mailto:${e(email)}?subject=Re:%20${encodeURIComponent(subject)}"
           style="display:inline-block;background:linear-gradient(135deg,#775cbf,#de5a5f);color:#fff;padding:13px 30px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.01em;">
          Reply to ${e(name)} →
        </a>
      </td></tr>
    </table>

    <p style="margin:0;font-size:11px;color:rgba(245,243,250,0.25);text-align:center;letter-spacing:0.02em;">
      Sent from Rünna Inefficiency Hunter · runna-hunter.vercel.app
    </p>

  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function e(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
