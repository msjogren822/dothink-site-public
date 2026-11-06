// netlify/functions/venice-chat.js
//
// Homepage chat for dothink.in — sibling of netlify/functions/venice-dogify.js,
// same pattern: browser JS calls /.netlify/functions/venice-chat, this function
// reads process.env.VENICE_API_KEY server-side and calls Venice. The key never
// appears in browser code.
//
// WORKING COPY for review at ~/workspace/dothink-desk/venice-chat.js.
// To roll out: copy to netlify/functions/venice-chat.js in
// msjogren822/dothink-site-public and push. Do NOT commit this working copy
// anywhere else.
//
// Model: mistral-small-3-2-24b-instruct — the same Mistral Small 3.2 24B used
// by the site-chat Spudlet fast path (see wp-ai-chat-discord-bridge 0.3.0,
// wpaicdb_venice_model default). Cheap/fast, ~$0.0003/reply at Spudlet volumes.
//
// Private context: NONE of it lives in this file. The repo is public.
// The resume and contact details live in the Neon table `homepage_context`
// (keys: resume, contact_email, contact_phone), queried at request time
// below — same Netlify-provisioned Neon DB as treehouse_trends, via
// @netlify/neon (already in the repo package.json). The env vars
// RESUME_TEXT / CONTACT_EMAIL / CONTACT_PHONE are only a silent fallback
// if the Neon query fails or returns empty (local dev / transition) —
// Neon is the primary source. To update the resume or contact details,
// edit the Neon rows, never this file.
//
// Secrets: none in this file. VENICE_API_KEY and (optionally)
// DISCORD_WEBHOOK_URL come only from process.env (Netlify env vars).
//
// Discord reuse: use the SAME webhook URL the WordPress site-chat plugin
// already uses (stored in WordPress as wpaicdb_webhook_url) — set
// DISCORD_WEBHOOK_URL in Netlify to that same URL. Messages land in the
// same Discord channel/group, labelled differently (see notifyDiscord),
// and session control is the same: session id carried through, first
// visitor message notified once per session.
// The webhook URL itself lives in WordPress / Netlify env vars only —
// it is NOT in this file, and I do not have a copy of it in this workspace.

const VENICE_URL = 'https://api.venice.ai/api/v1/chat/completions';
const MODEL = 'mistral-small-3-2-24b-instruct';
const MAX_TOKENS = 500;
const VENICE_TIMEOUT_MS = 15000;
const DISCORD_TIMEOUT_MS = 5000;

// Neon, same pattern as netlify/functions/treehouse-api.js:
// const { neon } = require('@netlify/neon'); const sql = neon();
// neon() reads NETLIFY_DATABASE_URL from the Netlify environment.
// Guarded: if the Neon env var is absent, neon() throws at construction —
// catch it here so the function still loads and the env-var fallback in
// loadHomepageContext() applies instead of crashing the cold start.
const { neon } = require('@netlify/neon');
let sql = null;
try {
  sql = neon();
} catch (_err) {
  console.error('Neon not configured (NETLIFY_DATABASE_URL missing); using env fallback for homepage context.');
}

// ---------------------------------------------------------------------------
// Homepage context pack (server-side only — never sent to the browser).
// ---------------------------------------------------------------------------
const HOMEPAGE_CONTEXT = `You are the assistant who runs Matthew Sjogren's office at dothink.in while he is out.

The visitor is sitting in a first-person 1980s executive office, in the visitor's chair opposite Matthew's empty leather chair, waiting for him to come in. The desk is the interface: a Newton's cradle to play with, a push-button phone, a legal pad, manila folders, a banker's lamp, and a view of three skylines that should never share a zip code — the Transamerica Pyramid, the Sears (Willis) Tower, and the Empire State Building.

Matthew Sjogren runs dothink.in. This is his digital business card and digital nexus: the site is the central hub, and his assistant (you) handles visitor contact while he is away. Be warm, sharp, playful, and straight-talking. Keep replies short. You are the assistant, not Matthew — never claim to be him, and never claim he is in the room.

=== RESUME ===
Loaded at request time from the Neon table homepage_context (key
'resume'). No resume text, email, or phone number appears in this file
— the repo is public, so nothing personal is committed here. If the
resume is empty, do not invent jobs, employers, or credentials; talk
about Matthew's background only in general terms and offer the contact
form.
=== END RESUME ===`;

// ---------------------------------------------------------------------------
// Homepage context from Neon (primary) with env-var fallback.
// ---------------------------------------------------------------------------
// Loads { resume, contact_email, contact_phone } from homepage_context.
// Returns { source: 'neon' | 'env' | 'none', resume, contact_email,
// contact_phone }. Never throws — a Neon failure falls back silently to
// the env vars, and if those are empty too the bot runs without private
// context (gate + "offer the contact form" behaviour still applies).
async function loadHomepageContext() {
  if (sql) {
    try {
      const rows = await sql`
        SELECT key, value FROM homepage_context
        WHERE key IN ('resume', 'contact_email', 'contact_phone')
      `;
      const byKey = {};
      for (const row of rows || []) byKey[row.key] = row.value;
      if (byKey.resume || byKey.contact_email || byKey.contact_phone) {
        return {
          source: 'neon',
          resume: (byKey.resume || '').trim(),
          contact_email: (byKey.contact_email || '').trim(),
          contact_phone: (byKey.contact_phone || '').trim()
        };
      }
    } catch (err) {
      console.error('Homepage context Neon query failed, using env fallback:', err && err.message);
    }
  }
  const resume = (process.env.RESUME_TEXT || '').trim();
  const contact_email = (process.env.CONTACT_EMAIL || '').trim();
  const contact_phone = (process.env.CONTACT_PHONE || '').trim();
  return {
    source: resume || contact_email || contact_phone ? 'env' : 'none',
    resume,
    contact_email,
    contact_phone
  };
}

