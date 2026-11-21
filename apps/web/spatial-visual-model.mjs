/**
 * Visual classification only; categories and decorative points do not certify
 * source authority, runtime links or graph edges.
 */
export const SPATIAL_SPECTRUM=Object.freeze({
 control:Object.freeze({label:'Control plane',hex:'#5af7cd'}),
 graph:Object.freeze({label:'Graph services',hex:'#70c9ff'}),
 knowledge:Object.freeze({label:'Knowledge',hex:'#ddbaff'}),
 engineering:Object.freeze({label:'Engineering',hex:'#ffb37d'})
});
const GRAPH=new Set(['Graphify','Graphiti','Brain Graph','Neural Schema']);
const CONTROL=new Set(['VAOS','VYNDI OS']);
const ENGINEERING=new Set(['VEDM']);
export function categoryForSpatialNode(id){
 if(CONTROL.has(id))return 'control';
 if(GRAPH.has(id))return 'graph';
 if(ENGINEERING.has(id))return 'engineering';
 return 'knowledge';
}
function coordinate(value){
 if(typeof value!=='string'||!/^[-+]?\d+(?:\.\d+)?px$/.test(value))throw Error('Invalid spatial coordinate');
 const number=Number(value.slice(0,-2));
 if(!Number.isFinite(number)||Math.abs(number)>2000)throw Error('Invalid spatial coordinate');
 return number;
}
export function projectSpatialLayout(layout){
 if(!Array.isArray(layout)||layout.length<1||layout.length>40)throw Error('Invalid spatial layout');
 const seen=new Set();
 return layout.map(entry=>{
  if(!Array.isArray(entry)||entry.length!==4)throw Error('Invalid spatial entry');
  const [id,x,y,z]=entry;
  if(typeof id!=='string'||!id.trim())throw Error('Invalid spatial node');
  if(seen.has(id))throw Error('Duplicate spatial node');
  seen.add(id);
  return Object.freeze({
   id,category:categoryForSpatialNode(id),
   x:coordinate(x)/84,y:-coordinate(y)/84,z:coordinate(z)/125
  });
 });
}
export function makeSpatialStars(count=144){
 if(!Number.isInteger(count)||count<0||count>300)throw Error('Invalid atmosphere point count');
 return Array.from({length:count},(_,index)=>{
  const phase=(index+.5)/Math.max(count,1);
  const theta=index*2.399963229728653;
  const latitude=Math.acos(1-2*phase);
  const radius=4.2+(index%9)*.23;
  return Object.freeze({
   x:Math.cos(theta)*Math.sin(latitude)*radius,
   y:Math.sin(theta)*Math.sin(latitude)*radius,
   z:Math.cos(latitude)*radius-2.6
  });
 });
}
