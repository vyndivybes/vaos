import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {exchangeLatestKey} from '../../../intelligence/agent-intelligence-exchange.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';

export function createAgentExchangeHandler(){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='GET'){
      res.setHeader('Allow','GET');
      return res.status(405).json(apiError('METHOD_NOT_ALLOWED','Read-only GET required'));
    }
    const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
    if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in required'));
    if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder identity required'));
    let period='daily';
    try{
      const u=new URL(req.url);
      if([...u.searchParams.keys()].some(k=>k!=='period')||u.searchParams.getAll('period').length>1)throw Error();
      if(u.searchParams.has('period'))period=u.searchParams.get('period');
      exchangeLatestKey(period);
    }catch{return res.status(422).json(apiError('EXCHANGE_PERIOD_INVALID','Use daily, weekly or monthly'));}
    const bucket=req.env?.VAOS_ARTIFACTS;
    if(typeof bucket?.get!=='function')return res.status(503).json(
      apiError('EXCHANGE_ARCHIVE_UNAVAILABLE','Private report archive unavailable'));
    try{
      const object=await bucket.get(exchangeLatestKey(period));
      if(!object)return res.status(404).json(apiError('EXCHANGE_REPORT_NOT_FOUND','No archived report for this period'));
      const record=JSON.parse(await object.text());
      if(record?.schemaVersion!=='VAOS_AGENT_EXCHANGE_V1'||
        record?.period?.kind!==period||record.readOnly!==true||
        record.productionWriteAuthorized!==false||!Array.isArray(record.agents)||
        record.jarvis?.semanticMemoryUpdated!==false)throw Error('INVALID_REPORT');
      return res.status(200).json({data:record});
    }catch{return res.status(503).json(apiError('EXCHANGE_ARCHIVE_UNVERIFIED',
      'Archived intelligence report failed verification'));}
  };
}
export default createAgentExchangeHandler();
