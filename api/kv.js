import { Redis } from '@upstash/redis';

// Works with the env var names Vercel's Marketplace Redis integration uses
// (KV_REST_API_URL / KV_REST_API_TOKEN) or a manually-connected Upstash
// account (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) — whichever
// pair you end up with after connecting a Redis database to this project.
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Optional shared-passcode gate. If you set an APP_PASSCODE environment
// variable in your Vercel project, every request must send it back as the
// `x-app-key` header or it's rejected with 401. If you never set that env
// var, this check is skipped entirely and the API is open to anyone who has
// the URL (fine for a private, unguessable link; add the passcode if you
// want a real lock on it).
function isAuthorized(req) {
  const required = process.env.APP_PASSCODE;
  if (!required) return true;
  return req.headers['x-app-key'] === required;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const { key } = req.query;
      if (!key) return res.status(400).json({ error: 'missing key' });
      const value = await redis.get(key);
      if (value === null || value === undefined) {
        return res.status(404).json({ error: 'not found' });
      }
      return res.status(200).json({ key, value });
    }

    if (req.method === 'POST') {
      const { key, value } = req.body || {};
      if (!key) return res.status(400).json({ error: 'missing key' });
      await redis.set(key, value);
      return res.status(200).json({ key, value });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
