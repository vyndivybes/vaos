const finitePoint=p=>p.length===3&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<1e12);
export function parseEngineeringMesh(buffer,name){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<20||buffer.byteLength>18000000)throw Error('MESH_FILE_INVALID');
 let vertices=[],kind='';
 if(/\.stl$/i.test(name)){
  const view=new DataView(buffer),count=buffer.byteLength>=84?view.getUint32(80,true):0;
  if(count>0&&count<=200000&&84+count*50===buffer.byteLength){
   kind='BINARY_STL_TRIANGLES';for(let i=0;i<count;i++)for(let p=0;p<3;p++){const at=84+i*50+12+p*12;vertices.push([view.getFloat32(at,true),view.getFloat32(at+4,true),view.getFloat32(at+8,true)]);}
  }else{
   const text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);if(!/^\s*solid\b/i.test(text)||! /endsolid\b/i.test(text))throw Error('STL_FORMAT_INVALID');
   const number='([-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?)';const pattern=new RegExp('\\bvertex\\s+'+number+'\\s+'+number+'\\s+'+number,'gi');
   for(const match of text.matchAll(pattern)){vertices.push(match.slice(1,4).map(Number));if(vertices.length>600000)throw Error('MESH_TOO_LARGE');}
   if(!vertices.length||vertices.length%3!==0)throw Error('STL_TRIANGLES_INVALID');kind='ASCII_STL_TRIANGLES';
  }
 }else if(/\.(step|stp)$/i.test(name)){
  const text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);if(!/ISO-10303-21;/.test(text))throw Error('STEP_FORMAT_INVALID');
  const number='([-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?)';
  const pattern=new RegExp("#\\d+\\s*=\\s*CARTESIAN_POINT\\s*\\(\\s*'[^']*'\\s*,\\s*\\(\\s*"+number+'\\s*,\\s*'+number+'\\s*,\\s*'+number+'\\s*\\)\\s*\\)','gi');
  for(const match of text.matchAll(pattern)){vertices.push(match.slice(1,4).map(Number));if(vertices.length>600000)throw Error('MESH_TOO_LARGE');}
  if(!vertices.length)throw Error('STEP_CARTESIAN_POINTS_UNAVAILABLE');kind='STEP_REFERENCE_POINTS_ONLY';
 }else throw Error('ENGINEERING_FORMAT_UNSUPPORTED');
 if(vertices.some(p=>!finitePoint(p)))throw Error('MESH_COORDINATES_INVALID');
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of vertices)for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
 const span=max.map((v,i)=>v-min[i]),scale=Math.max(...span);if(scale<=0)throw Error('MESH_HAS_NO_EXTENT');
 return {kind,vertices,bounds:{min,max,span},centre:max.map((v,i)=>(v+min[i])/2),scale,
  notice:kind==='STEP_REFERENCE_POINTS_ONLY'?'STEP Cartesian reference/control points only. BREP/NURBS surfaces are not tessellated and these points are not a complete solid.':'Actual uploaded STL triangle geometry. STL units are declared by the user; no FEA or design release is inferred.'};
}
export function compareEngineeringVertices(first,second,{limit=1000}={}){
 if(!first?.vertices?.length||!second?.vertices?.length||!Number.isInteger(limit)||limit<1||limit>1500)throw Error('MESH_COMPARE_INVALID');
 const sample=mesh=>mesh.vertices.filter((_,i)=>i%Math.max(1,Math.ceil(mesh.vertices.length/limit))===0);
 const a=sample(first),b=sample(second);let maxDistance=0,sum=0;
 for(const p of a){let distance=Infinity;for(const q of b){const d=(p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2;if(d<distance)distance=d;}const value=Math.sqrt(distance);maxDistance=Math.max(maxDistance,value);sum+=value;}
 return {method:'SAMPLED_ONE_WAY_NEAREST_VERTEX',firstSampleCount:a.length,secondSampleCount:b.length,maxDistance,meanDistance:sum/a.length,
  notice:'Sampled vertex comparison in the declared common units. It is not a surface tolerance, symmetric Hausdorff distance, fit/alignment, FEA result or acceptance decision.'};
}
