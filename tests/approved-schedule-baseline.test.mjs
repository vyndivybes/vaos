import test from "node:test";
import assert from "node:assert/strict";
import { verifyApprovedScheduleBaseline } from "../platform/execution/approved-schedule-baseline.mjs";
const sample = { programId:"VYNDI-MASTER-PROGRAM",revisionId:"SCH-10",timezone:"Asia/Kolkata",
 tasks:[{id:"AL-001",planned_start:"2026-10-10",planned_finish:"2026-10-15"}],dependencies:[] };
async function signed(snapshot=sample) {
 const dig=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(snapshot)));
 return {status:"approved",revisionId:snapshot.revisionId,timezone:snapshot.timezone,
 baselineHash:"sha256:"+Array.from(new Uint8Array(dig),x=>x.toString(16).padStart(2,"0")).join(""),snapshot};
}
test("approved dated snapshot accepted only after recomputing its digest",async()=>{
 const input=await signed();assert.equal((await verifyApprovedScheduleBaseline(input)).accepted,true);
 await assert.rejects(()=>verifyApprovedScheduleBaseline({...input,snapshot:{...sample,tasks:[]}}),/SCHEDULE_INCOMPLETE/);
});
test("draft, mismatched authority and corrupt digest are rejected",async()=>{
 const input=await signed();
 await assert.rejects(()=>verifyApprovedScheduleBaseline({...input,status:"draft"}),/SCHEDULE_NOT_APPROVED/);
 await assert.rejects(()=>verifyApprovedScheduleBaseline({...input,revisionId:"SCH-11"}),/SCHEDULE_AUTHORITY_MISMATCH/);
 await assert.rejects(()=>verifyApprovedScheduleBaseline({...input,baselineHash:"sha256:"+ "0".repeat(64)}),/SCHEDULE_HASH_MISMATCH/);
});
