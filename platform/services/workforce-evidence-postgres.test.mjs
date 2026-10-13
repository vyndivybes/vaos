import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {buildWorkforceAnalytics} from '../../intelligence/workforce-analytics.mjs';

// Isolated database only. No remote credentials, external artifacts or certification.
test('migration executes in PostgreSQL and enforces evidence, ownership and access boundaries',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema vaos_private;
 create function vaos_private.assert_server_key(key text) returns void language plpgsql as $$
 begin if key<>'fixture-key' then raise exception 'SERVER_KEY_DENIED'; end if; end; $$;
 create table vaos_private.digital_employees(id text primary key,name text,role text,department text,status text,qualification_level integer,heartbeat_at timestamptz,current_assignment text);
 create table vaos_private.digital_employee_activity_monitor(employee_id text,observation text,checked_at timestamptz);
 create table vaos_private.digital_employee_qualification_assessments(id text,employee_id text,status text,target_level integer,assessed_at timestamptz,assessed_by text);
 create table vaos_private.intents(id text primary key,agent_id text);
 create table vaos_private.capa_records(capa_id text primary key,id text,intent_id text,status text,source_action text,opened_at timestamptz);
 create table vaos_private.work_packages(id text primary key,mission_id text,owner_agent_id text,status text,action_type text,created_at timestamptz,updated_at timestamptz);
 create table vaos_private.agent_handoffs(id text,mission_id text,work_package_id text,to_agent_id text,status text,verified_at timestamptz,verified_by_agent_id text,requested_job text,version integer,evidence_refs text[]);
 create table vaos_private.handoff_work_evidence(evidence_id text,handoff_id text,author_agent_id text,action_type text,report_sha256 text,created_at timestamptz,handoff_version integer,report jsonb);
 create table vaos_private.agent_handoff_events(handoff_id text,outcome text,by_agent_id text,created_at timestamptz,evidence_refs text[]);
 insert into vaos_private.digital_employees values ('qa','QA','Quality','Quality','TRAINING',2,null,'fixture');
 insert into vaos_private.intents values ('i1','qa');
 insert into vaos_private.capa_records values ('c1','case1','i1','OPEN','QA.OPEN_CAPA',now()-interval '3 days');
 insert into vaos_private.work_packages values ('wp1','mission-1','qa','COMPLETED','QA.CHECK',now()-interval '2 days',now()-interval '1 day');
 insert into vaos_private.agent_handoffs values ('h1','mission-1','wp1','qa','COMPLETED',now()-interval '1 day','risk','QA.CHECK',4,array['e1']);
 insert into vaos_private.handoff_work_evidence values ('e1','h1','qa','QA.CHECK',encode(sha256(convert_to('{}'::jsonb::text,'UTF8')),'hex'),now()-interval '1 day 1 hour',1,'{}');
 insert into vaos_private.agent_handoff_events values ('h1','VERIFY','risk',now()-interval '1 day',array['REVIEWED:e1']);
 `);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261013200000_workforce_evidence_ledgers.sql',import.meta.url),'utf8'));
 const read=async()=> (await db.query("select public.vaos_founder_workforce_overview('fixture-key','shyamsundhar1982@gmail.com') as data")).rows[0].data;
 let raw=await read();let analytics=buildWorkforceAnalytics(raw);
 assert.equal(analytics.employees.find(e=>e.id==='qa').reports.reports.length,0);
 assert.equal(analytics.summary.verifiedClosures90Days,0,'stale handoff version cannot supply actual progress');
 assert.equal(analytics.summary.approvedBaselines,0);
 assert.equal(analytics.summary.independentAuditReviews,0);
 await db.exec('update vaos_private.handoff_work_evidence set handoff_version=2');
 analytics=buildWorkforceAnalytics(await read());
 assert.equal(analytics.employees.find(e=>e.id==='qa').reports.reports.length,1);
 assert.equal(analytics.summary.verifiedClosures90Days,1);
 await db.exec("update vaos_private.handoff_work_evidence set report_sha256=repeat('b',64)");
 assert.equal(buildWorkforceAnalytics(await read()).summary.verifiedClosures90Days,0,'tampered report hash cannot count');
 await db.exec("update vaos_private.handoff_work_evidence set report_sha256=encode(sha256(convert_to(report::text,'UTF8')),'hex')");
 await assert.rejects(db.query("select public.vaos_founder_workforce_overview('bad','shyamsundhar1982@gmail.com')"),/SERVER_KEY_DENIED/);
 await assert.rejects(db.query("select public.vaos_founder_workforce_overview('fixture-key','someone@example.com')"),/FOUNDER_ONLY/);
 for(const role of ['anon','authenticated','service_role']){
  assert.equal((await db.query(`select has_table_privilege('${role}','vaos_private.department_audit_results','INSERT') as allowed`)).rows[0].allowed,false);
 }
 for(const role of ['anon','authenticated'])assert.equal((await db.query(`select has_function_privilege('${role}','public.vaos_founder_workforce_overview(text,text)','EXECUTE') as allowed`)).rows[0].allowed,false);
 const audit=`insert into vaos_private.department_audit_results(id,employee_id,route,outcome,executed_at,reviewed_at,reviewer,environment,deployed_commit,canonical_source_ref,evidence_refs,checks_evidence_refs,checks,evidence_sha256,open_findings,next_audit_due_at,rationale)
 values($1,'qa',$2,'PASS',now()-interval '2 days',now()-interval '1 day',$3,'authenticated-isolated','fixture','fixture-source',array['fixture-proof'],array['fixture-checks'],$4::jsonb,repeat('a',64),0,now()+interval '7 days','fixture only')`;
 const checks=Object.fromEntries(['navigation','ui','responsive','permissions','records','displays','reconciliation','errorStates','ledger'].map(k=>[k,true]));
 await assert.rejects(db.query(audit,['bad-route','/command/accounting','risk',JSON.stringify(checks)]),/AUDIT_ROUTE_OUT_OF_SCOPE/);
 await assert.rejects(db.query(audit,['bad-self','/command/quality','qa',JSON.stringify(checks)]));
 await assert.rejects(db.query(audit,['bad-check','/command/quality','risk','{}']),/AUDIT_CHECKS_INCOMPLETE/);
 await db.query(audit,['a1','/command/quality','risk',JSON.stringify(checks)]);
 await assert.rejects(db.exec("update vaos_private.department_audit_results set outcome='FAIL'"),/APPEND_ONLY_EVIDENCE/);
 await assert.rejects(db.exec('delete from vaos_private.department_audit_results'),/APPEND_ONLY_EVIDENCE/);
 assert.equal(buildWorkforceAnalytics(await read()).employees.find(e=>e.id==='qa').audit.passed,1);
 await db.exec("insert into vaos_private.work_plan_baselines values ('b1','wp1',now()-interval '2 days','founder',now()-interval '2 days',now()-interval '1 day','{}',array['fixture']);");
 analytics=buildWorkforceAnalytics(await read());
 assert.equal(analytics.employees.find(e=>e.id==='qa').progress.series.at(-1).actual,1);
 const event=`insert into vaos_private.capa_evidence_events values($1,'c1',$2,now()-interval '1 hour','qa','risk',array['fixture'],repeat('a',64),'fixture only',$3)`;
 await assert.rejects(db.query(event,['close1','CLOSED',null]),/CAPA_PASSING_RETEST_REQUIRED/);
 await db.query(event,['pass1','RETEST_PASS',null]);
 await db.query(event,['close2','CLOSED','pass1']);
 assert.equal(buildWorkforceAnalytics(await read()).employees.find(e=>e.id==='qa').defects.retests.events.length,2);
 await db.query(event,['fail1','RETEST_FAIL',null]);
 await assert.rejects(db.query(event,['close3','CLOSED','pass1']),/CAPA_RETEST_SUPERSEDED/);
 }finally{await db.close();}
});
