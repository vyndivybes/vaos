import test from 'node:test';import assert from 'node:assert/strict';import {createProjectNotes} from './project-notes.mjs';
function fakeStore(){const data=new Map();return{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}}
test('notes save only on explicit call and reload in the same local store',()=>{
 const store=fakeStore();const a=createProjectNotes({store});
 assert.equal(a.list().length,0);a.save('VYNDI','Review fork crown clearance');const b=createProjectNotes({store});
 assert.deepEqual(b.list().map(x=>x.note),['Review fork crown clearance']);
 assert.equal(b.list()[0].project,'VYNDI');
 b.clear();assert.equal(createProjectNotes({store}).list().length,0);
});
test('notes reject credential-looking text and cap history',()=>{
 const store=fakeStore(),n=createProjectNotes({store});
 assert.throws(()=>n.save('VYNDI','password=secret123'),/SENSITIVE/);
 assert.throws(()=>n.save('VYNDI','api_key=xyz123'),/SENSITIVE/);
 for(let i=0;i<15;i++)n.save('VYNDI','Design action '+i);
 assert.equal(n.list().length,8);
 assert.ok(n.context('What now?').length<=1000);
});
test('corrupt or absent storage fails closed without altering other keys',()=>{
 const store=fakeStore();store.setItem('unrelated','preserve');store.setItem('vaos.jarvis.project-notes.v1','invalid');
 const n=createProjectNotes({store});assert.deepEqual(n.list(),[]);n.clear();assert.equal(store.getItem('unrelated'),'preserve');
});
test('UI makes cross-session project notes explicit and optional',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../jarvis-multimodal.html',import.meta.url),'utf8');
 const ui=await readFile(new URL('../jarvis-multimodal.mjs',import.meta.url),'utf8');
 for(const id of ['project-note','project-note-save','project-note-clear','project-note-list'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(ui.includes('createProjectNotes'));
 assert.match(html,/this device/i);
});
