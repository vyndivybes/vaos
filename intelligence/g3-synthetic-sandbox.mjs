/** G3 sandbox-only deterministic research solvers.
 * Neither the scheduler nor the Monte Carlo estimator can fetch sources,
 * write business data, execute work orders, or certify a production forecast.
 * All input MUST be explicit synthetic examples.
 */
export const G3_RESEARCH_ONLY=true;
const BAD=()=>{throw Error('G3_INPUT_INVALID');};
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>isObj(x)&&Object.keys(x).sort().join(',')===keys.slice().sort().join(',');
const ID=/^[A-Z][A-Z0-9_]{0,23}$/;
const whole=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const unique=a=>new Set(a).size===a.length;
function orderTasks(tasks){
 const by=new Map(tasks.map(j=>[j.id,j]));
 const done=new Set(),active=new Set(),result=[];
 function visit(id){
  if(active.has(id))BAD();
  if(done.has(id))return;
  const job=by.get(id);if(!job)BAD();
  active.add(id);
  for(const dep of [...job.dependsOn].sort()){
   if(dep===id||!by.has(dep))BAD();
   visit(dep);
  }
  active.delete(id);done.add(id);result.push(job);
 }
 for(const j of [...tasks].sort((a,b)=>a.id.localeCompare(b.id)))visit(j.id);
 return result;
}
function validatedJobs(s){
 if(!exact(s,['mode','horizonDays','resources','jobs'])||s.mode!=='SYNTHETIC_ONLY'
   ||!whole(s.horizonDays,1,14)||!Array.isArray(s.resources)||s.resources.length<1||s.resources.length>3
   ||!Array.isArray(s.jobs)||s.jobs.length<1||s.jobs.length>6)BAD();
 for(const r of s.resources){
  if(!exact(r,['id','capacity'])||!ID.test(r.id)||!whole(r.capacity,1,2))BAD();
 }
 if(!unique(s.resources.map(r=>r.id)))BAD();
 const resources=new Set(s.resources.map(r=>r.id));
 for(const j of s.jobs){
  if(!exact(j,['id','resource','durationDays','releaseDay','deadlineDay','dependsOn','ready'])
   ||!ID.test(j.id)||!resources.has(j.resource)||!whole(j.durationDays,1,14)
   ||!whole(j.releaseDay,0,s.horizonDays-1)||!whole(j.deadlineDay,1,s.horizonDays)
   ||!Array.isArray(j.dependsOn)||j.dependsOn.length>6
   ||!j.dependsOn.every(x=>typeof x==='string'&&ID.test(x))||!unique(j.dependsOn)
   ||typeof j.ready!=='boolean')BAD();
 }
 if(!unique(s.jobs.map(j=>j.id)))BAD();
 return orderTasks(s.jobs);
}
const immutableResult=(status,extra={})=>Object.freeze({
  status,mode:'SYNTHETIC_ONLY',solver:'BOUNDED_EXACT_DISCRETE_SEARCH',
  productionPlanningQualified:false,productionForecastCertified:false,
  inputAuthority:'SYNTHETIC_EXAMPLE_ONLY',businessDataRead:false,
  actionAuthorized:false,agentDispatchAuthorized:false,
  ...extra
});
/** Exact finite-day resource-capacity solver for tiny teaching scenarios.
 * It certifies only the specified toy problem if the search is exhaustive.
 * On work-budget exhaustion, HOLD, even when a candidate solution exists.
 */
