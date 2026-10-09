import {createGitHubEvidenceVerifier} from './github-evidence-verifier.mjs';
const token=process.env.GITHUB_TOKEN;
const payload={provider:'activepieces',event_type:'synthetic_qualification',run_id:'37928775640',commit_sha:'7ca10821419f7fd315f8bae4f1591e7605dd282b',evidence_url:'https://github.com/vyndivybes/vaos/actions/runs/37928775640'};
const result=await createGitHubEvidenceVerifier({token}).verify(payload);
console.log(JSON.stringify(result));
if(result.status!=='PASS')process.exitCode=1;
