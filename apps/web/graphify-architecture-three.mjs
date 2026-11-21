/**
 * Opt-in local Three.js rendering of Graphify-PINNED code import edges.
 * Never infer runtime neurosemantic links or operational business lineage.
 * Accessible node buttons, search and 2D SVG remain mounted by the caller.
 */
import {GRAPHIFY_VAOS_SNAPSHOT} from './graphify-architecture-model.mjs';

export async function mountGraphifyArchitectureThree(stage,projection,{onSelect}={}){
 if(!stage||!projection||typeof window==='undefined')throw Error('GRAPHIFY_3D_UNAVAILABLE');
 const THREE=await import('./vendor/three.module.min.js');
 let renderer;
 try{
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
 }catch{throw Error('WEBGL_NOT_AVAILABLE');}
 const canvas=renderer.domElement;
 canvas.className='gf-three-canvas';
 canvas.setAttribute('tabindex','0');
 canvas.setAttribute('role','img');
 canvas.setAttribute('aria-label','Interactive Three.js view of pinned Graphify code imports. Drag to rotate; use the adjacent keyboard-accessible node list to inspect dependencies.');
 stage.insertBefore(canvas,stage.firstChild);
 const scene=new THREE.Scene();
 scene.background=new THREE.Color('#071523');
 const camera=new THREE.PerspectiveCamera(45,1,.1,100);
 const pivot=new THREE.Group();scene.add(pivot);
 const groups=['knowledge','analytics','business','runtime'];
 const palette={knowledge:'#d1aaff',analytics:'#70d4ff',business:'#5de8b5',runtime:'#ffbf89'};
 const geometries=[],materials=[],items=new Map(),meshes=[];
 const ballGeometry=new THREE.IcosahedronGeometry(.27,1);geometries.push(ballGeometry);
 const countByGroup=new Map(groups.map(g=>[g,projection.nodes.filter(n=>n.group===g).length]));
 const cursor=new Map(groups.map(g=>[g,0]));
 for(const n of projection.nodes){
  const idx=groups.indexOf(n.group),count=countByGroup.get(n.group);
  const k=cursor.get(n.group);cursor.set(n.group,k+1);
  const angle=(k+.35)*2.3999632297;
  const layer=idx*1.35-2.05;
  const radius=1.25+Math.sqrt((k+.5)/Math.max(1,count))*1.3;
  const material=new THREE.MeshBasicMaterial({color:palette[n.group]||'#ffffff'});
  materials.push(material);
  const mesh=new THREE.Mesh(ballGeometry,material);
  mesh.position.set(layer,Math.sin(angle)*radius,Math.cos(angle)*radius*.95);
  mesh.userData.nodeId=n.id;
  mesh.scale.setScalar(n.group==='business'?1.2:1);
  pivot.add(mesh);items.set(n.id,mesh);meshes.push(mesh);
 }
 const segmentPositions=[];
 for(const edge of projection.edges){
  const a=items.get(edge.from),b=items.get(edge.to);
  if(!a||!b)continue;
  segmentPositions.push(a.position.x,a.position.y,a.position.z,b.position.x,b.position.y,b.position.z);
 }
 const edgeGeo=new THREE.BufferGeometry();
 edgeGeo.setAttribute('position',new THREE.Float32BufferAttribute(segmentPositions,3));
 geometries.push(edgeGeo);
 const edgeMaterial=new THREE.LineBasicMaterial({color:'#81a9c6',transparent:true,opacity:.52});
 materials.push(edgeMaterial);
 pivot.add(new THREE.LineSegments(edgeGeo,edgeMaterial));
 const guides=new THREE.Group();pivot.add(guides);
 const ringGeometry=new THREE.TorusGeometry(3.45,.008,3,112);geometries.push(ringGeometry);
 for(let i=0;i<2;i++){
  const mat=new THREE.MeshBasicMaterial({color:i===0?'#70d4ff':'#d1aaff',transparent:true,opacity:.22});
  materials.push(mat);
  const ring=new THREE.Mesh(ringGeometry,mat);
  ring.rotation.x=i===0?.62:1.22;
  ring.rotation.y=i===0?.24:.65;
  guides.add(ring);
 }
 const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 let disposed=false,frame=0,drag=null,yaw=.16,pitch=-.1,targetYaw=yaw,targetPitch=pitch;
 const ray=new THREE.Raycaster(),point=new THREE.Vector2();
 const shouldReduce=()=>reduce?.matches===true;
 function requestDraw(){if(!disposed&&!frame)frame=window.requestAnimationFrame(draw);}
 function draw(){
  frame=0;
  if(disposed||document.hidden)return;
  if(shouldReduce()){yaw=targetYaw;pitch=targetPitch;}
  else{yaw+=(targetYaw-yaw)*.23;pitch+=(targetPitch-pitch)*.23;}
  pivot.rotation.y=yaw;pivot.rotation.x=pitch;
  camera.position.set(0,0,10.8);camera.lookAt(0,0,0);
  renderer.render(scene,camera);
  if(Math.abs(yaw-targetYaw)>.002||Math.abs(pitch-targetPitch)>.002)requestDraw();
 }
 function resize(){
  if(disposed)return;
  const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.setSize(w,h,false);
  camera.aspect=w/h;camera.updateProjectionMatrix();requestDraw();
 }
 function pick(event){
  const bounds=canvas.getBoundingClientRect();
  if(!bounds.width||!bounds.height)return;
  point.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);
  ray.setFromCamera(point,camera);
  const hit=ray.intersectObjects(meshes,false)[0]?.object?.userData?.nodeId;
  if(hit)onSelect?.(hit);
 }
 function down(e){drag={x:e.clientX,y:e.clientY,moved:false};canvas.setPointerCapture?.(e.pointerId);}
 function move(e){
  if(!drag||shouldReduce())return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(Math.abs(dx)+Math.abs(dy)>2)drag.moved=true;
  targetYaw+=dx/195;targetPitch=Math.max(-.8,Math.min(.8,targetPitch+dy/210));
  drag.x=e.clientX;drag.y=e.clientY;requestDraw();
 }
 function up(e){if(!drag)return;const moved=drag.moved;drag=null;if(!moved)pick(e);}
 function key(e){
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape'].includes(e.key))return;
  e.preventDefault();
  if(e.key==='Escape'){targetYaw=0;targetPitch=0;}
  if(e.key==='ArrowLeft')targetYaw-=.16;
  if(e.key==='ArrowRight')targetYaw+=.16;
  if(e.key==='ArrowUp')targetPitch=Math.max(-.8,targetPitch-.14);
  if(e.key==='ArrowDown')targetPitch=Math.min(.8,targetPitch+.14);
  requestDraw();
 }
 function lost(e){e.preventDefault();dispose();}
 const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);
 canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
 canvas.addEventListener('keydown',key);canvas.addEventListener('webglcontextlost',lost);
 document.addEventListener('visibilitychange',requestDraw);
 window.addEventListener('resize',resize);
 reduce?.addEventListener?.('change',requestDraw);
 observer?.observe(stage);resize();
 function dispose(){
  if(disposed)return;
  disposed=true;
  if(frame)window.cancelAnimationFrame(frame);
  observer?.disconnect();
  canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);
  canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);
  canvas.removeEventListener('keydown',key);canvas.removeEventListener('webglcontextlost',lost);
  document.removeEventListener('visibilitychange',requestDraw);
  window.removeEventListener('resize',resize);
  reduce?.removeEventListener?.('change',requestDraw);
  for(const geometry of geometries)geometry.dispose();
  for(const material of materials)material.dispose();
  renderer.dispose();renderer.forceContextLoss?.();canvas.remove();
 }
 return {dispose};
}
