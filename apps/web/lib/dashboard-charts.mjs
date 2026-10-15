// Read-only evidence counts; never coerce source strings, null or HOLD to measured values.
const escapeXml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function normalizeCounts(rows) {
 if(!Array.isArray(rows))return [];
 return rows.slice(0,30).filter(x=>x && typeof x.label==='string' && x.label.trim().length &&
  typeof x.value==='number' && Number.isSafeInteger(x.value) && x.value>=0 && x.value<=1_000_000_000)
  .slice(0,12).map(x=>({label:x.label.trim().slice(0,80),value:x.value}));
}
const palette=['#b59b71','#8297a5','#83a596','#c89c80','#9bb9b6','#b6a7b7','#adbac7','#c2bb9d','#a8b9a8','#d1b79e','#bbaaa8','#9faeaf'];
const heading=(title,detail)=>'<title>'+escapeXml(title)+'</title><desc>'+escapeXml(detail)+'</desc>';
const text=(x,y,t,extra='')=>'<text x="'+x+'" y="'+y+'" '+extra+'>'+escapeXml(t)+'</text>';
export function chartSvg(raw,kind='columns',title='Observed counts') {
 const rows=normalizeCounts(raw);
 if(!['columns','bars','donut'].includes(kind))return '<p>No supported chart for this selection.</p>';
 if(!rows.length)return '<p class="va-graph-empty">No independently observed numeric counts are available. Unknown is not zero.</p>';
 const total=rows.reduce((sum,item)=>sum+item.value,0);
 if(!total)return '<p class="va-graph-empty">All connected categories report zero; other unknown measures are not included.</p>';
 const max=Math.max(1,...rows.map(x=>x.value));
 const detail=rows.map(x=>x.label+': '+x.value).join('; ');
 const base='<svg class="va-evidence-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="'+escapeXml(title)+'" viewBox="0 0 720 290" preserveAspectRatio="xMidYMid meet">'+heading(title,detail);
 if(kind==='columns') {
  const step=665/rows.length,barWidth=Math.min(62,step*.64);
  const bars=rows.map((r,i)=>{
   const h=Math.round((r.value/max)*182),x=28+i*step+(step-barWidth)/2,y=224-h;
   return '<rect x="'+x+'" y="'+y+'" width="'+barWidth+'" height="'+h+'" rx="5" fill="'+palette[i]+'"/>'+
    text(x+barWidth/2,y-9,String(r.value),'text-anchor="middle" class="va-evidence-value"')+
    text(x+barWidth/2,245,r.label.length>15?r.label.slice(0,14)+'…':r.label,'text-anchor="middle" class="va-evidence-axis"');
  }).join('');
  return base+'<line x1="28" y1="224" x2="697" y2="224" stroke="#778c9e"/>'+bars+'</svg>';
 }
 if(kind==='bars') {
  const step=Math.min(52,238/rows.length),h=Math.min(27,step*.64);
  const bars=rows.map((r,i)=>{
   const y=24+i*step,x=232,width=Math.round((r.value/max)*400);
   return text(220,y+17,r.label.length>30?r.label.slice(0,29)+'…':r.label,'text-anchor="end" class="va-evidence-axis"')+
    '<rect x="'+x+'" y="'+y+'" width="'+width+'" height="'+h+'" rx="4" fill="'+palette[i]+'"/>'+
    text(x+width+8,y+17,r.value,'class="va-evidence-value"');
  }).join('');
  return base+bars+'</svg>';
 }
 const circumference=2*Math.PI*91;let offset=0;
 const rings=rows.map((r,i)=>{const len=(r.value/total)*circumference;const dash='<circle cx="185" cy="143" r="91" fill="none" stroke="'+palette[i]+'" stroke-width="31" stroke-dasharray="'+len+' '+circumference+'" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 185 143)"/>';offset+=len;return dash;}).join('');
 const legend=rows.map((r,i)=>'<rect x="365" y="'+(24+i*21)+'" width="12" height="12" fill="'+palette[i]+'"/>'+
 text(390,35+i*21,(r.label.length>25?r.label.slice(0,24)+'…':r.label)+' · '+r.value,'class="va-evidence-axis"')).join('');
 return base+rings+text(185,145,total,'text-anchor="middle" class="va-evidence-total"')+
 text(185,170,'observed count','text-anchor="middle" class="va-evidence-axis"')+legend+'</svg>';
}
