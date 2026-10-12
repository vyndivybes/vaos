/** Founder-requested read-only V3 qualification pilot.
 * This is NOT a V3 autonomous cutover. New tools, inference budgets, paid
 * providers and business effect privileges remain identical to approved V2.
 * User query/client data cannot constitute independently signed evidence.
 */
import {assessUpgradeReadiness} from './adaptive-upgrade-readiness.mjs';
const DEFAULT=Object.freeze({pilotState:'OFF',v3AutonomyState:'HOLD',
 automaticActivationAuthorized:false,businessWritesAuthorized:false,
 paidInferenceAuthorized:false,modelBudgetIncreaseAuthorized:false,
 toolPolicy:'EXISTING_V2_APPROVED_READS_ONLY',
 unmetAcceptanceGates:Object.freeze([])});
export function assessV3CandidateMode({request,founderAuthenticated,
 existingV2Authorized}={}){
 if(request!=='v3-readonly'||founderAuthenticated!==true||existingV2Authorized!==true)
  return DEFAULT;
 // No browser-provided evidence is considered. All live acceptance gates
 // remain HOLD until independently observed and adjudicated server-side.
 const assessment=assessUpgradeReadiness({paidRoutingEnabled:false,
  readOnlyControlsPassed:true,verifiedDeployment:false});
 return Object.freeze({...DEFAULT,
  pilotState:'READ_ONLY_EVALUATION_ACTIVE',
  unmetAcceptanceGates:Object.freeze([...assessment.holds]),
  intentAcknowledged:true,
  note:'The V2 read-only investigative engine is used for supervised V3 qualification; no new autonomous tools are activated.'});
}
