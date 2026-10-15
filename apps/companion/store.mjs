import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';

export function openStore(file){
 const db=new DatabaseSync(file);
 db.exec(`PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON;
 CREATE TABLE IF NOT EXISTS memories(id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,kind TEXT NOT NULL,state TEXT NOT NULL,created INTEGER NOT NULL,events TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS skills(id TEXT PRIMARY KEY,definition TEXT NOT NULL,hash TEXT NOT NULL,state TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS routines(id TEXT PRIMARY KEY,title TEXT NOT NULL,kind TEXT NOT NULL,input TEXT NOT NULL,intervalMs INTEGER,eventName TEXT,nextAt INTEGER,enabled INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS routine_receipts(receipt TEXT PRIMARY KEY,jobId TEXT NOT NULL);`);
 db.exec('CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY,filename TEXT NOT NULL,bytes INTEGER NOT NULL,created INTEGER NOT NULL)');
 db.exec('CREATE TABLE IF NOT EXISTS pending_events(id TEXT PRIMARY KEY,targets TEXT NOT NULL)');
 // Interrupted work is never replayed as if its outcome were known.
 db.prepare("UPDATE jobs SET state='interrupted' WHERE state IN ('running','queued','review')").run();
 const parse=row=>row&&({...row,events:JSON.parse(row.events)});
 return {
  db,
  close:()=>db.close(),
  memories(search=''){
   const term='%'+search.replace(/[\\%_]/g,c=>'\\'+c)+'%';
   return db.prepare("SELECT * FROM memories WHERE title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\' ORDER BY updated DESC LIMIT 100").all(term,term);
  },
  saveMemory({id=randomUUID(),title,body}){db.prepare('INSERT INTO memories VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,updated=excluded.updated').run(id,title,body,Date.now());return {id,title,body};},
  deleteMemory(id){return db.prepare('DELETE FROM memories WHERE id=?').run(id).changes===1;},
  saveArtifact(record){db.prepare('INSERT OR REPLACE INTO artifacts VALUES(?,?,?,?)').run(record.id,record.filename,record.bytes,Date.now());return record;},
  artifacts:()=>db.prepare('SELECT * FROM artifacts ORDER BY created DESC LIMIT 100').all(),
  deleteArtifact:id=>db.prepare('DELETE FROM artifacts WHERE id=?').run(id).changes===1,
  saveJob(job){db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,events=excluded.events').run(job.id,job.kind,job.state,job.created,JSON.stringify(job.events));},
  jobs:()=>db.prepare('SELECT * FROM jobs ORDER BY created DESC LIMIT 100').all().map(parse),
  saveSkill(skill){db.prepare('INSERT INTO skills VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET definition=excluded.definition,hash=excluded.hash,state=excluded.state').run(skill.id,JSON.stringify(skill.definition),skill.hash,skill.state);},
  skills:()=>db.prepare('SELECT * FROM skills').all().map(r=>({...r,definition:JSON.parse(r.definition)})),
  saveRoutine(r){db.prepare('INSERT INTO routines VALUES(?,?,?,?,?,?,?,1)').run(r.id,r.title,r.kind,JSON.stringify(r.input),r.intervalMs,r.eventName,r.nextAt);return r;},
  routines:()=>db.prepare('SELECT * FROM routines ORDER BY title').all().map(r=>({...r,input:JSON.parse(r.input)})),
  deleteRoutine:id=>db.prepare('DELETE FROM routines WHERE id=?').run(id).changes===1,
  hasReceipt:receipt=>!!db.prepare('SELECT receipt FROM routine_receipts WHERE receipt=?').get(receipt),
  saveEvent(id,targets){db.prepare('INSERT OR IGNORE INTO pending_events VALUES(?,?)').run(id,JSON.stringify(targets));},
  events:()=>db.prepare('SELECT * FROM pending_events LIMIT 100').all().map(e=>({...e,targets:JSON.parse(e.targets)})),
  completeEvent:id=>db.prepare('DELETE FROM pending_events WHERE id=?').run(id),
  claimRoutine(r,receipt,jobId,nextAt){
   db.exec('BEGIN IMMEDIATE');
   try{
    const claimed=db.prepare('INSERT OR IGNORE INTO routine_receipts VALUES(?,?)').run(receipt,jobId).changes===1;
    if(claimed&&r.intervalMs)db.prepare('UPDATE routines SET nextAt=? WHERE id=?').run(nextAt,r.id);
    db.exec('COMMIT');return claimed;
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
 };
}
