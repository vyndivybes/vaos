// Read-only status display in the existing authenticated BI Studio.
const el=(name,value)=>{const node=document.createElement(name);if(value!==undefined)node.textContent=value;return node;};
const reasons=Object.freeze({
 ONTOLOGY_CONTROL_DISABLED:'Read-only source access is disabled.',
 ONTOLOGY_ENDPOINT_NOT_CONFIGURED:'Auto Ontology HTTPS endpoint is not configured.',
 ONTOLOGY_ENDPOINT_UNSAFE:'Configured endpoint is not a safe public HTTPS origin.',
 ONTOLOGY_TOKEN_NOT_CONFIGURED:'External read credentials are not configured.',
 ONTOLOGY_AUTH_REJECTED:'External credentials were rejected.',
 ONTOLOGY_PERMISSION_UNVERIFIED:'Readiness permission is insufficient.',
 ONTOLOGY_TRANSPORT_HOLD:'External service was unreachable.',
 ONTOLOGY_UPSTREAM_HOLD:'External service was unavailable.',
 ONTOLOGY_RESPONSE_UNQUALIFIED:'External response could not be qualified.',
 SEMANTIC_LAYER_NOT_READY:'Compile the semantic catalog in Auto Ontology.',
 CONNECTION_NOT_READY:'Connect an authorized source database.',
 CATALOG_NOT_READY:'Complete source catalog ingestion.',
 ONTOLOGY_PROBE_FAILED:'The guarded readiness check failed.',
});
export function mountOntologyReadiness(host,check){
 if(typeof check!=='function')return ()=>{};
 const section=el('section');section.className='bi-ontology-commission';
 const heading=el('h3','NVIDIA Auto Ontology · connection');
 const detail=el('p','Read-only checks for semantic compilation, a live connection, and an ingested catalog. No VYNDI records are transmitted.');
 const button=el('button','Check NVIDIA ontology readiness');button.type='button';
 const status=el('p','Not checked. External service is optional.');status.setAttribute('role','status');
 section.append(heading,detail,button,status);host.append(section);
 let disposed=false;
 button.addEventListener('click',async()=>{
  button.disabled=true;status.textContent='Checking ontology readiness…';
  try{
   const data=await check();
   if(disposed)return;
   if(data?.schemaVersion!=='VAOS_NVIDIA_ONTOLOGY_READINESS_V1'||
      data.readOnly!==true||data.sourceDataTransferred!==false||
      data.productionWriteAuthorized!==false||data.modelAnswersVerified!==false||
      !['READY','HOLD'].includes(data.status))throw Error('INVALID');
   status.textContent=data.status==='READY'
    ?'READY — compiled semantic layer, database connection and catalog observed. Business answers still require independent validation.'
    :'HOLD — '+(reasons[data.reason]||'Connection cannot yet be qualified.');
  }catch{if(!disposed)status.textContent='HOLD — connection check was not completed.';}
  finally{if(!disposed)button.disabled=false;}
 });
 return ()=>{disposed=true;section.remove();};
}
