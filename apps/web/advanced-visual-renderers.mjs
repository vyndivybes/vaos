import {sankeyLayout,heatmapCells,waterfallSteps,funnelStages,timelineBars,routePoints} from './lib/advanced-visual-model.mjs';

const ns='http://www.w3.org/2000/svg';
const svg=(tag,attrs={},text)=>{
 const node=document.createElementNS(ns,tag);
 for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
 if(text!==undefined)node.textContent=String(text);
 return node;
};
const el=(tag,text,cls)=>{
 const node=document.createElement(tag);
 if(text!==undefined)node.textContent=String(text);
 if(cls)node.className=cls;
 return node;
};
const note=(host,value)=>host.append(el('p',value,'av-chart-note'));
const svgHost=(host,width=980,height=480)=>{
 const s=svg('svg',{viewBox:`0 0 ${width} ${height}`,role:'img',class:'av-plot',preserveAspectRatio:'xMidYMid meet'});
 host.append(s);
 return s;
};
const text=(canvas,x,y,value,attrs={})=>canvas.append(svg('text',{x,y,fill:'#d6e5ef','font-size':13,...attrs},String(value)));
const table=(host,headers,rows)=>{
 const wrapper=el('div',undefined,'av-scroll'),tab=el('table',undefined,'av-table');
 const head=el('thead'),header=el('tr');
 for(const h of headers)header.append(el('th',h));
 head.append(header);tab.append(head);
 const body=el('tbody');
 for(const values of rows){
  const tr=el('tr');
  for(const value of values)tr.append(el('td',value===null?'Unknown':String(value)));
  body.append(tr);
 }
 tab.append(body);wrapper.append(tab);host.append(wrapper);
};
const fmt=value=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(value);

export function renderSankey(host,data){
 host.replaceChildren();
 const layout=sankeyLayout(data,1000,480),canvas=svgHost(host,1000,480);
 canvas.append(svg('title',{},'Sankey flow — user-supplied or synthetic scenario, not verified production data'));
 for(const [index,link] of layout.links.entries()){
  const path=svg('path',{d:link.path,fill:'none',stroke:['#4b95b7','#c9ae7d','#6bafa3','#bb91bc'][index%4],
   'stroke-width':Math.max(.7,link.width).toFixed(2),opacity:'.52',class:'av-flow-link',tabindex:'0'});
  const label=layout.nodes.find(n=>n.id===link.source).label+' → '+layout.nodes.find(n=>n.id===link.target).label+': '+fmt(link.value)+' '+layout.unit;
  path.append(svg('title',{},label));path.setAttribute('aria-label',label);
  canvas.append(path);
 }
 for(const [i,node] of layout.nodes.entries()){
  const group=svg('g',{tabindex:'0','aria-label':node.label+'; incoming '+fmt(node.incoming)+', outgoing '+fmt(node.outgoing)});
  group.append(svg('rect',{x:node.x,y:node.y,width:node.width,height:Math.max(1,node.height),rx:4,fill:['#e5c58e','#85b9bb','#8e9eca','#b0a7b8'][i%4]}));
  const right=node.x>740,anchor=right?'end':'start';
  const x=right?node.x-7:node.x+node.width+7;
  group.append(svg('text',{x,y:node.y+Math.min(node.height/2,15)+5,'text-anchor':anchor,fill:'#dce8ee','font-size':12},node.label.slice(0,23)));
  group.append(svg('title',{},node.label+'; inflow '+fmt(node.incoming)+'; outflow '+fmt(node.outgoing)+' '+layout.unit));
  canvas.append(group);
 }
 note(host,'Flow widths are proportional to the supplied scenario quantities. A flow does not certify orders, inventory, financial transfers or real-time process events.');
 table(host,['From','To','Quantity ('+layout.unit+')'],layout.links.map(l=>[layout.nodes.find(n=>n.id===l.source).label,layout.nodes.find(n=>n.id===l.target).label,fmt(l.value)]));
}

export function renderHeatmap(host,data){
 host.replaceChildren();
 const grid=heatmapCells(data),wrapper=el('div',undefined,'av-scroll'),tab=el('table',undefined,'av-heatmap');
 const tr=el('tr');tr.append(el('th','Station / period'));
 for(const column of grid.columns)tr.append(el('th',column));
 tab.append(tr);
 for(const row of grid.rows){
  const line=el('tr');line.append(el('th',row.label));
  for(const value of row.values){
   const cell=el('td',value===null?'Unknown':fmt(value));
   cell.className=value===null?'av-heat-unknown':'av-heat-measured';
   if(value!==null)cell.style.setProperty('--intensity',String(grid.max===0?0:Math.max(0,Math.min(.9,value/grid.max*.85))));
   line.append(cell);
  }
  tab.append(line);
 }
 wrapper.append(tab);host.append(wrapper);
 note(host,'Heatmap uses values from the scenario. Unknown cells remain unknown, including when neighboring cells contain zero.');
}

