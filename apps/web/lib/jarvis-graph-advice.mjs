import {queryGraphPaths} from './jarvis-graph-paths.mjs';
const DOMAIN={quality:'QA_CAPA','qa capa':'QA_CAPA',engineering:'ENGINEERING_BASELINE','engineering baseline':'ENGINEERING_BASELINE','project risk':'PROJECT_RISK'};
const LABEL={QA_CAPA:'quality',ENGINEERING_BASELINE:'engineering baseline',PROJECT_RISK:'project risk'};
export function resolveGraphQuestion(question){
 if(typeof question!=='string')return null;
 const match=/^(?:trace|show) (?:the )?recorded (?:links|paths) from (quality|qa capa|engineering|engineering baseline|project risk) to (quality|qa capa|engineering|engineering baseline|project risk)[?.]?$/i.exec(question.trim().replace(/\s+/g,' '));
 if(!match)return null;
 const from=DOMAIN[match[1].toLowerCase()],to=DOMAIN[match[2].toLowerCase()];
 return from===to?null:{from,to};
}
export function buildGraphAdvice(graph,query){
 const paths=queryGraphPaths(graph,query);
 const references=paths.paths.map((steps,i)=>({citation:i+1,linkIds:steps.map(x=>x.id),
  domains:[steps[0].sourceDomain,...steps.map(x=>x.targetDomain)],
  relationTypes:steps.map(x=>x.relationType)}));
 const finding=references.length
  ?'Recorded directed paths from '+LABEL[query.from]+' to '+LABEL[query.to]+': '+references.length+'.'
  :'No directed path was observed from '+LABEL[query.from]+' to '+LABEL[query.to]+' within this bounded projection.';
 const citations=references.map(x=>'['+x.citation+'] '+x.domains.map(d=>LABEL[d]).join(' → ')).join('\n');
 const limits='Source freshness, record versions, signatures and causality are unverified. The graph is incomplete; no observed path does not establish absence of a relationship.';
 return {status:references.length?'OBSERVED':'HOLD',
  answer:'RECORDED LINK EVIDENCE — '+finding+(citations?'\n\nPATH REFERENCES —\n'+citations:'')+
   '\n\nSOURCE LIMITS — '+limits+
   (paths.boundedSearchComplete?'':' Search or result limits were reached.')+
   '\n\nREVIEW — Independently check the referenced source records and current engineering approvals before relying on these links. No agent was dispatched.',
  spokenAnswer:finding+' These are recorded links, not verified causes. Independent source review is required.',
  governedGraph:paths,pathReferences:references,sourceSystem:'VAOS_ADAPTIVE',sources:[],
  sourceCoverage:{observed:paths.eligibleLinkCount?1:0,requested:1},
  planningMode:'DETERMINISTIC_GRAPH_QUERY',reasoningMode:'DIRECTED_LINK_METADATA',
  selectedTools:['GOVERNED_GRAPH'],executionCount:1,modelCalls:0,citationCount:references.length,
  qualifiedAgentConsensus:false,productionPlanningEligible:false,
  actionAuthorized:false,automationExecuted:false,agentDispatchAuthorized:false,
  readOnly:true,advisoryOnly:true};
}
