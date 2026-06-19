import { AwsClient } from 'aws4fetch';

/**
 * Affinity 3DC — Donate Scans backend (Cloudflare Worker)
 *
 * Stores donor contact info in D1 and drives a direct-to-R2 multipart upload so
 * the browser uploads large .e57 files in parts, bypassing the Worker's
 * request-body size limit and the 5 GB single-PUT cap.
 *
 * Flow:
 *   POST /api/donate          → store metadata; for each file, start a multipart
 *                               upload and return presigned PUT URLs (one/part).
 *   PUT  <part url>           → browser uploads each part directly to R2,
 *                               reading the ETag from the response.
 *   POST /api/donate/complete-file → Worker calls CompleteMultipartUpload.
 *   POST /api/donate/abort-file    → Worker aborts a multipart upload (cleanup).
 *   POST /api/donate/complete      → mark the whole submission "uploaded".
 *
 * Bindings (wrangler.toml):   SCANS (R2)   DB (D1)
 * Vars:      R2_ACCOUNT_ID, R2_BUCKET, ALLOWED_ORIGIN
 * Secrets:   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY  (wrangler secret put ...)
 */

// 100 MB parts: a 5 GB scan = 50 parts, well under R2's 10,000-part limit.
const PART_SIZE = 100 * 1024 * 1024;

// Reject any single file larger than this (anti-abuse; generous for real scans).
const MAX_FILE_BYTES = 50 * 1024 * 1024 * 1024; // 50 GB

const cors = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Vary': 'Origin',
});

// Pick the request's Origin if it's in the allowlist, else the first allowed
// origin (so disallowed callers get a header that won't match → blocked).
const resolveOrigin = (req, env) => {
  const allowed = (env.ALLOWED_ORIGIN || '*').split(',').map((s) => s.trim());
  if (allowed.includes('*')) return '*';
  const reqOrigin = req.headers.get('Origin');
  return allowed.includes(reqOrigin) ? reqOrigin : allowed[0];
};

const json = (data, status, origin) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });

const r2Client = (env) =>
  new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    region: 'auto',
    service: 's3',
  });

const objectUrl = (env, key) =>
  `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`;

