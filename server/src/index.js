/**
 * The report server.
 *
 * F10 > Report a problem posts its zip to POST /reports; anyone may, since
 * the extension's users have no account. The zip waits in R2 until
 * scripts/pull-reports.js lists it, downloads it and deletes it.
 *
 *   POST   /reports       the zip as the body; answers 201 { id }
 *   GET    /reports       { reports: [{ id, size, uploaded }] }   token
 *   GET    /reports/<id>  the zip                                 token
 *   DELETE /reports/<id>                                          token
 *
 * The token is a password: Authorization: Bearer <PULL_TOKEN>, where
 * PULL_TOKEN is a wrangler secret (64 random bytes, see README). A missing or
 * wrong token gets the same 404 as an address that does not exist.
 */

const MAX_BYTES = 25 * 1024 * 1024;
const MIN_TOKEN_LENGTH = 64;
const ID = /^tui-report-[\w-]+\.zip$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

const notFound = () => new Response('Not found', { status: 404 });

async function sha256(text) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
}

/** Whether the request carries the token. Hashed first, so both sides are the same length. */
async function authorized(request, env) {
  const secret = env.PULL_TOKEN || '';
  if (secret.length < MIN_TOKEN_LENGTH) return false;
  const given = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!given) return false;
  return crypto.subtle.timingSafeEqual(await sha256(given), await sha256(secret));
}

async function upload(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const { success } = await env.UPLOADS.limit({ key: ip });
  if (!success) return json({ error: 'Too many reports, try again in a minute.' }, 429, CORS);

  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) {
    return json({ error: 'The report is too large.' }, 413, CORS);
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return json({ error: 'The report is too large.' }, 413, CORS);
  const head = new Uint8Array(body, 0, Math.min(4, body.byteLength));
  if (head.length < 4 || head[0] !== 0x50 || head[1] !== 0x4b || head[2] !== 0x03 || head[3] !== 0x04) {
    return json({ error: 'Not a report.' }, 400, CORS);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const id = `tui-report-${stamp}-${crypto.randomUUID().slice(0, 6)}.zip`;
  await env.REPORTS.put(id, body, { httpMetadata: { contentType: 'application/zip' } });
  return json({ id }, 201, CORS);
}

async function list(env) {
  const reports = [];
  let cursor;
  do {
    const page = await env.REPORTS.list({ cursor });
    for (const o of page.objects) reports.push({ id: o.key, size: o.size, uploaded: o.uploaded });
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return json({ reports });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'reports' || parts.length > 2) return notFound();
    const id = parts[1];

    if (request.method === 'OPTIONS' && !id) return new Response(null, { status: 204, headers: CORS });
    if (request.method === 'POST' && !id) return upload(request, env);

    if (!(await authorized(request, env))) return notFound();
    if (request.method === 'GET' && !id) return list(env);
    if (!id || !ID.test(id)) return notFound();
    if (request.method === 'GET') {
      const object = await env.REPORTS.get(id);
      if (!object) return notFound();
      return new Response(object.body, {
        headers: { 'Content-Type': 'application/zip', 'Content-Length': String(object.size) }
      });
    }
    if (request.method === 'DELETE') {
      await env.REPORTS.delete(id);
      return new Response(null, { status: 204 });
    }
    return notFound();
  }
};
