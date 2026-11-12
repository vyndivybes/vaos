import {factoryStationMap} from './lib/advanced-visual-model.mjs';

/**
 * An interactive rotatable 3D factory-layout preview, rendered without paid maps,
 * external libraries or live machine telemetry. Surface state is scenario ONLY.
 */
export function mountFactoryTwin(host,source){
 const {stations}=factoryStationMap(source);
 host.replaceChildren();
 let yaw=.65,pitch=.52,zoom=1,selected=stations[0].id,disposed=false,drag=null,raf=0,paused=false;
 const wrap=document.createElement('div');wrap.className='av-factory';
 const canvas=document.createElement('canvas');
 canvas.className='av-factory-canvas';canvas.tabIndex=0;
 canvas.setAttribute('role','img');
 canvas.setAttribute('aria-label','Rotatable scenario-only factory model. Drag to rotate, scroll to zoom, arrow keys to rotate. Select a station in the list for details.');
 wrap.append(canvas);
 const toolbar=document.createElement('div');toolbar.className='av-factory-toolbar';
 const controls=[
  ['Rotate left',()=>yaw-=.25],['Rotate right',()=>yaw+=.25],
  ['Zoom in',()=>zoom=Math.min(2.4,zoom*1.2)],['Zoom out',()=>zoom=Math.max(.5,zoom/1.2)],
  ['Reset view',()=>{yaw=.65;pitch=.52;zoom=1;}],
  ['Pause motion',()=>{paused=!paused;pause.textContent=paused?'Resume motion':'Pause motion';}]
 ];
 let pause;
 for(const [title,action] of controls){
  const b=document.createElement('button');b.type='button';b.textContent=title;
  b.addEventListener('click',()=>{action();draw();});toolbar.append(b);
  if(title==='Pause motion')pause=b;
 }
 wrap.append(toolbar);
 const panel=document.createElement('div');panel.className='av-factory-detail';wrap.append(panel);
 const grid=document.createElement('div');grid.className='av-factory-stations';wrap.append(grid);
 host.append(wrap);
 const ctx=canvas.getContext('2d');
 if(!ctx){panel.textContent='Canvas rendering unavailable. Station list remains available.';}
 const palette={
  UNVERIFIED:['#c8b483','#7b653d'],
  HOLD:['#a7a9bc','#55566c'],
  SIMULATED_RUNNING:['#69c1b2','#337d7f'],
  SIMULATED_IDLE:['#96a9bd','#47667c'],
  SIMULATED_FAULT:['#d58f80','#86474a']
 };
 function describeStation(){
  const station=stations.find(x=>x.id===selected);
  panel.replaceChildren();
  for(const [title,description] of [
   [station.label,'Selected conceptual station'],
   [station.status.replaceAll('_',' '),'Unverified scenario state — NOT machine telemetry'],
   [station.x+', '+station.y+', '+station.z,'Diagram coordinates; not surveyed plant measurements']
  ]){
   const item=document.createElement('div'),head=document.createElement('strong'),body=document.createElement('span');
   head.textContent=title;body.textContent=description;item.append(head,body);panel.append(item);
  }
  for(const button of grid.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.station===selected));
 }
 for(const s of stations){
  const b=document.createElement('button');b.type='button';b.dataset.station=s.id;
  b.textContent=s.label+' · '+s.status.replaceAll('_',' ');
  b.addEventListener('click',()=>{selected=s.id;describeStation();draw();});
  grid.append(b);
 }
 function resize(){
  const rect=canvas.getBoundingClientRect();
  const ratio=Math.min(2,window.devicePixelRatio||1);
  const w=Math.max(320,Math.floor(rect.width||880)),h=Math.max(340,Math.floor(rect.height||520));
  if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){
   canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
   ctx?.setTransform(ratio,0,0,ratio,0,0);
  }
  return {w,h};
 }
 function draw(time=0){
  if(!ctx||disposed)return;
  const {w,h}=resize();
  ctx.clearRect(0,0,w,h);
  const theme=getComputedStyle(canvas),paper=theme.getPropertyValue('--shell-canvas').trim()||'#f7f6f1',ink=theme.getPropertyValue('--shell-text').trim()||'#192a23';
  ctx.fillStyle=paper;ctx.fillRect(0,0,w,h);
  const size=Math.min(w/24,h/18)*zoom;
  const center={x:w/2,y:h*.54};
  const projection=(p)=>{
   const dx=p.x*Math.cos(yaw)-p.z*Math.sin(yaw);
   const depth=p.x*Math.sin(yaw)+p.z*Math.cos(yaw);
   const dist=Math.max(.6,1+depth*.018);
   return {x:center.x+dx*size/dist,y:center.y-(p.y*Math.cos(pitch)-depth*Math.sin(pitch))*size/dist,depth};
  };
  const segment=(a,b,color='#cbd6cb',thickness=1)=>{
   const p=projection(a),q=projection(b);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.strokeStyle=color;ctx.lineWidth=thickness;ctx.stroke();
  };
  for(let i=-8;i<=8;i++){
   segment({x:i,y:0,z:-7},{x:i,y:0,z:7});
   segment({x:-8,y:0,z:i},{x:8,y:0,z:i});
  }
  const colors=stations.map(s=>palette[s.status]);
  const sorted=[...stations].sort((a,b)=>(a.x*Math.sin(yaw)+a.z*Math.cos(yaw))-(b.x*Math.sin(yaw)+b.z*Math.cos(yaw)));
  const pick=[];
  function polygon(points,fill,stroke){
   ctx.beginPath();points.forEach((p,i)=>{const q=projection(p);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});ctx.closePath();
   ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1.1;ctx.stroke();
  }
  for(const s of sorted){
   const i=stations.indexOf(s),colors=palette[s.status],x=s.x,z=s.z,base=s.y,h=1.25;
   const a={x:x-.55,y:base,z:z-.5},b={x:x+.55,y:base,z:z-.5},c={x:x+.55,y:base,z:z+.5},d={x:x-.55,y:base,z:z+.5};
   const A={...a,y:base+h},B={...b,y:base+h},C={...c,y:base+h},D={...d,y:base+h};
   polygon([a,b,B,A],colors[1],'#223b4b');
   polygon([b,c,C,B],colors[1],'#223b4b');
   polygon([c,d,D,C],colors[1],'#223b4b');
   polygon([d,a,A,D],colors[1],'#223b4b');
   polygon([A,B,C,D],colors[0],'#b8c5c7');
   const point=projection({x,y:base+h+.2,z});pick.push({...point,id:s.id});
   ctx.font='600 12px system-ui';ctx.textAlign='center';
   ctx.strokeStyle=paper;ctx.lineWidth=3;ctx.strokeText(s.label,point.x,point.y-10);
   ctx.fillStyle=ink;ctx.fillText(s.label,point.x,point.y-10);
   if(selected===s.id){
    ctx.beginPath();ctx.arc(point.x,point.y-4,8,0,Math.PI*2);ctx.strokeStyle='#ffe1a1';ctx.lineWidth=2;ctx.stroke();
   }
  }
  // Dashed connections are schematic process sequencing, not a real conveyor route.
  ctx.setLineDash([6,7]);ctx.lineDashOffset=paused?0:-(time*.012)%13;
  for(let i=1;i<stations.length;i++){
   segment({...stations[i-1],y:.15},{...stations[i],y:.15},'#bba675',1.6);
  }
  ctx.setLineDash([]);ctx.lineDashOffset=0;
  ctx.fillStyle=ink;ctx.font='12px system-ui';ctx.textAlign='left';
  ctx.fillText('CONCEPTUAL 3D TOPOLOGY · NO LIVE TELEMETRY',20,26);
  ctx.fillStyle=ink;ctx.fillText('Drag to orbit · Scroll to zoom · Click station',20,h-21);
  canvas._stationPick=pick;
 }
 const pointerDown=e=>{drag={x:e.clientX,y:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);};
 const pointerMove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(Math.abs(dx)+Math.abs(dy)>2)drag.moved=true;
  yaw+=dx/165;pitch=Math.max(.18,Math.min(1.2,pitch+dy/230));drag.x=e.clientX;drag.y=e.clientY;draw();
 };
 const pointerUp=e=>{
  if(!drag)return;const moved=drag.moved;drag=null;
  if(!moved){
   const box=canvas.getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top;
   const closest=(canvas._stationPick||[]).map(p=>({id:p.id,d:Math.hypot(x-p.x,y-p.y)})).sort((a,b)=>a.d-b.d)[0];
   if(closest&&closest.d<38){selected=closest.id;describeStation();draw();}
  }
 };
 const wheel=e=>{e.preventDefault();zoom=Math.max(.5,Math.min(2.4,zoom*(e.deltaY<0?1.11:.89)));draw();};
 const key=e=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key))return;
  e.preventDefault();
  if(e.key==='ArrowLeft')yaw-=.15;
  if(e.key==='ArrowRight')yaw+=.15;
  if(e.key==='ArrowUp')pitch=Math.max(.18,pitch-.12);
  if(e.key==='ArrowDown')pitch=Math.min(1.2,pitch+.12);
  if(e.key==='+')zoom=Math.min(2.4,zoom*1.1);
  if(e.key==='-')zoom=Math.max(.5,zoom*.9);
  draw();
 };
 canvas.addEventListener('pointerdown',pointerDown);
 canvas.addEventListener('pointermove',pointerMove);
 canvas.addEventListener('pointerup',pointerUp);
 canvas.addEventListener('pointercancel',pointerUp);
 canvas.addEventListener('wheel',wheel,{passive:false});
 canvas.addEventListener('keydown',key);
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>draw()):null;
 observer?.observe(canvas);
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
 const animate=time=>{
  if(disposed)return;
  if(!paused&&!document.hidden)draw(time);
  raf=requestAnimationFrame(animate);
 };
 describeStation();draw();
 if(!reduced)raf=requestAnimationFrame(animate);
 return ()=>{disposed=true;cancelAnimationFrame(raf);observer?.disconnect();canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointercancel',pointerUp);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('keydown',key);host.replaceChildren();};
}
