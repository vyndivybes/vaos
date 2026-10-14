/**
 * G7: deterministic, bounded citation extraction from an untrusted local-file
 * excerpt. These lines are NOT an independently verified document revision.
 * Neither a model nor client-supplied file hashes can authorize release.
 */
const WORDS=new Set(['which','whose','about','where','when','have','been','will','what','does','this','that','they','there','their','from','with','without','into','could','would','should','please','document','source','explain','describe','summarize','summary','status','current','your','ours','does','using']);
const INJECTION=/(?:ignore\s+(?:all\s+)?(?:previous|above|prior|system|developer)\s+instructions|(?:system|developer)\s*:\s*|you\s+are\s+now\s+an?\s+|transfer\s+(?:the\s+)?(?:secrets?|credentials?|tokens?)|(?:send|upload|exfiltrate)\b[^\n]{0,80}\b(?:secret|password|token|credential|private key))/i;
const UNSAFE_CLAIM=/(?:\b(?:is|are|was|were|has been|have been|now)\s+(?:fully\s+)?(?:approved|certified|production.ready|released|validated\s+for\s+production)\b|\b(?:production|payment|purchase|release)\s+(?:is\s+)?(?:approved|authorized|certified)\b|\b(?:permission granted|payment executed|purchase order issued|release is authorized|proceed with (?:manufacturing|production|payment))\b)/i;
const SECRET=/\b(?:BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY|sk-[a-z0-9_-]{20,}|ghp_[a-z0-9]{20,})\b/i;
export function hasUntrustedInstruction(text){
 return typeof text!=='string'||INJECTION.test(text)||SECRET.test(text);
}
export function selectDocumentEvidence(text,question,{limit=5}={}){
 if(typeof text!=='string'||text.length<60||text.length>12000
  ||typeof question!=='string'||question.length<5||question.length>1200
  ||!Number.isInteger(limit)||limit<1||limit>8)throw Error('DOCUMENT_EVIDENCE_INPUT_INVALID');
 if(hasUntrustedInstruction(text)||hasUntrustedInstruction(question))throw Error('UNTRUSTED_SOURCE_INSTRUCTIONS');
 const terms=[...new Set((question.toLowerCase().match(/[a-z0-9]{4,}/g)||[]).filter(t=>!WORDS.has(t)))].slice(0,16);
 const general=/\b(?:summari[sz]e|overview|main points|key points|outline)\b/i.test(question);
 const candidates=text.split(/\r?\n/).map((line,index)=>{
  const normalized=line.replace(/[\x00-\x1f\x7f]/g,' ').trim();
  const matches=terms.filter(w=>normalized.toLowerCase().includes(w)).length;
  return {line:index+1,text:normalized.slice(0,260),matches};
 }).filter(row=>row.text.length>=12&&!hasUntrustedInstruction(row.text));
 const chosen=candidates.filter(x=>general||x.matches>0)
  .sort((a,b)=>b.matches-a.matches||a.line-b.line).slice(0,limit);
 return chosen.sort((a,b)=>a.line-b.line).map(({line,text})=>({line,text}));
}
export function validateMultimodalAdvisory(value){
 if(typeof value!=='string'||value.trim().length<15||value.length>12000
   ||hasUntrustedInstruction(value)||UNSAFE_CLAIM.test(value))throw Error('MODEL_CLAIM_UNSUPPORTED');
 const normalized=value.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
 if(normalized.length>2500)throw Error('MODEL_CLAIM_UNSUPPORTED');
 return normalized;
}
export function validateClientDocumentSource(source,actualExcerptHash){
 if(source===undefined||source===null)return null;
 if(!source||typeof source!=='object'||Array.isArray(source)
   ||Object.keys(source).sort().join(',')!=='excerptSha256,fileSha256,name'
   ||typeof source.name!=='string'||source.name.length>128
   ||!/^[a-zA-Z0-9][a-zA-Z0-9 _().-]{0,127}\.(pdf|docx|pptx)$/i.test(source.name)
   ||! /^[a-f0-9]{64}$/.test(source.fileSha256||'')
   ||! /^[a-f0-9]{64}$/.test(source.excerptSha256||''))throw Error('DOCUMENT_SOURCE_INVALID');
 if(source.excerptSha256!==actualExcerptHash)throw Error('DOCUMENT_SOURCE_HASH_MISMATCH');
 return Object.freeze({fileName:source.name,fileSha256:source.fileSha256,
  fileHashAuthority:'CLIENT_DECLARED_PRIOR_CONVERSION'});
}
