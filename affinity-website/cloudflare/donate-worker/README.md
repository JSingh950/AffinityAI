# Affinity 3DC — Donate Scans backend

Cloudflare Worker that backs the **Donate Scans** form on the 3DC page.

- **Contact info / submission metadata** → stored in **D1** (SQLite).
- **The `.e57` files themselves** → stored in **R2** (object storage).
- Large files upload **directly from the browser to R2** via presigned URLs the
  Worker issues, so they never pass through the Worker (which has a ~100 MB
  request-body limit). E57 point clouds are routinely larger than that.

## Architecture

```
Browser form ──POST /api/donate──▶ Worker ──▶ D1 (insert submission + files)
     │                                   └──▶ returns presigned R2 PUT URLs
     ├──PUT file ───────────────────────────▶ R2 (direct, one per file)
     └──POST /api/donate/complete──▶ Worker ──▶ D1 (mark "uploaded")
```

## One-time setup

```bash
cd cloudflare/donate-worker
npm install

# 1. Create the R2 bucket
npx wrangler r2 bucket create affinity-scans

# 2. Create the D1 database, then paste the printed database_id into wrangler.toml
npx wrangler d1 create affinity-donations

# 3. Apply the schema
npx wrangler d1 execute affinity-donations --remote --file=./schema.sql

# 4. Create an R2 API token (Object Read & Write) in the Cloudflare dashboard:
#    R2 → Manage R2 API Tokens → Create API Token
#    Put the Account ID into wrangler.toml (R2_ACCOUNT_ID), then set the secrets:
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY

# 5. Deploy
npx wrangler deploy
```

After deploy, copy the Worker URL (e.g. `https://affinity-donate.<subdomain>.workers.dev`)
into `pages/3dc.html` → the `DONATE_API` constant in the donate-scans script.

## CORS on the R2 bucket (required)

The browser PUTs files cross-origin to `*.r2.cloudflarestorage.com`, so add a CORS
policy to the **affinity-scans** bucket (R2 → bucket → Settings → CORS Policy):

```json
[
  {
    "AllowedOrigins": ["https://affinityai.co", "http://localhost:3000"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

Also set `ALLOWED_ORIGIN` in `wrangler.toml` to your site origin (instead of `*`)
for production.

## Inspecting donations

```bash
# List submissions
npx wrangler d1 execute affinity-donations --remote --command \
  "SELECT firm, name, email, file_count, status, created_at FROM submissions ORDER BY created_at DESC;"

# List stored files
npx wrangler r2 object list affinity-scans --prefix donations/
```

## Notes / future

- Single presigned PUT handles files up to **5 GB**. For larger scans, switch the
  flow to **R2 multipart upload** (the Worker would issue per-part presigned URLs).
- **Matterport "Connect" (phase 2):** add a `/api/matterport/oauth` route that
  completes the Matterport OAuth handshake, lists the firm's models via the Model
  API, and streams their point-cloud / E57 assets into the same `affinity-scans`
  bucket. Requires a registered Matterport developer OAuth integration and (for
  E57 specifically) the E57 export add-on on the firm's models.
