import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {makeCommercialReader} from './voice-commercial.mjs';
import {getVyndiBridgeRoute} from '../../../packages/contracts/vyndi-write-bridge.mjs';
import {claimVoiceAiDailyBudget} from '../lib/voice-ai-focus.mjs';
import {rankAdvisoryOptions} from '../lib/business-advice-ai.mjs';
import {qualifyPublicHeadlines} from '../lib/public-research-evidence.mjs';
import {buildPlanningCycle} from '../lib/business-planning-cycle.mjs';
import {ADVISORY_LANGUAGES,isAdvisoryQuestion,chooseAdviceSources,externalTopic,
  observeAdviceDomain,buildAdvisoryReport,checkTranslation} from '../lib/business-advice.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
const CONTROL='founder-readonly-browser-v1';
const INDIC='@cf/ai4bharat/indictrans2-en-indic-1B';
const headlinesNeeded=/\b(compare|benchmark|web|market|industry|trend|research online|competitor)\b/i;
const xmlEntities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
function clean(value){return String(value||'').replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi,(m,x)=>{
 if(x.startsWith('#')){const n=x[1].toLowerCase()==='x'?Number.parseInt(x.slice(2),16):Number(x.slice(1));
  return Number.isInteger(n)&&n>=32&&n<=126?String.fromCharCode(n):' ';}
 return xmlEntities[x.toLowerCase()]||m;
}).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();}
export function parsePublicNewsFeed(xml){
 if(typeof xml!=='string'||xml.length>90000||xml.length<30||!/<rss[ >]/i.test(xml))return [];
 const items=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].slice(0,12);
 const found=[];
 for(const [,item] of items){
  const title=clean(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
  const url=clean(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1]).replace(/\?oc=\d{1,2}$/, '');
  const published=clean(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]);
  const publisher=clean(item.match(/<source(?:\s+[^>]*)?>([\s\S]*?)<\/source>/i)?.[1]);
  if(title.length<8||title.length>230||!/^https:\/\/news\.google\.com\/rss\/articles\/[A-Za-z0-9_-]+$/.test(url))continue;
  found.push({title,url,publisher,published:Number.isFinite(Date.parse(published))?new Date(published).toISOString():'unknown'});
  if(found.length===3)break;
 }
 return found;
}
async function getExternalHeadlines(question,fetchImpl){
 if(!headlinesNeeded.test(question))return [];
 // Public fixed phrase, not free-form or sensitive company data.
 const topic=externalTopic(question);
 const url='https://news.google.com/rss/search?q='+encodeURIComponent(topic)+
  '&hl=en-IN&gl=IN&ceid=IN:en';
 try{
  const reply=await fetchImpl(url,{method:'GET',redirect:'manual',
   headers:{'Accept':'application/rss+xml, application/xml'},
   signal:AbortSignal.timeout(3500)});
  if(!reply.ok||reply.status>=300)return [];
  const contentType=String(reply.headers?.get('content-type')||'');
  if(!/xml|rss/i.test(contentType))return [];
  const content=await reply.text();
  return parsePublicNewsFeed(content);
 }catch{return [];}
}
export async function translateAdvisory(ai,original,lang){
 const target=ADVISORY_LANGUAGES[lang]?.ai;
 if(!target||typeof ai?.run!=='function'||original.length>3200)throw Error('TRANSLATION_NOT_AVAILABLE');
 const translated=await ai.run(INDIC,{text:original.slice(0,3200),target_language:target});
 const value=translated?.translations?.[0];
 if(!checkTranslation(original,value))throw Error('TRANSLATION_NOT_QUALIFIED');
 return value;
}
export function createBusinessAdvisorHandler({getReader=makeCommercialReader,
 fetchImpl=globalThis.fetch,claim=claimVoiceAiDailyBudget,translate=translateAdvisory,now=()=>new Date()}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET')return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Only the founder can view cross-domain business advice'));
  if(req.env?.VAOS_VOICE_CONTROL!==CONTROL)return res.status(409).json(apiError('VOICE_DISABLED','Founder assistant is not authorized'));
  let params;try{params=new URL(req.url).searchParams;}catch{return res.status(422).json(apiError('QUERY_INVALID','URL invalid'));}
  const question=params.get('q')||'',lang=params.get('lang')||'en';
  if(!isAdvisoryQuestion(question)||/[\x00-\x1f\x7f]/.test(question)
   ||!Object.hasOwn(ADVISORY_LANGUAGES,lang))return res.status(422).json(apiError('ADVISORY_QUERY_INVALID','A bounded read-only business question and supported reply language are required'));
  let reader=null;try{reader=getReader(req.env);}catch{}
  const specs=chooseAdviceSources(question);
  const observations=await Promise.all(specs.map(async spec=>{
   const contract=getVyndiBridgeRoute(spec.actionType);
   if(!reader||!contract||contract.effectClass!=='read'||contract.executionEnabled!==true)
    return {domain:spec.domain,status:'HOLD'};
   try{
    const result=await reader.execute({actionType:spec.actionType,
     id:'advisor:'+crypto.randomUUID(),intentId:'advisor:'+crypto.randomUUID(),
     payload:{limit:50,missionId:'vaos-readonly-advisory'}});
    if(result?.actionType!==spec.actionType||result?.sourceAuthority!==contract.authority)
     return {domain:spec.domain,status:'HOLD'};
    const observation=observeAdviceDomain(spec.domain,result.data);
    return {domain:spec.domain,status:'OBSERVED',observation};
   }catch{return {domain:spec.domain,status:'HOLD'};}
  }));
  const external=await getExternalHeadlines(question,fetchImpl);
  const publicResearch=qualifyPublicHeadlines(external,{asOf:now().toISOString().slice(0,10)});
  const report=buildAdvisoryReport({question,sources:observations,web:publicResearch.items});
  // A news aggregator is a discovery source, not independent price/market
  // verification. Expose source freshness and diversity as distinct evidence.
  if(headlinesNeeded.test(question)){
   const label=publicResearch.status==='MULTI_PUBLISHER_HEADLINES'
    ?publicResearch.items.length+' recent public headlines from '+publicResearch.publishers.length+' named publishers (not article-verified)'
    :publicResearch.status==='SINGLE_PUBLISHER_HEADLINES'
      ?'Recent headlines from one publisher; no independent corroboration'
      :publicResearch.status==='SINGLE_HEADLINE_UNVERIFIED'
        ?'Only one recent public headline passed checks; no independent corroboration'
        :'No recent, dated public headlines passed provenance checks';
   report.answer+='\n\nRESEARCH QUALITY — '+label+'. Not a verified market benchmark, supplier price comparison or basis for purchases.';
  }

  // Read-only, deterministic planning evidence. The current ERP bridge exposes
  // bounded recent records, NOT an independently complete monthly history.
  // Consequently six-month projections remain HOLD pending a signed source.
  const planningCycle=buildPlanningCycle({question,observations});
  const planGates=planningCycle.holds.length?planningCycle.holds.join(', '):'No missing sampled-domain sources; underlying reconciliation is still a human gate';
  report.answer+='\n\nPLAN GATES — '+planningCycle.state+'. '+planGates+
    '. Next: '+planningCycle.steps[0].instruction;
  if(/\b(forecast|predict|projection|six.month|6.month|next.*month)\b/i.test(question))
   report.answer+='\n\nFORECAST QUALIFICATION — HOLD: no independently reconciled, complete, signed twelve-month order-unit history is currently exposed by the VAOS bridge. '+planningCycle.forecastReadiness.holds.join(', ')+'.';
  const data={...report,planningCycle,publicResearch,language:lang,translationQualified:lang==='en',
   languageNote:lang==='en'?'English source-backed report': 'English source-backed report retained if translation verification fails',
   voiceLanguage:lang,observedAt:new Date().toISOString()};
  // Source-bounded agent selects between two existing low-risk plans.
  // The model sees only domain/count/availability, never private ERP rows,
  // the raw founder request, or unverified news headlines. Advisory only.
  data.agenticRecommendation='DETERMINISTIC_ONLY';
  if(report.status==='OBSERVED'&&req.env?.AI?.run&&req.env?.VAOS_ARTIFACTS){
   try{
    const quota=await claim(req.env.VAOS_ARTIFACTS);
    if(quota?.allowed===true){
     const ranking=await rankAdvisoryOptions({ai:req.env.AI,domain:specs[0].domain,observations});
     data.answer+='\n\nAI RANKING — Model-assisted option ranking (unverified advisory): prefer option '+ranking.choice+
      '. Reason: '+ranking.reason+' Human approval is still required.';
     data.agenticRecommendation='MODEL_ASSISTED_UNVERIFIED';
     data.modelInvoked=true;
    }
   }catch{data.agenticRecommendation='DETERMINISTIC_ONLY';}
  }
  // The existing R2 budget limits inferencing; no paid API key or new service.
  // Translation cannot add claims or change any numeral in the base report.
  if(lang!=='en'&&typeof req.env?.AI?.run==='function'&&req.env?.VAOS_ARTIFACTS){
   try{
    const quota=await claim(req.env.VAOS_ARTIFACTS);
    if(quota?.allowed===true){
     const translated=await translate(req.env.AI,data.answer,lang);
     if(checkTranslation(data.answer,translated)){
      data.answer=translated;
      data.spokenAnswer=translated.trim().replace(/\s+/g,' ').slice(0,310);
      data.translationQualified=true;
      data.languageNote='Verified numerical consistency; qualitative translation is advisory';
     }
    }
   }catch{data.translationQualified=false;}
  }
  return res.status(200).json({data});
 };
}
export default createBusinessAdvisorHandler();
