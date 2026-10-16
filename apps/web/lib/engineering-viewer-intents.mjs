// Deterministic, read-only commands for inspecting uploaded engineering geometry.
// Never infer mesh authority, generate CAD, modify files or approve a release.
export function planEngineeringViewerQuestion(question){
 if(typeof question!=='string'||question.trim().length<3||question.length>220||/[\x00-\x1f\x7f]/.test(question))return{kind:'DENY'};
 const q=question.toLowerCase().replace(/^(?:hey\s+)?jarvis[,:]?\s*/,'').trim();
 if(/\b(?:generate|create|export|write|edit|change|modify|approve|release|manufactur|print|issue|delete|upload|download|run\s+fea|simulate|optimi[sz]e)\b/.test(q)
 ||/\b(?:fork|tire|tyre|clearance|wall\s+thickness|stress|strain|fatigue|fea|mass|weight|material\s+properties)\b/.test(q))
  return{kind:'DENY'};
 if(/\b(?:top|overhead|bird.?s.?eye)\b/.test(q))return{kind:'VIEW',view:'TOP'};
 if(/\b(?:side|profile|left|right)\b/.test(q))return{kind:'VIEW',view:'SIDE'};
 if(/\b(?:front|head.on|head\s+on)\b/.test(q))return{kind:'VIEW',view:'FRONT'};
 if(/\b(?:isometric|default|reset|home\s+view)\b/.test(q))return{kind:'VIEW',view:'ISOMETRIC'};
 if(/\bzoom\s*(?:in|closer)\b/.test(q))return{kind:'ZOOM',factor:1.3};
 if(/\bzoom\s*(?:out|away)\b/.test(q))return{kind:'ZOOM',factor:1/1.3};
 if(/\b(?:bounds|bounding\s+box|coordinate\s+envelope|dimensions?|length|width|height|size)\b/.test(q))return{kind:'BOUNDS'};
 if(/\b(?:source|revision|provenance|sha|file\s+hash)\b/.test(q))return{kind:'PROVENANCE'};
 return{kind:'UNKNOWN'};
}
export function describeEngineeringBounds(mesh,units='UNSPECIFIED'){
 if(!mesh?.bounds||!Array.isArray(mesh.bounds.span)||mesh.bounds.span.length!==3||mesh.bounds.span.some(x=>!Number.isFinite(x)||x<0))throw Error('ENGINEERING_BOUNDS_UNAVAILABLE');
 const rounded=x=>Number(x.toFixed(3)).toLocaleString('en-US',{maximumFractionDigits:3});
 const dimensions=mesh.bounds.span.map(rounded).join(' by ');
 const unitLabel=units==='mm'?'declared millimetres':units==='m'?'declared metres':'unspecified coordinate units';
 const basis=mesh.kind==='STEP_REFERENCE_POINTS_ONLY'?'STEP reference points only, NOT the solid boundary':
 mesh.kind?.endsWith('TRIANGLES')?'STL triangle vertex coordinates':'unverified input geometry';
 return 'The uploaded '+basis+' spans '+dimensions+' in '+unitLabel+' along X, Y, Z respectively. These are source-coordinate bounds only. They do not establish physical clearances, material performance, manufacturing tolerance, or engineering authority.';
}
