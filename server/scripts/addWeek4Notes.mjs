import 'dotenv/config';
import mongoose from 'mongoose';

const URL = 'https://claude.ai/artifact/HchHFU6dpMdg7MyuEtNMpu';
const NAME = 'Week 4 teacher notes';

await mongoose.connect(process.env.MONGODB_URI);
const col = mongoose.connection.collection('lms_programs');
const p = await col.findOne({ title: /Generalist/i });
if (!p) throw new Error('no Generalist programme');
const mod = p.modules.find((m) => /week\s*0?4\b/i.test(m.title));
if (!mod) throw new Error('no Week 4 module: ' + p.modules.map((m) => m.title).join(' | '));
console.log('Programme:', p.title, '| Module:', mod.title);

if ((mod.materials || []).some((x) => x.url === URL)) {
  console.log('already there');
} else {
  const r = await col.updateOne(
    { _id: p._id, 'modules._id': mod._id },
    { $push: { 'modules.$.materials': { _id: new mongoose.Types.ObjectId(), url: URL, name: NAME, kind: 'notes', addedAt: new Date() } } },
  );
  console.log('modified', r.modifiedCount);
}
await mongoose.disconnect();
