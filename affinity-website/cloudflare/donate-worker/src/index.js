import { AwsClient } from 'aws4fetch';

/**
 * Affinity 3DC — Donate Scans backend (Cloudflare Worker)
 *
 * Stores donor contact info in D1 and issues presigned R2 PUT URLs so the
 * browser uploads large .e57 files directly to R2 (bypassing the Worker's
 * request-body size limit).
 *
 * Bindings (wrangler.toml):   SCANS (R2)   DB (D1)
 * Vars:      R2_ACCOUNT_ID, R2_BUCKET, ALLOWED_ORIGIN
 * Secrets:   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY  (wrangler secret put ...)
 */

const cors = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
});

const json = (data, status, origin) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });

export default {
  async fetch(req, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    const url = new URL(req.url);
    try {
      if (url.pathname === '/api/health') return json({ ok: true }, 200, origin);

      // 1) Submit contact info → store metadata, return presigned upload URLs
      if (url.pathname === '/api/donate' && req.method === 'POST') {
        const body = await req.json();
        const { firm, name, email } = body;
        if (!firm || !name || !email) return json({ error: 'Missing required fields' }, 400, origin);

        const list = Array.isArray(body.files) ? body.files.slice(0, 50) : [];
        if (!list.length) return json({ error: 'No files provided' }, 400, origin);

        const submissionId = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO submissions (id, firm, name, email, phone, notes, file_count, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(submissionId, firm, name, email, body.phone || '', body.notes || '', list.length, 'pending', new Date().toISOString())
          .run();

        const client = new AwsClient({
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
          region: 'auto',
          service: 's3',
        });
        const base = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}`;

        const uploads = [];
        for (const f of list) {
          const safe = (f.name || 'scan.e57').replace(/[^a-zA-Z0-9._-]/g, '_');
          const key = `donations/${submissionId}/${safe}`;
          // Presigned PUT, valid 1 hour. signQuery moves auth into the URL.
          const signed = await client.sign(`${base}/${key}?X-Amz-Expires=3600`, {
            method: 'PUT',
            aws: { signQuery: true },
          });
          uploads.push({ key, uploadUrl: signed.url });
          await env.DB.prepare(
            `INSERT INTO files (submission_id, key, filename, size) VALUES (?, ?, ?, ?)`
          ).bind(submissionId, key, f.name || '', f.size || 0).run();
        }
        return json({ submissionId, uploads }, 200, origin);
      }

      // 2) Mark a submission complete once all files are uploaded
      if (url.pathname === '/api/donate/complete' && req.method === 'POST') {
        const { submissionId } = await req.json();
        if (!submissionId) return json({ error: 'Missing submissionId' }, 400, origin);
        await env.DB.prepare(`UPDATE submissions SET status = ? WHERE id = ?`)
          .bind('uploaded', submissionId)
          .run();
        return json({ ok: true }, 200, origin);
      }

      return json({ error: 'Not found' }, 404, origin);
    } catch (e) {
      return json({ error: e.message || 'Server error' }, 500, origin);
    }
  },
};
