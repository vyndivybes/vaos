/**
 * On-demand conceptual Three.js scene for Spatial Command.
 * The accessible DOM buttons remain authoritative for keyboard and source selection.
 * No edges, runtime connectivity, source observations or authority are inferred here.
 * The rings and stars are decorative visual guides, never evidence.
 */
import {SPATIAL_SPECTRUM,projectSpatialLayout,makeSpatialStars} from './spatial-visual-model.mjs';

export async function mountSpatialThree(stage,layout,{
 onSelect,reducedMotion=false,motion='subtle',onUnavailable
}={}) {
 if(!stage||typeof window==='undefined')throw Error('SPATIAL_VIEW_UNAVAILABLE');
 const nodes=projectSpatialLayout(layout);
 // Loaded only after explicit user activation; no external network or token.
 const THREE=await import('./vendor/three.module.min.js');
 let renderer;
 try{
  renderer=new THREE.WebGLRenderer({
   alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:false
  });
 }catch{throw Error('WEBGL_NOT_AVAILABLE');}
 renderer.domElement.className='sp-three-canvas';
 renderer.domElement.setAttribute('aria-hidden', 'true');
 renderer.domElement.setAttribute('tabindex','-1');
 stage.insertBefore(renderer.domElement,stage.firstChild);

 const scene=new THREE.Scene();
 const camera=new THREE.PerspectiveCamera(38,1,0.1,100);
 camera.position.set(0,0,11);
 const pivot=new THREE.Group();
 scene.add(pivot);
 const sharedGeometry=new THREE.IcosahedronGeometry(.24,2);
 const materials=[];
 const geometries=[];
 const items=new Map();
 const controlColor=0x5af7cd;
 const knowledgeColor=0xddbaff;
 const selectedColor=0xffffff;
 const palette=new Map(Object.entries(SPATIAL_SPECTRUM)
  .map(([category,swatch])=>[category,new THREE.Color(swatch.hex)]));

 // Each source is a freestanding object, not an inferred relationship edge.
 for(const node of nodes){
  const material=new THREE.MeshBasicMaterial({
   color:palette.get(node.category),transparent:true,opacity:.86
  });
  materials.push(material);
  const sphere=new THREE.Mesh(sharedGeometry,material);
  sphere.position.set(node.x,node.y,node.z);
  sphere.userData.source=node.id;
  pivot.add(sphere);
  items.set(node.id,sphere);
 }
 const haloMaterial=new THREE.MeshBasicMaterial({
  color:0xffffff,transparent:true,opacity:.13,depthWrite:false
 });
 materials.push(haloMaterial);
 const halo=new THREE.Mesh(sharedGeometry,haloMaterial);
 halo.scale.setScalar(2.7);
 pivot.add(halo);
 const focusGeometry=new THREE.TorusGeometry(.4,.012,4,64);
 geometries.push(focusGeometry);
 const focusMaterial=new THREE.MeshBasicMaterial({color:0xe6fffa,transparent:true,opacity:.86});
 materials.push(focusMaterial);
 const focus=new THREE.Mesh(focusGeometry,focusMaterial);
 pivot.add(focus);

 const orbitGeometry=new THREE.TorusGeometry(2.48,.013,5,128);
 geometries.push(orbitGeometry);
 for(const [index,color] of ['#5af7cd','#70c9ff','#ddbaff'].entries()){
  const orbitMaterial=new THREE.MeshBasicMaterial({
   color,transparent:true,opacity:index===1?.34:.22,depthWrite:false
  });
  materials.push(orbitMaterial);
  const orbit=new THREE.Mesh(orbitGeometry,orbitMaterial);
  orbit.rotation.set(index===0?-.32:index===1?1.04:.38,index===2?.94:.1,index*0.55);
  pivot.add(orbit);
 }
 // Low-cost starfield is deterministic decoration, with no claims about system links.
 const starPositions=makeSpatialStars(144);
 const starGeometry=new THREE.BufferGeometry();
 const floats=new Float32Array(starPositions.flatMap(point=>[point.x,point.y,point.z]));
 starGeometry.setAttribute('position',new THREE.Float32BufferAttribute(floats,3));
 geometries.push(starGeometry);
 const starMaterial=new THREE.PointsMaterial({
  color:0x8fcce8,size:.038,transparent:true,opacity:.62,depthWrite:false
 });
 materials.push(starMaterial);
 pivot.add(new THREE.Points(starGeometry,starMaterial));

 const grid=new THREE.GridHelper(8.5,20,0x4a9f9a,0x30566b);
 grid.rotation.x=Math.PI/2;
 grid.position.z=-1.65;
 if(Array.isArray(grid.material)){
  for(const material of grid.material){material.transparent=true;material.opacity=.14;materials.push(material);}
 }else{grid.material.transparent=true;grid.material.opacity=.14;materials.push(grid.material);}
 geometries.push(grid.geometry);
 pivot.add(grid);

 const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 let motionMode=motion,disposed=false,frame=0,selected='VAOS';
 let targetX=0,targetY=0;
 const shouldReduce=()=>reducedMotion||reduce?.matches===true;
 function draw(){
  frame=0;
  if (disposed || document.hidden) return;
  // Interruption-friendly easing, capped by convergence; no continuous animation loop.
  if(shouldReduce()||motionMode==='off'){
   pivot.rotation.x=0;pivot.rotation.y=0;
  }else{
   pivot.rotation.x+=(targetX-pivot.rotation.x)*.24;
   pivot.rotation.y+=(targetY-pivot.rotation.y)*.24;
  }
  renderer.render(scene,camera);
  if(Math.abs(targetX-pivot.rotation.x)>.002||Math.abs(targetY-pivot.rotation.y)>.002){
   requestDraw();
  }
 }
 function requestDraw(){
  if(!frame&&!disposed)frame=window.requestAnimationFrame(draw);
 }
 function resize(){
  if(disposed)return;
  const width=Math.max(1,stage.clientWidth),height=Math.max(1,stage.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.setSize(width,height,false);
  camera.aspect=width/height;
  camera.updateProjectionMatrix();
  requestDraw();
 }
 function highlight(id){
  selected=items.has(id)?id:(nodes[0]?.id||'');
  for(const [name,sphere] of items){
   const active=name===selected;
   const category=nodes.find(node=>node.id===name)?.category||'knowledge';
   sphere.material.color.copy(active?new THREE.Color(selectedColor):palette.get(category));
   sphere.material.opacity=active?1:.78;
   sphere.scale.setScalar(active?1.45:1);
  }
  const chosen=items.get(selected);
  if(chosen){focus.position.copy(chosen.position);focus.position.z+=.04;
   halo.position.copy(chosen.position);}
  requestDraw();
 }
 function pointer(event){
  if(shouldReduce()||motionMode==='off')return;
  const bounds=stage.getBoundingClientRect();
  if(!bounds.width||!bounds.height)return;
  const strength=motionMode==='immersive'?.68:.32;
  targetY=((event.clientX-bounds.left)/bounds.width-.5)*strength;
  targetX=((event.clientY-bounds.top)/bounds.height-.5)*-strength*.75;
  requestDraw();
 }
 function reset(){
  targetX=0;targetY=0;requestDraw();
 }
 function setMotion(next){
  motionMode=['off','subtle','immersive'].includes(next)?next:'subtle';
  if(motionMode==='off'||shouldReduce())reset();
  else requestDraw();
 }
 function visibility(){requestDraw();}
 function contextLost(event){
  event.preventDefault();
  onUnavailable?.();
 }
 const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;
 stage.addEventListener('pointermove',pointer,{passive:true});
 stage.addEventListener('pointerleave',reset);
 window.addEventListener('resize',resize,{passive:true});
 document.addEventListener('visibilitychange',visibility);
 renderer.domElement.addEventListener('webglcontextlost',contextLost);
 reduce?.addEventListener?.('change',reset);
 observer?.observe(stage);
 highlight(onSelect?.()||nodes[0]?.id);
 resize();
 return {
  highlight,setMotion,
  dispose(){
   if(disposed)return;
   disposed=true;
   if(frame)window.cancelAnimationFrame(frame);
   stage.removeEventListener('pointermove',pointer);
   stage.removeEventListener('pointerleave',reset);
   window.removeEventListener('resize',resize);
   document.removeEventListener('visibilitychange',visibility);
   renderer.domElement.removeEventListener('webglcontextlost',contextLost);
   reduce?.removeEventListener?.('change',reset);
   observer?.disconnect();
   sharedGeometry.dispose();
   for(const geometry of geometries)geometry.dispose();
   for(const material of materials)material.dispose();
   renderer.dispose();
   renderer.forceContextLoss?.();
   renderer.domElement.remove();
  }
 };
}
