import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'ourlittlecorner';


let cached = global._mongo;
if (!cached) cached = global._mongo = { promise: null };

async function getCollection() {
  if (!cached.promise) {
    cached.promise = MongoClient.connect(uri);
  }
  const client = await cached.promise;
  return client.db(dbName).collection('kv');
}

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
    const col = await getCollection();

    if (req.method === 'GET') {
      const { key } = req.query;
      if (!key) return res.status(400).json({ error: 'missing key' });
      const doc = await col.findOne({ _id: key });
      if (!doc) return res.status(404).json({ error: 'not found' });
      return res.status(200).json({ key, value: doc.value });
    }

    if (req.method === 'POST') {
      const { key, value } = req.body || {};
      if (!key) return res.status(400).json({ error: 'missing key' });
      await col.updateOne({ _id: key }, { $set: { value } }, { upsert: true });
      return res.status(200).json({ key, value });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
