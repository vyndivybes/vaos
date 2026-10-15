import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./vaos-interface.mjs',import.meta.url),'utf8');
function boot(){
 const events={},attrs=new Map([['aria-expanded','false']]),bodyAttrs=new Set();
 const toggle={getAttribute:key=>attrs.get(key),setAttribute:(key,value)=>attrs.set(key,value),addEventListener:(event,fn)=>events.toggle=fn};
 const tabs=['instruct','analysis','qualification'].map(name=>({dataset:{commandTab:name},pressed:'',setAttribute(key,value){this.pressed=value;},addEventListener(event,fn){this.click=fn;}}));
 const views=tabs.map(tab=>({dataset:{commandView:tab.dataset.commandTab},hidden:tab.dataset.commandTab!=='instruct'}));
 const link={href:'/founder-console.html',setAttribute(key,value){this.current=value;}};
 const document={body:{removeAttribute:key=>bodyAttrs.delete(key),toggleAttribute:(key,value)=>value?bodyAttrs.add(key):bodyAttrs.delete(key)},querySelector:()=>toggle,querySelectorAll:selector=>selector==='[data-command-tab]'?tabs:selector==='[data-command-view]'?views:selector==='.va-product-nav a'?[link]:[],getElementById:id=>id==='module-nav'?{addEventListener:(event,fn)=>events.module=fn}:null,addEventListener:(event,fn)=>events[event]=fn};
 vm.runInNewContext(source,{document,location:{pathname:'/founder-console.html',origin:'https://vaos.example',hash:''},URL,window:{addEventListener(){}}});
 return {events,attrs,bodyAttrs,tabs,views,link};
}
test('mobile departments close after selection and Escape, while route aliases stay selected',()=>{
 const {events,attrs,bodyAttrs,link}=boot();assert.equal(link.current,'page');events.toggle();assert.equal(attrs.get('aria-expanded'),'true');assert.ok(bodyAttrs.has('data-modules-open'));
 events.module({target:{closest:()=>({})}});assert.equal(attrs.get('aria-expanded'),'false');events.toggle();events.keydown({key:'Escape'});assert.equal(attrs.get('aria-expanded'),'false');assert.equal(bodyAttrs.size,0);
});
test('command workspace switches views without submitting or modifying form content',()=>{
 const {tabs,views}=boot();tabs[1].click();assert.deepEqual(views.map(view=>view.hidden),[true,false,true]);assert.deepEqual(tabs.map(tab=>tab.pressed),['false','true','false']);tabs[0].click();assert.deepEqual(views.map(view=>view.hidden),[false,true,true]);
});
