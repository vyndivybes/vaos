// Render existing chart evidence as ephemeral artwork. No new requests, storage or exports.
const art=[...document.querySelectorAll('[data-chart-picture]')];
const targets=document.getElementById('cockpit-source-chart')
 ?['cockpit-source-chart','cockpit-workforce-chart']
 :['wa-overview-work','wa-overview-heartbeat'];
const xml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function picture(host){
 const existing=host.querySelector('svg');
 if(existing){const svg=existing.cloneNode(true);svg.insertAdjacentHTML('afterbegin','<style>text{fill:#e5efdd;font-family:Arial,sans-serif;font-size:15px}.va-evidence-value,.va-evidence-total{fill:#d7fa5b;font-weight:bold}</style>');return new XMLSerializer().serializeToString(svg);}
 const rows=[...host.querySelectorAll('.wa-bar-row')].slice(0,8);
 if(!rows.length)return null;
 // Copy the visible labels and proportions without interpreting financial or status values.
 const contents=rows.map((row,i)=>{const label=row.querySelector('.wa-bar-label')?.textContent||'';const fill=row.querySelector('.wa-fill');const width=Number.parseFloat(fill?.style.width);if(!Number.isFinite(width)||width<0||width>100)return '';const y=30+i*30;return '<text x="12" y="'+y+'" fill="#edf3e5" font-family="Arial,sans-serif" font-size="12">'+xml(label)+'</text><rect x="340" y="'+(y-12)+'" width="'+(width*3.5)+'" height="15" rx="4" fill="#d7fa5b"/>';}).join('');
 return contents?'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 290">'+contents+'</svg>':null;
}
function update(){
 const images=targets.map(id=>{const host=document.getElementById(id);return host?picture(host):null;});
 art.forEach((frame,i)=>{const box=frame.querySelector('.mi-picture');const svg=images[i];if(!svg){box.replaceChildren(Object.assign(document.createElement('span'),{textContent:'Awaiting source evidence'}));return;}const src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);if(box.firstElementChild?.getAttribute('src')===src)return;const image=document.createElement('img');image.alt='';image.src=src;box.replaceChildren(image);});
}
if(art.length){
 const observer=new MutationObserver(update);
 for(const id of targets){const target=document.getElementById(id);if(target)observer.observe(target,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['style']});}
 update();
}
if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('mi-reveal');observer.unobserve(entry.target);}},{threshold:.08});for(const element of document.querySelectorAll('.fc-chart-card,.fc-domain-card,.premium-section-title'))observer.observe(element);}
