import * as THREE from './vendor/three.module.min.js';
export function createSkillsMap(container,capabilities){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,100);
 camera.position.z=8;
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
 renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Capability map. Drag or use the arrow keys to rotate. The text list provides availability.');container.append(renderer.domElement);
 const group=new THREE.Group();scene.add(group);
 const entries=Object.entries(capabilities),geometry=new THREE.IcosahedronGeometry(.18,1),materials=[];
 entries.forEach(([name,value],i)=>{
  const ready=typeof value==='object'?Object.values(value).every(Boolean):value;
  const material=new THREE.MeshBasicMaterial({color:ready?0x81d1af:0x738090,wireframe:true});materials.push(material);
  const node=new THREE.Mesh(geometry,material),angle=i/Math.max(entries.length,1)*Math.PI*2;
  node.position.set(Math.cos(angle)*2.2,Math.sin(angle)*1.3,Math.sin(angle*2)*.7);group.add(node);
  const lineGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),node.position]);
  const lineMaterial=new THREE.LineBasicMaterial({color:0x6d6044});materials.push(lineMaterial);group.add(new THREE.Line(lineGeo,lineMaterial));
 });
 const centreMaterial=new THREE.MeshBasicMaterial({color:0xd1ad65,wireframe:true});materials.push(centreMaterial);group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.5,1),centreMaterial));
 const render=()=>{const width=container.clientWidth;renderer.setSize(width,260);camera.aspect=width/260;camera.updateProjectionMatrix();renderer.render(scene,camera);};
 let lastX=null;
 renderer.domElement.onpointerdown=e=>{lastX=e.clientX;renderer.domElement.setPointerCapture(e.pointerId);};
 renderer.domElement.onpointermove=e=>{if(lastX===null)return;group.rotation.y+=(e.clientX-lastX)*.01;lastX=e.clientX;render();};
 renderer.domElement.onpointerup=()=>{lastX=null;};
 renderer.domElement.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();group.rotation.y+=e.key==='ArrowLeft'?-.15:.15;render();}};
 const observer=new ResizeObserver(render);observer.observe(container);render();
 return {dispose(){observer.disconnect();scene.traverse(item=>item.geometry?.dispose());for(const material of materials)material.dispose();renderer.dispose();renderer.domElement.remove();}};
}
