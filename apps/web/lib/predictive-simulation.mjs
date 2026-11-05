/**
 * Seeded Monte Carlo, browser-only scenario calculator.
 * Assumptions are hypothetical and never presented as an observed or certified forecast.
 * All values are in explicitly chosen scenario currency units, per month.
 */
const bounded=(v,name,min,max)=>{
 if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Enter a valid '+name+' between '+min+' and '+max);
 return v;
};
export function validateScenario(input){
 if(!input||typeof input!=='object')throw Error('Enter scenario assumptions first');
 const params={
  demand:bounded(input.demand,'monthly demand',0,1_000_000),
  capacity:bounded(input.capacity,'monthly capacity',0,1_000_000),
  price:bounded(input.price,'unit selling price',0,1_000_000_000),
  unitCost:bounded(input.unitCost,'unit variable cost',0,1_000_000_000),
  fixedCost:bounded(input.fixedCost,'monthly fixed cost',0,10_000_000_000),
  openingCash:bounded(input.openingCash,'opening cash',-100_000_000_000,100_000_000_000),
  capex:bounded(input.capex,'monthly capital expenditure',0,10_000_000_000),
  volatilityPct:bounded(input.volatilityPct,'demand volatility',0,200),
  horizonMonths:bounded(input.horizonMonths,'forecast horizon',1,24),
  iterations:bounded(input.iterations,'iteration count',100,5000),
  seed:bounded(input.seed,'random seed',0,4294967295)
 };
 for(const key of ['horizonMonths','iterations','seed'])if(!Number.isInteger(params[key]))throw Error('Scenario '+key+' must be an integer');
 return params;
}
function generator(seed){
 let state=seed>>>0;
 return ()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
function normal(random){
 const u=Math.max(Number.MIN_VALUE,random());
 const v=random();
 return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
export function percentile(raw,p){
 if(!Array.isArray(raw)||raw.length===0||!raw.every(Number.isFinite)||typeof p!=='number'||p<0||p>1)throw Error('Invalid percentile input');
 const values=[...raw].sort((a,b)=>a-b);
 const idx=p*(values.length-1),lo=Math.floor(idx),hi=Math.ceil(idx);
 return values[lo]+(values[hi]-values[lo])*(idx-lo);
}
export function runMonteCarlo(input){
 const a=validateScenario(input);
 const random=generator(a.seed);
 const samples=Array.from({length:a.horizonMonths},()=>[]);
 let positive=0;
 for(let trial=0;trial<a.iterations;trial++){
  let cash=a.openingCash;
  for(let month=0;month<a.horizonMonths;month++){
   const noise=a.volatilityPct===0?0:normal(random)*a.volatilityPct/100;
   const demand=Math.max(0,Math.min(1_000_000,a.demand*(1+noise)));
   const produced=Math.min(demand,a.capacity);
   cash+=produced*(a.price-a.unitCost)-a.fixedCost-a.capex;
   if(!Number.isFinite(cash)||Math.abs(cash)>1e15)throw Error('Scenario cash balance exceeds safe numerical bounds');
   samples[month].push(cash);
  }
  if(cash>=0)positive++;
 }
 const months=samples.map((values,i)=>({
  month:i+1,
  p10:percentile(values,.1),
  p50:percentile(values,.5),
  p90:percentile(values,.9),
  mean:values.reduce((s,v)=>s+v,0)/values.length
 }));
 return {
  sourceClass:'USER_ASSUMPTIONS_SIMULATION',
  methodology:'Seeded independent monthly Gaussian demand noise, floored at zero and capped at capacity; fixed unit economics, costs and CAPEX; no tax, financing or working-capital adjustments.',
  assumptions:a,months,
  probabilityPositive:positive/a.iterations,
  final:months.at(-1),
  notCertified:true
 };
}
