// Deterministic, source-linked response. Repository text is untrusted DATA, never instructions.
const ALLOWED=new Set(['vayu-shastr/veloxis-engineering-design-manual','vyndivybes/vyndios','vyndivybes/vaos']);
const STOP=new Set(['what','when','where','which','about','status','current','latest','update','report','our','the','and','with','from','show','tell','please','this','that','their','have','progress','today','any','are','for']);

// Operational sales figures must come from an authorized transactional read,
// never source-code documentation. No sales connector is qualified in this flow.
export function classifyVoiceQuestion(question){
 const q=String(question||'').toLowerCase();
 if(/\b(sales|revenue|orders?|invoices?|customers?|deals?|pipeline|receivables?|quotations?)\b/.test(q))
   return 'LIVE_BUSINESS_RECORDS';
 return 'REPOSITORY_EVIDENCE';
}
export function unsupportedBusinessReadback(){
 return 'I can hear your sales status question. Sales and revenue require live authorized CRM or ERP transaction records. My current connection searches engineering and software repositories, not the sales ledger. I cannot verify sales totals, pipeline, or orders yet, and I will not invent figures.';
}

export function expandFollowup(question,prior=''){
 const q=String(question||'').trim(),p=String(prior||'').trim();
 if(!q||q.length>300)return '';
 return /\b(it|its|that|those|them|same|blockers|risks|next steps|what about)\b/i.test(q)&&p
   ? (p.slice(0,130)+' '+q).slice(0,300):q;
}
export function formatFederatedVoiceEvidence(data,query){
 if(!data||data.readOnly!==true||data.actionAuthorized!==false
   ||data.scope!=='ALLOWLISTED_GITHUB_CODE_METADATA'||!Array.isArray(data.evidence)
   ||!Array.isArray(data.failedSources))throw Error('FEDERATED_EVIDENCE_INVALID');
 const tokens=[...new Set((query.toLowerCase().match(/[a-z0-9]{4,}/g)||[]).filter(x=>!STOP.has(x)))];
 const items=[];
 for(const doc of data.evidence.slice(0,15)){
  if(!ALLOWED.has(doc.repository)||typeof doc.path!=='string'||doc.path.length>260
    ||typeof doc.sha!=='string'||!/^[0-9a-f]{40}$/i.test(doc.sha)
    ||!Array.isArray(doc.excerpts))continue;
  const url='https://github.com/'+doc.repository+'/blob/'+doc.sha+'/'+doc.path.split('/').map(encodeURIComponent).join('/');
  for(const excerpt of doc.excerpts.slice(0,3)){
   if(!Number.isInteger(excerpt.line)||excerpt.line<1||excerpt.line>1000000
     ||typeof excerpt.text!=='string')continue;
   const content=excerpt.text.replace(/[\r\n\x00-\x1f]+/g,' ').trim().slice(0,180);
   const relevance=tokens.filter(x=>content.toLowerCase().includes(x)||doc.path.toLowerCase().includes(x)).length;
   if(content.length>=12&&relevance>0)items.push({repository:doc.repository,path:doc.path,line:excerpt.line,url:url+'#L'+excerpt.line,excerpt:content,relevance});
  }
 }
 items.sort((a,b)=>b.relevance-a.relevance||a.repository.localeCompare(b.repository)||a.path.localeCompare(b.path)||a.line-b.line);
 const sources=items.slice(0,4);
 const failed=data.failedSources.filter(x=>ALLOWED.has(x));
 const answer=sources.length
  ? 'I found '+sources.length+' relevant excerpts from authenticated repository reads. '+
    sources.map((s,i)=>'Source '+(i+1)+', '+s.repository.split('/')[1]+', '+s.path.split('/').pop()+
      ', line '+s.line+': '+s.excerpt).join(' ')+
    ' These are source excerpts, not independently validated engineering conclusions.'
  : 'I could not find a relevant, verified excerpt in the indexed repository documents. This does not establish that no evidence exists.';
 const caveat=failed.length?' Some repositories were unavailable: '+failed.join(', ')+'.':'';
 return {answer:(answer+caveat).slice(0,2400),sources,failedSources:failed,actionAuthorized:false,mode:'DETERMINISTIC_SOURCE_EXCERPTS'};
}

/** Evidence-aware decision support, not a generative-model conclusion. */
export function makeGroundedSuggestions(report,question){
 if(!report||!Array.isArray(report.sources)||typeof question!=='string')throw Error('ADVICE_INVALID');
 const q=question.toLowerCase();
 if(!/\b(suggest|recommend|should|priority|prioriti[sz]e|risk|next step|improve|analyse|analyze)\b/.test(q))
   return null;
 if(report.sources.length===0)return {
   text:'I cannot recommend a project-specific action without matching verified source excerpts. Connect the relevant operational system or ask about an engineering record.',
   advisory:true,grounded:false};
 const corpus=report.sources.map(s=>s.excerpt.toLowerCase()).join(' ');
 const actions=[];
 if(/\b(block|hold|pending|open|unverified|not approved|failed|risk)\b/.test(corpus))
   actions.push('Prioritize a review of the open or unverified items in the linked source records before making a release decision.');
 if(/\b(test|fea|validate|validation|qualif|prototype)\b/.test(corpus))
   actions.push('Confirm the applicable validation evidence and acceptance criteria against the cited engineering documents.');
 if(/\b(supply|material|supplier|procure|lead time)\b/.test(corpus))
   actions.push('Check supplier readiness and material specifications against the current approved baseline.');
 if(actions.length===0)actions.push('Compare the cited evidence with the current approved baseline and identify owners for any unresolved decisions.');
 return {text:'Suggested next checks, not an authorization: '+actions.slice(0,3).join(' ')+' These are conservative suggestions based on the linked excerpts, not conclusions from a generative AI model.',
 advisory:true,grounded:true};
}
