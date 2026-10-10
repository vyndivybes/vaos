// Safe browser-only draft model. No direct dispatch or authorization.
export const AGENTS=Object.freeze([
 ['orchestrator','VAOS Orchestrator'],['project','Project Controls'],['vibpe','VIBPE Engineering'],
 ['qa','Quality / CAPA'],['risk','Enterprise Risk'],['security','Security'],
 ['knowledge','Knowledge'],['release','Release Assurance'],['commercial','Commercial / Sales'],
 ['procurement','Procurement'],['inventory','Inventory'],['production','Production'],
 ['maintenance','Maintenance'],['finance','Finance'],['people','People / Payroll'],
 ['engineering-configuration','Engineering Configuration']
].map(([id,name])=>Object.freeze({id,name})));
const ids=new Set(AGENTS.map(a=>a.id));
const kinds=new Set(['INSTRUCTION','REPORT_REQUEST','OVERRIDE_PROPOSAL']);
export function prepareFounderCommand(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
 Object.keys(input).some(k=>!['agentId','instruction','kind'].includes(k))||
 !ids.has(input.agentId)||!kinds.has(input.kind)||typeof input.instruction!=='string'||
 input.instruction.trim().length<5||input.instruction.length>2000||
 /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.instruction)){
  throw new Error('FOUNDER_COMMAND_DRAFT_INVALID');
 }
 return Object.freeze({status:'DRAFT_NOT_SENT',kind:input.kind,recipientAgentId:input.agentId,
  instruction:input.instruction.trim(),requiresGovernedSubmission:true,executionAuthorized:false});
}
export function safeAgentSnapshot(monitor){
 if(!monitor||!Array.isArray(monitor.agents))return [];
 return monitor.agents.filter(a=>ids.has(a?.id)).map(a=>({
  id:a.id,lifecycle:typeof a.lifecycle==='string'?a.lifecycle:'UNKNOWN',
  qualification:Number.isInteger(a.qualificationLevel)&&a.qualificationLevel>=0&&a.qualificationLevel<=4
   ?'Q'+a.qualificationLevel:'UNVERIFIED',
  liveness:a.runtimeLiveness==='VERIFIED'?'VERIFIED':'UNVERIFIED'
 }));
}