export default {
  async fetch(req, env) {
    const origin = resolveOrigin(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    const url = new URL(req.url);
    try {
      if (url.pathname === '/api/health') return json({ ok: true }, 200, origin);

      // Public: number of individual scan files that fully uploaded.
      if (url.pathname === '/api/donate/count' && req.method === 'GET') {
        const row = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM files WHERE status = 'uploaded'`
        ).first();
        return json({ count: row?.n || 0 }, 200, origin);
      }

      // Admin: list files that did NOT fully upload, so you know what to chase.
      // Guarded by the ADMIN_TOKEN secret (?token=… or X-Admin-Token header).
      if (url.pathname === '/api/donate/incomplete' && req.method === 'GET') {
        const token = url.searchParams.get('token') || req.headers.get('X-Admin-Token');
        if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN)
          return json({ error: 'Unauthorized' }, 401, origin);
        const { results } = await env.DB.prepare(
          `SELECT f.filename, f.key, f.size, f.status,
                  s.id AS submission_id, s.firm, s.name, s.email, s.created_at
             FROM files f
             JOIN submissions s ON f.submission_id = s.id
            WHERE f.status != 'uploaded'
            ORDER BY s.created_at DESC, f.filename`
        ).all();
        return json({ count: results.length, files: results }, 200, origin);
      }

      // 1) Submit contact info → store metadata, start a multipart upload per
      //    file, and return presigned PUT URLs for every part.
      if (url.pathname === '/api/donate' && req.method === 'POST') {
        const body = await req.json();
        const { firm, name, email } = body;
        if (!firm || !name || !email) return json({ error: 'Missing required fields' }, 400, origin);

        const list = Array.isArray(body.files) ? body.files.slice(0, 50) : [];
        if (!list.length) return json({ error: 'No files provided' }, 400, origin);

        const tooBig = list.find((f) => Number(f.size) > MAX_FILE_BYTES);
        if (tooBig) return json({ error: `${tooBig.name || 'A file'} exceeds the 50 GB per-file limit` }, 400, origin);

        const submissionId = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO submissions (id, firm, name, email, phone, notes, file_count, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(submissionId, firm, name, email, body.phone || '', body.notes || '', list.length, 'pending', new Date().toISOString())
          .run();

        const client = r2Client(env);
        const uploads = [];
        for (const f of list) {
          const safe = (f.name || 'scan.e57').replace(/[^a-zA-Z0-9._-]/g, '_');
          const key = `donations/${submissionId}/${safe}`;
          const size = Number(f.size) || 0;

          // Start the multipart upload (server-side, authenticated).
          const initRes = await client.fetch(`${objectUrl(env, key)}?uploads`, { method: 'POST' });
          if (!initRes.ok) throw new Error(`Could not start upload (${initRes.status})`);
          const initXml = await initRes.text();
          const uploadId = (initXml.match(/<UploadId>([^<]+)<\/UploadId>/) || [])[1];
          if (!uploadId) throw new Error('No UploadId returned by R2');

          // One presigned PUT per part. signQuery moves auth into the URL.
          const partCount = Math.max(1, Math.ceil(size / PART_SIZE));
          const parts = [];
          for (let n = 1; n <= partCount; n++) {
            const signed = await client.sign(
              `${objectUrl(env, key)}?partNumber=${n}&uploadId=${encodeURIComponent(uploadId)}&X-Amz-Expires=3600`,
              { method: 'PUT', aws: { signQuery: true } }
            );
            parts.push({ partNumber: n, url: signed.url });
          }

          uploads.push({ key, uploadId, partSize: PART_SIZE, parts });
          await env.DB.prepare(
            `INSERT INTO files (submission_id, key, filename, size) VALUES (?, ?, ?, ?)`
          ).bind(submissionId, key, f.name || '', size).run();
        }
        return json({ submissionId, uploads }, 200, origin);
      }

      // 2) Finalize one file: combine the uploaded parts into the object.
      if (url.pathname === '/api/donate/complete-file' && req.method === 'POST') {
        const { key, uploadId, parts } = await req.json();
        if (!key || !uploadId || !Array.isArray(parts) || !parts.length)
          return json({ error: 'Missing key, uploadId, or parts' }, 400, origin);

        const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
        const xml =
          '<CompleteMultipartUpload>' +
          ordered.map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`).join('') +
          '</CompleteMultipartUpload>';

        const res = await r2Client(env).fetch(`${objectUrl(env, key)}?uploadId=${encodeURIComponent(uploadId)}`, {
          method: 'POST',
          body: xml,
          headers: { 'Content-Type': 'application/xml' },
        });
        if (!res.ok) return json({ error: `Complete failed (${res.status})` }, 502, origin);

        // Mark this file uploaded so it counts and drops out of /incomplete.
        await env.DB.prepare(
          `UPDATE files SET status = 'uploaded', completed_at = ? WHERE key = ?`
        ).bind(new Date().toISOString(), key).run();
        return json({ ok: true }, 200, origin);
      }

      // 3) Abort one file's multipart upload (best-effort cleanup on failure)
      //    and flag the file 'failed' so it shows up in /incomplete.
      if (url.pathname === '/api/donate/abort-file' && req.method === 'POST') {
        const { key, uploadId } = await req.json();
        if (!key || !uploadId) return json({ error: 'Missing key or uploadId' }, 400, origin);
        await r2Client(env).fetch(`${objectUrl(env, key)}?uploadId=${encodeURIComponent(uploadId)}`, { method: 'DELETE' });
        await env.DB.prepare(`UPDATE files SET status = 'failed' WHERE key = ?`).bind(key).run();
        return json({ ok: true }, 200, origin);
      }

      // 4) Close out a submission: 'uploaded' if every file made it, else 'partial'.
      if (url.pathname === '/api/donate/complete' && req.method === 'POST') {
        const { submissionId } = await req.json();
        if (!submissionId) return json({ error: 'Missing submissionId' }, 400, origin);
        const row = await env.DB.prepare(
          `SELECT COUNT(*) AS pending FROM files
            WHERE submission_id = ? AND status != 'uploaded'`
        ).bind(submissionId).first();
        const status = (row?.pending || 0) === 0 ? 'uploaded' : 'partial';
        await env.DB.prepare(`UPDATE submissions SET status = ? WHERE id = ?`)
          .bind(status, submissionId)
          .run();
        return json({ ok: true, status }, 200, origin);
      }

      return json({ error: 'Not found' }, 404, origin);
    } catch (e) {
      return json({ error: e.message || 'Server error' }, 500, origin);
    }
  },
};
