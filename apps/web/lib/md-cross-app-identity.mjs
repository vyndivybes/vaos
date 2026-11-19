/** Only fixed, safe read-only evidence can leave the signed VYNDI bridge.
 * This cannot sign the browser into VYNDI, grant a role or certify business data.
 */
const ACTION='GOVERNANCE.OBSERVE_MD_IDENTITY';
const AUTHORITY='readManagingDirectorIdentityEvidence';
const SAFE_HOLDS=new Set([
 'INDEPENDENT_BROWSER_SESSION_AND_SSO_UNVERIFIED',
 'NO_CROSS_APP_AUTH_GRANT',
 'FOUNDER_IDENTITY_NOT_UNIQUE',
 'VYNDI_EMAIL_NOT_VERIFIED',
 'VYNDI_ADMIN_ROLE_NOT_ASSIGNED',
 'VYNDI_PROVIDER_LINK_MISSING',
 'CURRENT_VYNDI_BROWSER_SESSION_NOT_PROVED',
]);
export const MD_IDENTITY_UNAVAILABLE=Object.freeze({
 status:'HOLD',accountEvidenceAccepted:false,existingAccountLocated:false,
 vyndiAccountEmailVerified:false,vyndiAccountAdminAssigned:false,
 crossPlatformSsoVerified:false,businessApprovalAuthorized:false,
 productionWriteAuthorized:false,holds:Object.freeze(['MD_IDENTITY_EVIDENCE_UNAVAILABLE']),
});
function invalid(){
 return Object.freeze({...MD_IDENTITY_UNAVAILABLE,
  holds:Object.freeze(['MD_BINDING_EVIDENCE_INVALID'])});
}
/** @param {unknown} response */
export function normalizeVyndiMdIdentityEvidence(response){
 if(!response||typeof response!=='object'||Array.isArray(response))return invalid();
 const r=response;
 const data=r.data;
 if(r.readOnly!==true||r.effectClass!=='read'||r.sourceReceiptChecked!==false||
    r.actionAuthorized!==false||r.productionWriteAuthorized!==false||
    r.sourceCompletenessVerified!==false||
    r.employeeId!=='people'||r.actionType!==ACTION||
    r.sourceAuthority!==AUTHORITY||!data||typeof data!=='object'||
    data.schemaVersion!=='VYNDI_MD_IDENTITY_EVIDENCE_V1'||
    data.status!=='HOLD'||data.readOnly!==true||
    typeof data.existingAccountLocated!=='boolean'||
    typeof data.emailVerified!=='boolean'||
    typeof data.adminRoleAssigned!=='boolean'||
    typeof data.accountProviderLinked!=='boolean'||
    typeof data.unexpiredSessionRecordPresent!=='boolean'||
    data.vaosSessionVerifiedHere!==false||
    data.vyndiBrowserSessionVerifiedHere!==false||
    data.crossPlatformSsoEnabled!==false||
    data.mdAuthenticatedAcrossBoth!==false||
    data.businessApprovalAuthorized!==false||
    data.productionWriteAuthorized!==false||
    data.sourceRevisionCertified!==false||
    !Array.isArray(data.holds)||data.holds.length<2||data.holds.length>9||
    data.holds.some(c=>typeof c!=='string'||!SAFE_HOLDS.has(c))||
    !data.holds.includes('INDEPENDENT_BROWSER_SESSION_AND_SSO_UNVERIFIED')||
    !data.holds.includes('NO_CROSS_APP_AUTH_GRANT')||
    (data.existingAccountLocated!==true &&
      (data.emailVerified!==false||data.adminRoleAssigned!==false||
       data.accountProviderLinked!==false||data.unexpiredSessionRecordPresent!==false||
       !data.holds.includes('FOUNDER_IDENTITY_NOT_UNIQUE')))||
    (data.existingAccountLocated===true &&
      (data.holds.includes('FOUNDER_IDENTITY_NOT_UNIQUE')||
       data.holds.includes('VYNDI_EMAIL_NOT_VERIFIED')===data.emailVerified||
       data.holds.includes('VYNDI_ADMIN_ROLE_NOT_ASSIGNED')===data.adminRoleAssigned)))
    return invalid();
 return Object.freeze({
  status:'HOLD',accountEvidenceAccepted:true,
  existingAccountLocated:data.existingAccountLocated,
  vyndiAccountEmailVerified:data.emailVerified,
  vyndiAccountAdminAssigned:data.adminRoleAssigned,
  crossPlatformSsoVerified:false,
  businessApprovalAuthorized:false,productionWriteAuthorized:false,
  holds:Object.freeze([...new Set(data.holds)]),
 });
}
