/** Bounded BCP stress analysis. All inputs are hypothetical and no action is authorized. */
const invalid=()=>{throw Error('CONTINUITY_STRESS_INVALID')};
const numeric=(value,min,max,integer=false)=>{
 if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isSafeInteger(value)))invalid();
 return value;
};
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
export function evaluateContinuityStress(model,input){
 if(!model||typeof model!=='object'||Array.isArray(model)||!input||typeof input!=='object'||Array.isArray(input))invalid();
 const {sellingPrice,variableCost,monthlyFixedCost,monthlyUnits}=model;
 numeric(sellingPrice,0.01,1e12);numeric(variableCost,0,1e12);numeric(monthlyFixedCost,0,1e12);
 if(!monthlyUnits||!Number.isSafeInteger(monthlyUnits.base)||monthlyUnits.base<0||monthlyUnits.base>1e7)invalid();
 const cashReserve=numeric(input.cashReserve,0,1e12),recoveryCost=numeric(input.recoveryCost,0,1e12);
 const demandDropPct=numeric(input.demandDropPct,0,100),variableCostIncreasePct=numeric(input.variableCostIncreasePct,0,300);
 const supplierRecoveryDays=numeric(input.supplierRecoveryDays,0,90,true),inventoryCoverDays=numeric(input.inventoryCoverDays,0,90,true);
 const exposureDays=Math.max(0,supplierRecoveryDays-inventoryCoverDays),modeledInterruptionDays=Math.min(30,exposureDays);
 const stressedUnits=Math.floor(monthlyUnits.base*(1-demandDropPct/100)*(1-modeledInterruptionDays/30));
 const stressedUnitVariableCost=round(variableCost*(1+variableCostIncreasePct/100));
 const recurringMonthlySurplus=round(stressedUnits*(sellingPrice-stressedUnitVariableCost)-monthlyFixedCost);
 const firstMonthSurplus=round(recurringMonthlySurplus-recoveryCost);
 const cashAfterRecovery=Math.max(0,round(cashReserve-recoveryCost));
 const fundingHold=recoveryCost>cashReserve;
 const cashCoverageMonths=recurringMonthlySurplus<0?round(cashAfterRecovery/-recurringMonthlySurplus):null;
 return {
  qualification:'ASSUMPTION_ONLY_NOT_FORECAST',currency:model.currency||'INR',
  asModeled:'SINGLE_30_DAY_STRESS_WINDOW',baselineUnits:monthlyUnits.base,
  supplierRecoveryDays,inventoryCoverDays,exposureDays,modeledInterruptionDays,
  demandDropPct,variableCostIncreasePct,cashReserve,recoveryCost,cashAfterRecovery,
  stressedUnits,stressedUnitVariableCost,recurringMonthlySurplus,firstMonthSurplus,
  cashCoverageMonths,fundingHold,
  limitations:['No verified supplier restoration time, inventory cover, customer demand, cash balance or replacement sourcing is implied.',
   'One-month 30-day approximation: no daily production scheduling, receivables, payables, taxes, debt, CAPEX or working-capital movement.',
   'Cash coverage assumes the stressed monthly operating loss persists; recovery cost is deducted once, not monthly.',
   'No supplier, purchase-order, finance, inventory or production write is authorized.'],
  actionAuthorized:false,forecastQualified:false,readOnly:true
 };
}
