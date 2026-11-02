import { DatabaseSync, backup } from 'node:sqlite';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  for (const line of (await readFile(process.env.ENV_FILE || join(root, '.env'), 'utf8')).split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const destination = join(process.env.BACKUP_DIR || join(root, 'backups'), new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8));
const database = new DatabaseSync(join(process.env.DATA_DIR || join(root, 'data'), 'tradeweave.sqlite'), { readOnly: true });
try {
  await mkdir(destination, { recursive: true });
  const snapshot = join(destination, 'tradeweave.sqlite');
  await backup(database, snapshot);
  const snapshotDb = new DatabaseSync(snapshot, { readOnly: true });
  let mediaFiles = [];
  try {
    const catalog = JSON.parse(snapshotDb.prepare('SELECT data FROM catalog WHERE id=1').get().data);
    const references = [...new Set(catalog.products.flatMap(product => product.images))];
    if (references.length) await mkdir(join(destination, 'media'));
    for (const reference of references) {
      const match = reference.match(/^\/media\/([a-f0-9]{64})\.(jpg|png|webp)$/);
      if (!match) throw new Error('The snapshot has an unsupported image reference. Backup is incomplete.');
      const filename = reference.slice('/media/'.length);
      const stored = snapshotDb.prepare('SELECT bytes FROM media WHERE hash=?').get(match[1]);
      const bytes = stored ? Buffer.from(stored.bytes) : await readFile(join(process.env.MEDIA_DIR || join(root, 'media'), filename));
      if (createHash('sha256').update(bytes).digest('hex') !== match[1]) throw new Error('A referenced image does not match its content hash. Backup is incomplete: ' + filename);
      await writeFile(join(destination, 'media', filename), bytes, { flag: 'wx' }); mediaFiles.push(filename);
    }
  } finally { snapshotDb.close(); }
  await writeFile(join(destination, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), format: 'TradeWeave SQLite + referenced media', databaseSha256: createHash('sha256').update(await readFile(snapshot)).digest('hex'), mediaFiles, providerCredentialsIncluded: false }, null, 2));
  console.log('Backup saved: ' + destination);
  console.log('Includes catalog, orders, buyer question records and ' + mediaFiles.length + ' referenced images. Keep it private. No provider credentials were copied.');
} finally { database.close(); }
