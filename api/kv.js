import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'ourlittlecorner';

let cached = global._mongo;
if (!cached) cached = global._mongo = { promise: null };

async function getCollection() {
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Add it in Vercel > Settings > Environment Variables, then redeploy.'
    );
  }
  if (!cached.promise) {
    // If the first connection fails, don't keep handing out the rejected
    // promise forever -- clear it so the next request retries.
    cached.promise = MongoClient.connect(uri).catch((err) => {
      cached.promise = null;
      throw err;
    });
  }
  const client = await cached.promise;
  return client.db(dbName).collection('kv');
}

function isAuthorized(req) {
  const required = process.env.APP_PASSCODE;
  if (!required) return true;
  return req.headers['x-app-key'] === required;
}

// patch paths look like "A.checkin" or "moodPack.B" -- letters, digits,
// underscores and dots only. Anything else is rejected.
const SAFE_PATH = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/;

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const col = await getCollection();

    if (req.method === 'GET') {
      const { key, keys } = req.query;

      // change check: /api/kv?meta=day:2026-09-10,settings
      // Returns only a revision number per key -- a few dozen bytes -- so the
      // app can poll every few seconds without re-downloading photos.
      const { meta } = req.query;
      if (meta) {
        const list = String(meta).split(',').filter(Boolean).slice(0, 40);
        const docs = await col
          .find({ _id: { $in: list } })
          .project({ rev: 1 })
          .toArray();
        const revs = {};
        for (const d of docs) revs[d._id] = d.rev || 0;
        return res.status(200).json({ revs });
      }

      // batch read: /api/kv?keys=day:2026-09-10,day:2026-09-09
      if (keys) {
        const list = String(keys).split(',').filter(Boolean).slice(0, 40);
        const docs = await col.find({ _id: { $in: list } }).toArray();
        const values = {};
        for (const d of docs) values[d._id] = d.value;
        return res.status(200).json({ values });
      }

      if (!key) return res.status(400).json({ error: 'missing key' });
      const doc = await col.findOne({ _id: key });
      if (!doc) return res.status(404).json({ error: 'not found' });
      return res.status(200).json({ key, value: doc.value, rev: doc.rev || 0 });
    }

    if (req.method === 'POST') {
      const { key, value, patch } = parseBody(req);
      if (!key) return res.status(400).json({ error: 'missing key' });

      // Partial write: only touches the given fields, so two people writing
      // to the same day/settings record can't erase each other's data.
      if (patch && typeof patch === 'object') {
        const $set = {};
        for (const [path, v] of Object.entries(patch)) {
          if (!SAFE_PATH.test(path)) {
            return res.status(400).json({ error: 'bad patch path: ' + path });
          }
          $set['value.' + path] = v;
        }
        if (!Object.keys($set).length) {
          return res.status(400).json({ error: 'empty patch' });
        }
        await col.updateOne({ _id: key }, { $set, $inc: { rev: 1 } }, { upsert: true });
        const doc = await col.findOne({ _id: key });
        return res.status(200).json({
          key,
          value: doc ? doc.value : null,
          rev: doc ? doc.rev : 0
        });
      }

      // Full write (still used for first-time creation).
      if (value === undefined) return res.status(400).json({ error: 'missing value' });
      await col.updateOne({ _id: key }, { $set: { value }, $inc: { rev: 1 } }, { upsert: true });
      const saved = await col.findOne({ _id: key });
      return res.status(200).json({ key, value, rev: saved ? saved.rev : 1 });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error('kv error:', e);
    return res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}
