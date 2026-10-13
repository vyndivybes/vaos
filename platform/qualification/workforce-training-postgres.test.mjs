/** Isolated PGlite datadir recovery only; never a hosted Supabase/pg_dump certificate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {ROLE_EXERCISES,teachingRecord,TRAINING_OBSERVED_AT} from './workforce-training-fixtures.mjs';
import {evaluateTrainingRecord} from './workforce-role-training.mjs';

const ddl=`
 CREATE ROLE training_writer;
 CREATE ROLE training_reader;
 CREATE ROLE training_untrusted;
 CREATE SCHEMA isolated_training;
 REVOKE ALL ON SCHEMA isolated_training FROM PUBLIC;
 GRANT USAGE ON SCHEMA isolated_training TO training_writer,training_reader;
 CREATE TABLE isolated_training.results(
  event_id text PRIMARY KEY CHECK(event_id ~ '^TRAINING-[A-Z0-9-]+$'),
  employee_id text NOT NULL,
  source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  output jsonb NOT NULL CHECK(output @> '{"environment":"LOCAL_ISOLATED_SYNTHETIC","synthetic":true,"qualificationGranted":false,"productionWriteAuthorized":false}'::jsonb
    AND COALESCE(output->>'employeeId'=employee_id,false)),
  created_at timestamptz NOT NULL DEFAULT now()
 );
 ALTER TABLE isolated_training.results ENABLE ROW LEVEL SECURITY;
 CREATE POLICY writer_insert ON isolated_training.results FOR INSERT TO training_writer WITH CHECK(true);
 CREATE POLICY training_read ON isolated_training.results FOR SELECT TO training_writer,training_reader USING(true);
 GRANT SELECT,INSERT ON isolated_training.results TO training_writer;
 GRANT SELECT ON isolated_training.results TO training_reader;
 CREATE FUNCTION isolated_training.immutable_results() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'TRAINING_RESULTS_APPEND_ONLY'; END; $$;
 CREATE TRIGGER immutable_results BEFORE UPDATE OR DELETE ON isolated_training.results
 FOR EACH ROW EXECUTE FUNCTION isolated_training.immutable_results();
 REVOKE ALL ON FUNCTION isolated_training.immutable_results() FROM PUBLIC;
`;

test('all-role synthetic output survives isolated PostgreSQL datadir dump/restore with access and rollback controls',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vaos-training-pg-'));
 let db=new PGlite();let restored;
 try{
  await db.exec(ddl);
  await db.exec('SET ROLE training_writer');
  for(const id of Object.keys(ROLE_EXERCISES))for(const variant of ['good','bad']){
   const record=teachingRecord(id,variant);
   const output=evaluateTrainingRecord(id,record,{environment:'LOCAL_ISOLATED_SYNTHETIC',observedAt:TRAINING_OBSERVED_AT});
   assert.deepEqual(output.findings,variant==='good'?[]:ROLE_EXERCISES[id].expected);
   await db.query('INSERT INTO isolated_training.results(event_id,employee_id,source_hash,output) VALUES($1,$2,$3,$4::jsonb)',[record.id,id,output.sourceHash,JSON.stringify(output)]);
  }
  await assert.rejects(db.exec("INSERT INTO isolated_training.results SELECT * FROM isolated_training.results LIMIT 1"),/duplicate key/);
  const output=evaluateTrainingRecord('finance',teachingRecord('finance','good'),{environment:'LOCAL_ISOLATED_SYNTHETIC',observedAt:TRAINING_OBSERVED_AT});
  await assert.rejects(db.query('INSERT INTO isolated_training.results(event_id,employee_id,source_hash,output) VALUES($1,$2,$3,$4::jsonb)',['TRAINING-PRODUCTION','finance',output.sourceHash,JSON.stringify({...output,environment:'production'})]),/check constraint/);
  await assert.rejects(db.query('INSERT INTO isolated_training.results(event_id,employee_id,source_hash,output) VALUES($1,$2,$3,$4::jsonb)',['TRAINING-INCOMPLETE','finance',output.sourceHash,'{}']),/check constraint/);
  await assert.rejects(db.exec('DELETE FROM isolated_training.results'),/permission denied/);
  await db.exec('RESET ROLE');
  await assert.rejects(db.exec('UPDATE isolated_training.results SET employee_id=employee_id'),/TRAINING_RESULTS_APPEND_ONLY/);
  await assert.rejects(db.transaction(async tx=>{
   await tx.query('INSERT INTO isolated_training.results(event_id,employee_id,source_hash,output) VALUES($1,$2,$3,$4::jsonb)', ['TRAINING-ROLLBACK','finance',output.sourceHash,JSON.stringify(output)]);
   throw Error('INJECTED_TRANSACTION_FAILURE');
  }),/INJECTED_TRANSACTION_FAILURE/);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM isolated_training.results WHERE event_id='TRAINING-ROLLBACK'")).rows[0].n,0);
  await db.exec('SET ROLE training_untrusted');
  await assert.rejects(db.query('SELECT * FROM isolated_training.results'),/permission denied/);
  await db.exec('RESET ROLE; SET ROLE training_reader');
  await assert.rejects(db.exec('DELETE FROM isolated_training.results'),/permission denied/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM isolated_training.results')).rows[0].n,32);
  await db.exec('RESET ROLE');
  const before=(await db.query('SELECT event_id,employee_id,source_hash,output FROM isolated_training.results ORDER BY event_id')).rows;
  const archive=await db.dumpDataDir('none');
  const bytes=Buffer.from(await archive.arrayBuffer());
  const archivePath=join(dir,'synthetic-training.tar');await writeFile(archivePath,bytes);
  const readback=await readFile(archivePath);
  assert.equal(createHash('sha256').update(readback).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
  await db.close();db=null;
  restored=new PGlite({loadDataDir:new Blob([readback])});
  const after=(await restored.query('SELECT event_id,employee_id,source_hash,output FROM isolated_training.results ORDER BY event_id')).rows;
  assert.deepEqual(after,before);assert.equal(after.length,32);
  await restored.exec('SET ROLE training_untrusted');
  await assert.rejects(restored.query('SELECT * FROM isolated_training.results'),/permission denied/);
  await restored.exec('RESET ROLE');
  await assert.rejects(restored.exec('DELETE FROM isolated_training.results'),/TRAINING_RESULTS_APPEND_ONLY/);
 }finally{if(db)await db.close();if(restored)await restored.close();await rm(dir,{recursive:true,force:true});}
});