export function renderWaterfall(host,data){
 host.replaceChildren();
 const wf=waterfallSteps(data),width=950,height=440,pad=55,bottom=60,top=30;
 const values=[0,...wf.steps.flatMap(s=>[s.start,s.end])];
 const minimum=Math.min(...values),maximum=Math.max(...values);
 const margin=Math.max(1,(maximum-minimum)*.14),low=minimum-margin,high=maximum+margin;
 const y=v=>top+(high-v)/(high-low)*(height-top-bottom);
 const canvas=svgHost(host,width,height),stepW=(width-pad*2)/(wf.steps.length+1),barW=Math.min(75,stepW*.62);
 canvas.append(svg('line',{x1:pad,y1:y(0),x2:width-pad,y2:y(0),stroke:'#7f91a5','stroke-dasharray':'6 5'}));
 wf.steps.forEach((s,i)=>{
  const x=pad+stepW*i+stepW/2-barW/2;
  const topY=Math.min(y(s.start),y(s.end)),h=Math.max(1,Math.abs(y(s.start)-y(s.end)));
  const bar=svg('rect',{x,y:topY,width:barW,height:h,rx:4,fill:s.change>=0?'#77b4a5':'#c48d85',tabindex:'0'});
  bar.append(svg('title',{},s.label+' '+(s.change>=0?'+':'')+fmt(s.change)+' '+wf.unit+'; running '+fmt(s.end)));
  canvas.append(bar);
  if(i<wf.steps.length-1)canvas.append(svg('line',{x1:x+barW,y1:y(s.end),x2:x+stepW+stepW/2-barW/2,y2:y(s.end),stroke:'#849bae','stroke-dasharray':'3 4'}));
  text(canvas,x+barW/2,height-31,s.label.slice(0,17),{'text-anchor':'middle','font-size':11});
  text(canvas,x+barW/2,Math.max(16,topY-8),(s.change>=0?'+':'')+fmt(s.change),{'text-anchor':'middle','font-size':11});
 });
 const endX=pad+stepW*wf.steps.length+stepW/2-barW/2,finalY=Math.min(y(0),y(wf.total)),finalH=Math.max(1,Math.abs(y(0)-y(wf.total)));
 canvas.append(svg('rect',{x:endX,y:finalY,width:barW,height:finalH,rx:4,fill:'#d5bd81'}));
 text(canvas,endX+barW/2,height-31,'Net scenario',{'text-anchor':'middle','font-size':11});
 text(canvas,endX+barW/2,Math.max(16,finalY-8),fmt(wf.total),{'text-anchor':'middle','font-size':11});
 note(host,'Arithmetic bridge only: each bar is the supplied change. The net total is not a reconciled profit, cash-flow or tax computation.');
 table(host,['Driver','Change ('+wf.unit+')','Running total'],wf.steps.map(s=>[s.label,fmt(s.change),fmt(s.end)]));
}

export function renderFunnel(host,data){
 host.replaceChildren();
 const f=funnelStages(data),max=Math.max(1,f.stages[0].value),wrap=el('div',undefined,'av-funnel');
 f.stages.forEach((s,i)=>{
  const group=el('div',undefined,'av-funnel-row');
  const title=el('div',undefined,'av-funnel-caption');
  title.append(el('strong',s.label),el('span',fmt(s.value)+' '+f.unit+(i===0?'':s.conversionPct===null?' · conversion unavailable':' · '+s.conversionPct+'% of prior stage')));
  group.append(title);
  const track=el('div',undefined,'av-funnel-track'),bar=el('div',undefined,'av-funnel-bar');
  bar.style.width=Math.max(s.value===0?0:1,s.value/max*100).toFixed(2)+'%';
  bar.setAttribute('role','img');bar.setAttribute('aria-label',s.label+': '+s.value+' '+f.unit);
  track.append(bar);group.append(track);wrap.append(group);
 });
 host.append(wrap);
 note(host,'This funnel is an illustrative or user-provided sequence. Stage quantities are not independently validated CRM conversions.');
}

export function renderTimeline(host,data){
 host.replaceChildren();
 const t=timelineBars(data),layout=el('div',undefined,'av-timeline');
 const dates=el('p','Scenario window '+t.start+' to '+t.end,'av-plot-heading');layout.append(dates);
 for(const task of t.tasks){
  const row=el('div',undefined,'av-timeline-row');
  row.append(el('span',task.label));
  const track=el('div',undefined,'av-timeline-track'),bar=el('div',undefined,'av-timeline-bar');
  bar.style.left=task.leftPct.toFixed(3)+'%';
  bar.style.width=Math.max(.5,task.widthPct).toFixed(3)+'%';
  bar.title=task.label+': '+task.start+' to '+task.end;
  track.append(bar);row.append(track);layout.append(row);
 }
 host.append(layout);
 table(host,['Task','Start','Finish'],t.tasks.map(x=>[x.label,x.start,x.end]));
 note(host,'Timeline is a planning scenario, not an approved work order or verified manufacturing completion.');
}

