import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

function fail(message:string):never { throw new Error(message); }
function sqlString(value:string) { return value.replaceAll("'", "''"); }

const source = process.env.SQLITE_PATH ? resolve(process.env.SQLITE_PATH) : fail('SQLITE_PATH is required.');
if (source === ':memory:') fail('A durable SQLite file is required.');
if (source.includes(`${process.cwd()}/.review/`) || source.includes('/.review/')) {
  fail('Refusing to checkpoint the isolated review database. Use the real development workspace database intentionally.');
}
if (process.env.RESTORATION_CHECKPOINT_ACK !== 'I_UNDERSTAND') {
  fail('Set RESTORATION_CHECKPOINT_ACK=I_UNDERSTAND to confirm this is an intentional read-only checkpoint.');
}

const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const dir = resolve('.checkpoints/local-data', stamp);
mkdirSync(dir,{recursive:true,mode:0o700});
const snapshot = resolve(dir, basename(source).replace(/\.sqlite$/,'') + '.snapshot.sqlite');

const db = new DatabaseSync(source,{readOnly:false});
db.exec(`PRAGMA wal_checkpoint(FULL); VACUUM INTO '${sqlString(snapshot)}';`);
db.close();

const copy = new DatabaseSync(snapshot,{readOnly:true});
const rows = copy.prepare('SELECT namespace,key,value FROM records ORDER BY namespace,key').all() as Array<{namespace:string;key:string;value:Uint8Array}>;
copy.close();

const counts:Record<string,number>={};
const identifiers:Record<string,string[]>={};
const recordHash=createHash('sha256');
for(const row of rows){
  counts[row.namespace]=(counts[row.namespace]||0)+1;
  (identifiers[row.namespace] ||= []).push(row.key);
  recordHash.update(row.namespace);recordHash.update('\0');recordHash.update(row.key);recordHash.update('\0');recordHash.update(Buffer.from(row.value));
}
const dbHash=createHash('sha256').update(readFileSync(snapshot)).digest('hex');
const manifest={
  createdAt:new Date().toISOString(),
  sourcePath:source,
  snapshotFile:basename(snapshot),
  databaseSha256:dbHash,
  logicalRecordsSha256:recordHash.digest('hex'),
  totalRecords:rows.length,
  counts,
  identifiers,
};
writeFileSync(resolve(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
writeFileSync(resolve(dir,'README.txt'),[
  'Sage-Auto restoration checkpoint',
  'This snapshot is local-only and must not be committed.',
  `Source: ${source}`,
  `Snapshot: ${snapshot}`,
  `Records: ${rows.length}`,
  `Database SHA-256: ${dbHash}`,
  'Use manifest.json to compare counts and stable record identifiers before/after restoration work.',
].join('\n')+'\n',{mode:0o600});
console.log(JSON.stringify({checkpoint:dir,totalRecords:rows.length,databaseSha256:dbHash,logicalRecordsSha256:manifest.logicalRecordsSha256},null,2));