function resumeBlock(ctx) {
  if (!ctx.resume) return 'RESUME: not configured. Do not invent resume content.';
  return `RESUME:\n${ctx.resume.slice(0, 8000)}`;
}

// Contact details may be shared only after the contact gate (below) is
// satisfied — this block only puts them in the prompt; the gate decides
// whether the bot reveals them.
function contactDetailsBlock(ctx) {
  const lines = [`Matthew's contact details (share ONLY after the contact gate is satisfied):`];
  if (ctx.contact_email) lines.push(`- Email: ${ctx.contact_email}`);
  else lines.push('- Email: not configured — if asked, offer the contact form instead of inventing an address.');
  if (ctx.contact_phone) lines.push(`- Phone: ${ctx.contact_phone}`);
  else lines.push('- Phone: not configured — if asked, offer the contact form instead of inventing a number.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Contact gate — the core rule. Equivalent of "whom should I say is calling".
// ---------------------------------------------------------------------------
const CONTACT_GATE = `CONTACT RULE — follow it exactly:
- Do NOT give out Matthew's direct email address or phone number until the visitor has FIRST given you their own name AND what they are contacting about (their reason / genuine interest).
- Before that, if asked for contact details, politely ask for their name and what it is about — the equivalent of "whom should I say is calling?"
- You MAY talk about Matthew's background in general terms (from the context above and the resume section, once filled in), and you MAY offer the on-site contact form / this chat as the way to reach him.
- Once the visitor has given their name and reason, you may share his contact details. If you do not have his contact details in your context, say so honestly and offer the contact form instead — never invent an email address or phone number.`;

function systemPrompt(ctx) {
  return HOMEPAGE_CONTEXT + '\n\n' + resumeBlock(ctx) + '\n\n' + CONTACT_GATE + '\n\n' + contactDetailsBlock(ctx);
}

function json(statusCode, body) {
  return { statusCode, body: JSON.stringify(body) };
}

// Fire-and-forget Discord notification for a session's first visitor message.
// Never throws, never logs the webhook URL, never blocks the chat reply.
async function notifyDiscord(webhookUrl, session, firstMessage) {
  try {
    const excerpt = String(firstMessage || '').slice(0, 300);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DISCORD_TIMEOUT_MS);
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Same webhook / channel as the WordPress site chat, labelled
          // differently so the two are easy to tell apart in Discord.
          username: 'dothink.in — homepage chat',
          content:
            `[homepage chat — dothink.in] New chat — session \`${session}\`\n` +
            `First message: ${excerpt || '(empty)'}`
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (_err) {
    // Discord is best-effort only. A failed notification must never surface
    // to the visitor or fail the chat reply.
  }
}

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { ok: false, error: 'Method not allowed' });
    }

    if (!process.env.VENICE_API_KEY) {
      return json(500, { ok: false, error: 'Venice API key not configured' });
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (_err) {
      return json(400, { ok: false, error: 'Invalid JSON body' });
    }

    const session = String(body.session || 'dothink.in').slice(0, 80);
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    // Keep only well-formed user/assistant turns, last 10, content capped.
    const history = incoming
      .filter(
        (m) =>
          m &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string' &&
          m.content.trim().length > 0
      )
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

    if (history.length === 0 || history[history.length - 1].role !== 'user') {
      return json(400, { ok: false, error: 'Missing user message' });
    }

    // Private context from Neon (primary) / env vars (fallback), loaded
    // per request so a Neon edit takes effect without redeploying.
    // Log lengths only — never the resume or contact values themselves.
    const ctx = await loadHomepageContext();
    console.log(
      'Homepage context source:', ctx.source,
      'resume chars:', ctx.resume.length,
      'email set:', Boolean(ctx.contact_email),
      'phone set:', Boolean(ctx.contact_phone)
    );

    const messages = [{ role: 'system', content: systemPrompt(ctx) }, ...history];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VENICE_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(VENICE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.VENICE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          max_tokens: MAX_TOKENS
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      console.error('Venice chat error:', MODEL, response.status);
      return json(502, { ok: false, error: 'Chat service unavailable' });
    }

    const result = await response.json();
    const reply = result.choices?.[0]?.message?.content || '';
    if (!reply) {
      return json(502, { ok: false, error: 'Chat service unavailable' });
    }

    // Discord: only on the first visitor message of a session (stateless
    // function, so "first" means the client sent a single-message history).
    // Skipped silently when DISCORD_WEBHOOK_URL is not configured.
    if (process.env.DISCORD_WEBHOOK_URL && history.length === 1) {
      await notifyDiscord(
        process.env.DISCORD_WEBHOOK_URL,
        session,
        history[0].content
      );
    }

    return json(200, { ok: true, reply, model: MODEL, session });
  } catch (err) {
    console.error('Venice chat function error:', err && err.message);
    return json(500, { ok: false, error: 'Unexpected chat error' });
  }
};
