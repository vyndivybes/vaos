/**
 * Optional Three.js factory dashboard, fed exclusively by validated scenario data.
 * All geometry and process sequencing are illustrative. No machine telemetry exists here.
 * The original 2D canvas and accessible station list are retained by the caller.
 */
import {factorySceneStations,FACTORY_SPECTRUM} from './factory-three-model.mjs';

export async function mountFactoryThree(canvas,rawStations,{
 selectedId,onSelect,onUnavailable,reducedMotion=false
}={}){
 const stations=factorySceneStations(rawStations);
 if(!canvas||typeof window==='undefined')throw Error('FACTORY_THREE_UNAVAILABLE');
 const THREE=await import('./vendor/three.module.min.js');
 let renderer;
 try{
  renderer=new THREE.WebGLRenderer({
   antialias:true,alpha:false,powerPreference:'low-power',preserveDrawingBuffer:false
  });
 }catch{throw Error('WEBGL_NOT_AVAILABLE');}
 renderer.domElement.className='av-factory-three-canvas';
 renderer.domElement.setAttribute('role','img');
 renderer.domElement.setAttribute('tabindex','0');
 renderer.domElement.setAttribute('aria-label','Scenario-only 3D factory topology. Drag to orbit, use arrow keys to rotate or the station buttons below to inspect. No live machine telemetry.');
 canvas.after(renderer.domElement);

 const scene=new THREE.Scene();
 scene.background=new THREE.Color('#081725');
 const camera=new THREE.PerspectiveCamera(42,1,.1,120);
 const ambient=new THREE.AmbientLight(0xbadcf0,1.7);
 scene.add(ambient);
 const sunlight=new THREE.DirectionalLight(0xffebd3,2.3);
 sunlight.position.set(-8,15,10);
 scene.add(sunlight);
 const point=new THREE.PointLight(0x74d5e8,23,55,2);
 point.position.set(6,9,-6);
 scene.add(point);

 const geometries=[],materials=[],byId=new Map(),meshTargets=[];
 const groundGeometry=new THREE.PlaneGeometry(26,23);
 geometries.push(groundGeometry);
 const groundMaterial=new THREE.MeshStandardMaterial({
  color:0x0d2939,metalness:.28,roughness:.72
 });
 materials.push(groundMaterial);
 const floor=new THREE.Mesh(groundGeometry,groundMaterial);
 floor.rotation.x=-Math.PI/2;floor.position.y=-.12;scene.add(floor);
 const grid=new THREE.GridHelper(24,20,0x408fa7,0x24556b);
 grid.position.y=-.07;
 scene.add(grid);
 geometries.push(grid.geometry);
 if(Array.isArray(grid.material))materials.push(...grid.material);
 else materials.push(grid.material);

 const boxGeometry=new THREE.BoxGeometry(1.5,1.1,1.3);
 const outlineGeometry=new THREE.EdgesGeometry(boxGeometry);
 geometries.push(boxGeometry,outlineGeometry);
 const outlineMaterial=new THREE.LineBasicMaterial({color:0xc3e8f4,transparent:true,opacity:.56});
 materials.push(outlineMaterial);
 for(const station of stations){
  const material=new THREE.MeshStandardMaterial({
   color:station.color,metalness:.33,roughness:.38,emissive:new THREE.Color(station.color),
   emissiveIntensity:.09
  });
  materials.push(material);
  const block=new THREE.Mesh(boxGeometry,material);
  block.position.set(station.x,station.y+.65,station.z);
  block.userData.stationId=station.id;
  const edges=new THREE.LineSegments(outlineGeometry,outlineMaterial);
  edges.position.copy(block.position);
  scene.add(block,edges);
  byId.set(station.id,{station,block,edges});
  meshTargets.push(block);
 }
 // The dotted route is schematic sequencing; never a real conveyor or flow record.
 if(stations.length>1){
  const routePoints=stations.map(station=>new THREE.Vector3(station.x,.16,station.z));
  const pathGeometry=new THREE.BufferGeometry().setFromPoints(routePoints);
  geometries.push(pathGeometry);
  const routeMaterial=new THREE.LineDashedMaterial({
   color:0xffc58a,dashSize:.32,gapSize:.23,transparent:true,opacity:.7
  });
  materials.push(routeMaterial);
  const route=new THREE.Line(pathGeometry,routeMaterial);
  route.computeLineDistances();
  scene.add(route);
 }
 const focusGeometry=new THREE.TorusGeometry(.92,.035,7,64);
 const focusMaterial=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.9});
 geometries.push(focusGeometry);materials.push(focusMaterial);
 const focus=new THREE.Mesh(focusGeometry,focusMaterial);
 focus.rotation.x=-Math.PI/2;scene.add(focus);

 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 const shouldReduce=()=>reducedMotion||reduced?.matches===true;
 let active=stations.some(s=>s.id===selectedId)?selectedId:stations[0].id;
 let disposed=false,frame=0,drag=null;
 let yaw=.48,pitch=.64,zoom=23,targetYaw=yaw,targetPitch=pitch,targetZoom=zoom;
 const select=id=>{
  const match=byId.get(id);
  if(!match)return;
  active=id;
  focus.position.set(match.station.x,.08,match.station.z);
  for(const [name,value] of byId){
   value.block.material.emissiveIntensity=name===id?.38:.09;
   value.block.scale.setScalar(name===id?1.1:1);
  }
  requestDraw();
 };
 function requestDraw(){
  if(!disposed&&!frame)frame=window.requestAnimationFrame(draw);
 }
 function draw(){
  frame=0;
  if(disposed||document.hidden)return;
  if(shouldReduce()){yaw=targetYaw;pitch=targetPitch;zoom=targetZoom;}
  else{
   yaw+=(targetYaw-yaw)*.24;
   pitch+=(targetPitch-pitch)*.24;
   zoom+=(targetZoom-zoom)*.24;
  }
  camera.position.set(
   Math.sin(yaw)*Math.cos(pitch)*zoom,
   Math.sin(pitch)*zoom,
   Math.cos(yaw)*Math.cos(pitch)*zoom
  );
  camera.lookAt(0,0,0);
  renderer.render(scene,camera);
  if(Math.abs(yaw-targetYaw)>.002||Math.abs(pitch-targetPitch)>.002||
     Math.abs(zoom-targetZoom)>.025)requestDraw();
 }
 function resize(){
  if(disposed)return;
  const width=Math.max(1,renderer.domElement.clientWidth);
  const height=Math.max(1,renderer.domElement.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.setSize(width,height,false);
  camera.aspect=width/height;camera.updateProjectionMatrix();
  requestDraw();
 }
 const raycaster=new THREE.Raycaster(),point2d=new THREE.Vector2();
 function hit(event){
  const rect=renderer.domElement.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  point2d.x=((event.clientX-rect.left)/rect.width)*2-1;
  point2d.y=-((event.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(point2d,camera);
  const found=raycaster.intersectObjects(meshTargets,false)[0]?.object?.userData?.stationId;
  if(found){select(found);onSelect?.(found);}
 }
 function pointerDown(event){
  drag={x:event.clientX,y:event.clientY,moved:false};
  renderer.domElement.setPointerCapture?.(event.pointerId);
 }
 function pointerMove(event){
  if(!drag)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
  if(Math.abs(dx)+Math.abs(dy)>2)drag.moved=true;
  targetYaw+=dx/180;
  targetPitch=Math.max(.22,Math.min(1.35,targetPitch+dy/240));
  drag.x=event.clientX;drag.y=event.clientY;
  requestDraw();
 }
 function pointerUp(event){
  if(!drag)return;
  const moved=drag.moved;drag=null;
  if(!moved)hit(event);
 }
 function wheel(event){
  event.preventDefault();
  targetZoom=Math.max(13,Math.min(38,targetZoom*(event.deltaY<0?.9:1.1)));
  requestDraw();
 }
 function key(event){
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(event.key))return;
  event.preventDefault();
  const [dx,dy]=[
   event.key==='ArrowLeft'?.18:event.key==='ArrowRight'?-.18:0,
   event.key==='ArrowUp'?-.12:event.key==='ArrowDown'?.12:0
  ];
  targetYaw+=dx;
  targetPitch=Math.max(.22,Math.min(1.35,targetPitch+dy));
  if(event.key==='+')targetZoom=Math.max(13,targetZoom*.9);
  if(event.key==='-')targetZoom=Math.min(38,targetZoom*1.1);
  requestDraw();
 }
 const node=renderer.domElement;
 function contextLost(event){event.preventDefault();onUnavailable?.();}
 function visibility(){requestDraw();}
 const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;
 node.addEventListener('pointerdown',pointerDown);
 node.addEventListener('pointermove',pointerMove);
 node.addEventListener('pointerup',pointerUp);
 node.addEventListener('pointercancel',pointerUp);
 node.addEventListener('wheel',wheel,{passive:false});
 node.addEventListener('keydown',key);
 node.addEventListener('webglcontextlost',contextLost);
 document.addEventListener('visibilitychange',visibility);
 window.addEventListener('resize',resize,{passive:true});
 reduced?.addEventListener?.('change',requestDraw);
 observer?.observe(node);
 select(active);resize();
 return {
  select,
  orbit(dx,dy=0){targetYaw+=dx;targetPitch=Math.max(.22,Math.min(1.35,targetPitch+dy));requestDraw();},
  zoom(scale){targetZoom=Math.max(13,Math.min(38,targetZoom*scale));requestDraw();},
  reset(){targetYaw=.48;targetPitch=.64;targetZoom=23;requestDraw();},
  dispose(){
   if(disposed)return;
   disposed=true;
   if(frame)window.cancelAnimationFrame(frame);
   observer?.disconnect();
   node.removeEventListener('pointerdown',pointerDown);
   node.removeEventListener('pointermove',pointerMove);
   node.removeEventListener('pointerup',pointerUp);
   node.removeEventListener('pointercancel',pointerUp);
   node.removeEventListener('wheel',wheel);
   node.removeEventListener('keydown',key);
   node.removeEventListener('webglcontextlost',contextLost);
   document.removeEventListener('visibilitychange',visibility);
   window.removeEventListener('resize',resize);
   reduced?.removeEventListener?.('change',requestDraw);
   for(const geometry of geometries)geometry.dispose();
   for(const material of materials)material.dispose();
   renderer.dispose();
   renderer.forceContextLoss?.();
   node.remove();
  }
 };
}