export function optimizeSandboxSchedule(scenario){
 const tasks=validatedJobs(scenario);
 if(tasks.some(x=>!x.ready))return immutableResult('INPUT_RELEASE_HOLD',
  {searchCompleted:false,schedule:[],makespanDays:null,searchStates:0});
 const occ=Object.fromEntries(scenario.resources.map(x=>[x.id,Array(scenario.horizonDays).fill(0)]));
 const capacities=Object.fromEntries(scenario.resources.map(x=>[x.id,x.capacity]));
 const placed=new Map(),MAX_SEARCH=100000;
 let states=0,exhausted=false,bestEnd=Infinity,best=[];
 function search(index,latest){
  if(states>=MAX_SEARCH){exhausted=true;return;}
  states++;
  if(index===tasks.length){
   if(latest<bestEnd){
    bestEnd=latest;
    best=[...placed.values()].map(x=>({...x})).sort((a,b)=>a.id.localeCompare(b.id));
   }
   return;
  }
  // Prune only when the incumbent cannot be improved; pruning does not
  // change correctness for the minimum-makespan objective.
  if(latest>=bestEnd)return;
  const j=tasks[index];
  let earliest=j.releaseDay;
  for(const dep of j.dependsOn)earliest=Math.max(earliest,placed.get(dep).endDay);
  for(let start=earliest;start+j.durationDays<=Math.min(scenario.horizonDays,j.deadlineDay);start++){
   if(states>=MAX_SEARCH){exhausted=true;break;}
   let fits=true;
   for(let d=start;d<start+j.durationDays;d++)
    if(occ[j.resource][d]>=capacities[j.resource]){fits=false;break;}
   if(!fits)continue;
   for(let d=start;d<start+j.durationDays;d++)occ[j.resource][d]++;
   placed.set(j.id,{id:j.id,resource:j.resource,startDay:start,endDay:start+j.durationDays});
   search(index+1,Math.max(latest,start+j.durationDays));
   placed.delete(j.id);
   for(let d=start;d<start+j.durationDays;d++)occ[j.resource][d]--;
  }
 }
 search(0,0);
 if(exhausted)return immutableResult('SEARCH_LIMIT_HOLD',
  {searchCompleted:false,schedule:[],makespanDays:null,searchStates:states,
   proof:'NO_OPTIMALITY_CERTIFICATE'});
 if(bestEnd===Infinity)return immutableResult('INFEASIBLE_SYNTHETIC',
  {searchCompleted:true,schedule:[],makespanDays:null,searchStates:states,
   proof:'EXHAUSTIVE_WITHIN_SYNTHETIC_INPUT_BOUNDS'});
 return immutableResult('OPTIMAL_SYNTHETIC',
  {searchCompleted:true,schedule:best,makespanDays:bestEnd,searchStates:states,
   objective:'MIN_MAKESPAN_DAYS',proof:'EXHAUSTIVE_WITHIN_SYNTHETIC_INPUT_BOUNDS'});
}
function validatedRisk(s){
 if(!exact(s,['mode','seed','iterations','deadlineDay','tasks'])||s.mode!=='SYNTHETIC_ONLY'
  ||!whole(s.seed,1,4294967295)||!whole(s.iterations,64,1024)
  ||!whole(s.deadlineDay,1,365)||!Array.isArray(s.tasks)
  ||s.tasks.length<1||s.tasks.length>8)BAD();
 for(const x of s.tasks){
  if(!exact(x,['id','minDays','mostLikelyDays','maxDays','dependsOn'])
   ||!ID.test(x.id)||!whole(x.minDays,1,90)
   ||!whole(x.mostLikelyDays,x.minDays,90)
   ||!whole(x.maxDays,x.mostLikelyDays,90)
   ||!Array.isArray(x.dependsOn)||x.dependsOn.length>8
   ||!x.dependsOn.every(v=>typeof v==='string'&&ID.test(v))||!unique(x.dependsOn))BAD();
 }
 if(!unique(s.tasks.map(x=>x.id)))BAD();
 return orderTasks(s.tasks);
}
function generator(seed){
 let state=seed>>>0;
 return ()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
}
function triangular(j,u){
 const a=j.minDays,b=j.maxDays,m=j.mostLikelyDays;
 if(a===b)return a;
 const edge=(m-a)/(b-a);
 return u<edge?a+Math.sqrt(u*(b-a)*(m-a)):b-Math.sqrt((1-u)*(b-a)*(b-m));
}
const round2=x=>Math.round(x*100)/100;
/** Synthetic CPM: critical path durations only, NOT resource constraints or
 * a statistically calibrated probability for any VAOS operation.
 */
export function simulateSandboxRisk(scenario){
 const tasks=validatedRisk(scenario),rng=generator(scenario.seed),makespans=[];
 for(let sample=0;sample<scenario.iterations;sample++){
  const ends=new Map();let total=0;
  for(const j of tasks){
   const pred=j.dependsOn.reduce((m,id)=>Math.max(m,ends.get(id)),0);
   const end=pred+triangular(j,rng());
   ends.set(j.id,end);total=Math.max(total,end);
  }
  makespans.push(total);
 }
 makespans.sort((a,b)=>a-b);
 const quantile=q=>round2(makespans[Math.floor(q*(makespans.length-1))]);
 const within=makespans.filter(v=>v<=scenario.deadlineDay).length;
 return Object.freeze({
  status:'UNCALIBRATED_SYNTHETIC_SCENARIOS',
  method:'SEEDED_TRIANGULAR_CPM_MONTE_CARLO',mode:'SYNTHETIC_ONLY',
  samples:scenario.iterations,seed:scenario.seed,deadlineDay:scenario.deadlineDay,
  p10Days:quantile(.10),p50Days:quantile(.50),p90Days:quantile(.90),
  probabilityWithinDeadline:Math.round(within/scenario.iterations*10000)/10000,
  calibratedWithActualOutcomes:false,productionForecastCertified:false,
  productionPlanningQualified:false,actionAuthorized:false,
  agentDispatchAuthorized:false,businessDataRead:false,
  caveat:'Illustrative assumed durations; ignores resource contention and real-world correlations.'
 });
}
