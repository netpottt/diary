/**
 * Downloads every photo out of the diary database as real .jpg files.
 *
 *   1. npm install
 *   2. set MONGODB_URI (see below)
 *   3. node scripts/export-photos.js
 *
 * Photos land in ./export, named like:
 *   2026-09-10_0812_Winnie_checkin.jpg
 *   2026-09-10_1247_Topten_lunch.jpg
 *
 * The 4 digits are the time it was taken, in your shared time zone. Each
 * file's "date modified" is set to that moment too, so Windows Explorer and
 * Photos sort them correctly and show the real date.
 *
 * Windows PowerShell:  $env:MONGODB_URI="mongodb+srv://..."
 * Mac/Linux:           export MONGODB_URI="mongodb+srv://..."
 */
import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'ourlittlecorner';
const outDir = process.env.EXPORT_DIR || 'export';

if (!uri) {
  console.error('MONGODB_URI is not set. See the comment at the top of this file.');
  process.exit(1);
}

function decode(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:image/') || comma === -1) return null;
  return Buffer.from(dataUrl.slice(comma + 1), 'base64');
}

// Strip anything a filesystem would object to.
const safe = (s) => String(s).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40) || 'unnamed';

// "2026-09-10T00:47:12.000Z" -> "0847" in the couple's shared time zone.
function clockLabel(iso, tz) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
    }).format(d).replace(':', '');
  } catch {
    return null;
  }
}

const client = await MongoClient.connect(uri);
try {
  const col = client.db(dbName).collection('kv');

  const settingsDoc = await col.findOne({ _id: 'settings' });
  const stored = (settingsDoc && settingsDoc.value) || {};
  const names = stored.names || { A: 'A', B: 'B' };
  const tz = stored.timeZone || 'UTC';
  console.log(`Times shown in ${tz}`);

  fs.mkdirSync(outDir, { recursive: true });

  const days = await col.find({ _id: { $regex: '^day:' } }).sort({ _id: 1 }).toArray();
  let written = 0, bytes = 0, skipped = 0;

  for (const doc of days) {
    const date = doc._id.slice(4);
    const day = doc.value || {};

    for (const side of ['A', 'B']) {
      const entry = day[side];
      if (!entry) continue;
      const who = safe(names[side] || side);

      const shots = [['checkin', entry.checkin, entry.checkinTime]];
      if (entry.food) {
        for (const meal of ['lunch', 'dinner']) {
          const item = entry.food[meal];
          if (item) shots.push([meal, item.img, item.time]);
        }
      }

      for (const [label, dataUrl, iso] of shots) {
        const buf = decode(dataUrl);
        if (!buf) continue;

        // Photos saved before timestamps existed just get no clock in the name.
        const clock = clockLabel(iso, tz);
        const stem = clock ? `${date}_${clock}_${who}_${label}` : `${date}_${who}_${label}`;
        const file = path.join(outDir, `${stem}.jpg`);

        if (fs.existsSync(file)) { skipped++; continue; }   // safe to re-run
        fs.writeFileSync(file, buf);

        // Make the file's own date match when the photo was taken.
        if (iso) {
          const when = new Date(iso);
          if (!isNaN(when.getTime())) fs.utimesSync(file, when, when);
        }

        written++; bytes += buf.length;
      }
    }
  }

  console.log(`${written} photo(s) written to ./${outDir} (${(bytes / 1048576).toFixed(1)} MB)`);
  if (skipped) console.log(`${skipped} already existed, left alone`);
  if (!days.length) console.log('No day records found — is MONGODB_DB right?');
} finally {
  await client.close();
}