export function renderLogistics(host,data){
 host.replaceChildren();
 const points=routePoints(data),width=950,height=480,canvas=svgHost(host,width,height);
 canvas.append(svg('title',{},'Geographic coordinate sketch, not a road map'));
 for(let i=1;i<=4;i++){
  canvas.append(svg('line',{x1:i*width/5,y1:30,x2:i*width/5,y2:height-30,stroke:'#273b4a','stroke-dasharray':'3 7'}));
  canvas.append(svg('line',{x1:35,y1:i*height/5,x2:width-35,y2:i*height/5,stroke:'#273b4a','stroke-dasharray':'3 7'}));
 }
 const positions=points.points.map(p=>({...p,x:px(p.x,width,55),y:px(p.y,height,38)}));
 for(let i=1;i<positions.length;i++){
  const a=positions[i-1],b=positions[i];
  canvas.append(svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#baad80','stroke-width':2,'stroke-dasharray':'7 6'}));
 }
 positions.forEach((p,i)=>{
  canvas.append(svg('circle',{cx:p.x,cy:p.y,r:9,fill:i===0?'#80c1b4':'#b3a3cd',stroke:'#e0eff4','stroke-width':1.5}));
  text(canvas,p.x+15,p.y-14,p.label,{'font-size':12});
  text(canvas,p.x+15,p.y+4,p.lat.toFixed(3)+', '+p.lon.toFixed(3),{'font-size':10,fill:'#9caebc'});
 });
 note(host,'Coordinate-only sketch connecting supplied points in sequence. Lines are not drivable routes; no ETA, route optimization, vehicle tracking or live shipment position is claimed.');
 table(host,['Stop','Latitude','Longitude'],points.points.map(p=>[p.label,p.lat,p.lon]));
}
const px=(fraction,extent,padding)=>padding+(extent-padding*2)*fraction;

export function renderSimulation(host,simulation){
 host.replaceChildren();
 if(!simulation||!simulation.months?.length)throw Error('Run a simulation using explicit assumptions');
 const width=950,height=450,pad=72,top=36,bottom=65,months=simulation.months;
 const all=[...months.flatMap(m=>[m.p10,m.p90]),0],lo=Math.min(...all),hi=Math.max(...all),margin=Math.max(1,(hi-lo)*.1);
 const y=v=>top+(hi+margin-v)/(hi-lo+2*margin)*(height-top-bottom);
 const x=i=>pad+(width-pad*2)*(months.length===1?.5:i/(months.length-1));
 const canvas=svgHost(host,width,height);
 const band=months.map((m,i)=>x(i)+','+y(m.p90)).concat([...months].reverse().map((m,i)=>x(months.length-i-1)+','+y(m.p10))).join(' ');
 canvas.append(svg('polygon',{points:band,fill:'#609fba','fill-opacity':.23,stroke:'none'}));
 const median=months.map((m,i)=>(i?'L ':'M ')+x(i)+' '+y(m.p50)).join(' ');
 canvas.append(svg('path',{d:median,fill:'none',stroke:'#dfc184','stroke-width':3}));
 canvas.append(svg('line',{x1:pad,x2:width-pad,y1:y(0),y2:y(0),stroke:'#728697','stroke-dasharray':'5 7'}));
 months.forEach((m,i)=>{text(canvas,x(i),height-31,String(m.month),{'text-anchor':'middle','font-size':11});});
 text(canvas,pad,height-12,'Scenario month →',{'font-size':11});
 text(canvas,pad,23,'Cash band: P10–P90 · median P50 · illustrative currency units',{'font-size':13});
 const cards=el('div',undefined,'av-stat-grid');
 for(const [title,value] of [
  ['P10 final cash',fmt(simulation.final.p10)],['Median final cash',fmt(simulation.final.p50)],
  ['P90 final cash',fmt(simulation.final.p90)],
  ['Modelled chance of nonnegative closing cash',Math.round(simulation.probabilityPositive*1000)/10+'%']
 ]){const card=el('article',undefined,'av-stat');card.append(el('span',title),el('strong',value));cards.append(card);}
 host.append(cards);
 table(host,['Month','P10 cash','Median cash','P90 cash'],months.map(m=>[m.month,fmt(m.p10),fmt(m.p50),fmt(m.p90)]));
 note(host,'SIMULATION ONLY — not a forecast or financial certification. '+simulation.methodology+' Results depend entirely on the entered assumptions.');
}
