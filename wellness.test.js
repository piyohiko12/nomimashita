import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createCore } from './core.js';
import { LocalStore, validateBackup } from './storage.js';
import { MOODS, SYMPTOMS, validateWellness, faceIcon, moodLabel, wellnessBanner, wellnessDetails, wellnessEditor } from './wellness.js';

const core=createCore(), now='2026-09-06T03:00:00Z', tomorrow='2026-09-06T20:00:00Z', day=core.day(now);
const sample=()=>({mood:'low',symptoms:['headache','fatigue'],note:'朝から頭が重い。\n午後は少し落ち着いた。'});
const record=(state,value=sample(),date=day,clock=now)=>core.apply(state,{type:'wellness',revision:state.revision,day:date,viewDay:core.day(clock),wellness:value},clock);

test('wellness can be recorded without registering medication',()=>{
  const initial=core.initial(now), saved=record(initial);
  assert.equal(saved.wellness[day].mood,'low');assert.equal(saved.version,2);
  assert.deepEqual(saved.medicines,[]);assert.deepEqual(initial.wellness,{});
  assert.equal(saved.wellness[day].updatedAt,now);
});
test('all five moods work and selection-only entry needs no symptoms or note',()=>{
  for(const mood of MOODS){const saved=record(core.initial(now),{mood:mood.id,symptoms:[],note:''});assert.equal(saved.wellness[day].mood,mood.id);assert.ok(faceIcon(mood.id).includes('aria-hidden="true"'));assert.equal(moodLabel(mood.id),mood.label);}
  assert.equal(faceIcon('unknown'),'');assert.equal(moodLabel(null),'未記録');
});
test('wellness edits replace one day without changing medication or other days',()=>{
  let s=record(core.initial(now));s=record(s,{mood:'great',symptoms:[],note:''},'2026-09-07',tomorrow);
  s.records[day]={m_12345678:{0:{name:'テスト薬',qty:1,time:'08:00',recordedAt:now,retrospective:false}}};
  const meds=structuredClone(s.records);s=record(s,{mood:'okay',symptoms:['fatigue'],note:'変更'},day,tomorrow);
  assert.equal(s.wellness[day].mood,'okay');assert.equal(s.wellness['2026-09-07'].mood,'great');assert.deepEqual(s.records,meds);
});
test('wellness is retained across 05:00 and next day starts unrecorded',()=>{
  const s=record(core.initial(now));assert.equal(core.day('2026-09-06T19:59:59Z'),day);assert.equal(s.wellness[core.day(tomorrow)],undefined);assert.equal(s.wellness[day].mood,'low');
  assert.throws(()=>core.apply(s,{type:'wellness',revision:s.revision,day,viewDay:day,wellness:sample()},tomorrow),/朝5時/);
});
test('wellness rejects invalid, future and pre-start dates and stale revision',()=>{
  const s=core.initial(now);for(const date of ['2026-02-30','2026-09-05','2026-09-07','__proto__'])assert.throws(()=>record(s,sample(),date));
  assert.throws(()=>core.apply(s,{type:'wellness',revision:50,day,viewDay:day,wellness:sample()},now));
});
test('wellness validates IDs, duplicates, required mood and memo limit',()=>{
  for(const bad of [null,{...sample(),mood:''},{...sample(),mood:'__proto__'},{...sample(),symptoms:['unknown']},{...sample(),symptoms:['fever','fever']},{...sample(),symptoms:'headache'},{...sample(),note:null},{...sample(),note:'あ'.repeat(1001)}])assert.throws(()=>validateWellness(bad));
  assert.equal(validateWellness({...sample(),note:'あ'.repeat(1000)}).note.length,1000);
  assert.deepEqual(validateWellness({...sample(),symptoms:['fatigue','headache']}).symptoms,['headache','fatigue']);
  assert.deepEqual(validateWellness({...sample(),injected:'ignore'}),sample());
});
test('deleting wellness affects only the selected day, never medication checks',()=>{
  let s=record(core.initial(now));s=record(s,{mood:'good',symptoms:[],note:''},'2026-09-07',tomorrow);const before=structuredClone(s.records);
  s=core.apply(s,{type:'wellness-delete',revision:s.revision,day,viewDay:'2026-09-07'},tomorrow);
  assert.equal(s.wellness[day],undefined);assert.equal(s.wellness['2026-09-07'].mood,'good');assert.deepEqual(s.records,before);
});
test('version 1 migration preserves medicines, checks and theme; old exports still work',()=>{
  const old=core.initial(now);old.version=1;delete old.wellness;old.settings.theme='character';
  old.medicines=[{id:'m_12345678',revisions:[{day,name:'既存の薬',note:'そのまま残す',active:true,slots:[{on:true,qty:1,time:'08:00',remind:true},{on:false,qty:1,time:'12:00',remind:false},{on:true,qty:2,time:'20:00',remind:false}]}]}];
  old.records[day]={m_12345678:{0:{name:'既存の薬',qty:1,time:'08:00',recordedAt:now,retrospective:false}}};
  const migrated=validateBackup({app:'のみました',state:old},core,now);
  assert.equal(migrated.version,2);assert.deepEqual(migrated.wellness,{});assert.deepEqual(migrated.medicines,old.medicines);assert.deepEqual(migrated.records,old.records);assert.deepEqual(migrated.settings,old.settings);assert.equal(old.version,1);assert.equal(old.wellness,undefined);
});
test('new backups retain wellness and old or new wrapper labels can be read',()=>{
  const state=record(core.initial(now));for(const app of ['ここちログ','のみました'])assert.deepEqual(validateBackup({app,state},core,now),state);
  assert.deepEqual(validateBackup(state,core,now),state);
});
test('malformed wellness backups fail without quietly discarding entries',()=>{
  for(const alter of [s=>delete s.wellness,s=>s.wellness=[],s=>s.wellness[day].mood='other',s=>s.wellness[day].updatedAt='bad',s=>s.wellness['2026-09-07']=s.wellness[day],s=>s.wellness['2026-09-05']=s.wellness[day]]){const s=record(core.initial(now));alter(s);assert.throws(()=>validateBackup(s,core,now));}
});
test('store includes wellness in get, restore and subsequent medicine/theme edits',async()=>{
  const store=new LocalStore(core,{memory:true,clock:()=>now});let r=await store.request({type:'get'});
  r=await store.request({type:'wellness',revision:r.state.revision,day,viewDay:day,wellness:sample()});
  r=await store.request({type:'theme',revision:r.state.revision,theme:'soft'});assert.equal(r.state.wellness[day].mood,'low');
  const other=new LocalStore(core,{memory:true,clock:()=>now});await other.request({type:'restore',revision:0,backup:{app:'ここちログ',state:r.state}});
  assert.deepEqual((await other.request({type:'get'})).state.wellness,r.state.wellness);
});
test('functional faces, radios, symptom grid and memo are accessible and escape text',()=>{
  const html=wellnessEditor({day,mood:'low',symptoms:['headache'],note:'<img src=x onerror=alert(1)>',existing:true});
  assert.equal((html.match(/type="radio"/g)||[]).length,5);assert.equal((html.match(/name="symptoms"/g)||[]).length,SYMPTOMS.length);
  assert.ok(html.includes('value="low" checked required'));assert.ok(html.includes('maxlength="1000"'));assert.ok(!html.includes('<img src=x'));
  const detail=wellnessDetails({...sample(),note:'<script>bad</script>\nメモ'},day);assert.ok(detail.includes('&lt;script&gt;'));assert.ok(detail.includes('頭痛'));assert.ok(detail.includes('編集する'));
  assert.ok(wellnessDetails(null,day).includes('まだ記録されていません'));assert.ok(wellnessBanner(null,day).includes('体調の記録をする'));
});
test('name and PWA identity preserve existing installation and storage',()=>{
  const source=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8'),html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  const manifest=JSON.parse(fs.readFileSync(new URL('./manifest.webmanifest',import.meta.url)));
  assert.equal(manifest.short_name,'ここちログ');assert.equal(manifest.id,'./');assert.equal(manifest.start_url,'./');assert.ok(html.includes('ここちログ'));assert.ok(!source.includes('class="brand">のみました'));
  const store=new LocalStore(core);assert.equal(store.dbName,'nomimashita-v1:/');
  const sw=fs.readFileSync(new URL('./sw.js',import.meta.url),'utf8');assert.ok(sw.includes("'v2-wellness'"));assert.ok(sw.includes("'./wellness.js'"));
});

// Exercise the real application event handlers without a browser or personal data.
async function appHarness(clock=()=>now){
  const elements=new Map(),events=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',className:'',dataset:{},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},appendChild(){},showModal(){this.open=true;},close(){this.open=false;}});
    return elements.get(id);
  };
  const doc={getElementById:element,querySelectorAll:()=>[],body:{dataset:{}},addEventListener:(type,fn)=>events.set(type,fn),visibilityState:'visible',createElement:()=>({dataset:{}})};
  class TestStore extends LocalStore { constructor(c){super(c,{memory:true,clock});} }
  class Form { constructor(target){this.values=target.values;}get(name){return this.values[name]??null;}getAll(name){return this.values[name]||[];} }
  const source=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  const ctx={createCore,LocalStore:TestStore,validateBackup,faceIcon,moodLabel,wellnessBanner,wellnessDetails,wellnessEditor,document:doc,location:{href:'https://example.test/nomimashita/?demo=1'},URL,FormData:Form,Date,structuredClone,crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'},window:{scrollTo(){}},navigator:{},setTimeout(){},setInterval(){},clearTimeout(){}};
  vm.runInNewContext(source,ctx);await new Promise(resolve=>setImmediate(resolve));
  return {element,async click(dataset){events.get('click')({target:{closest:()=>({dataset,disabled:false})}});await new Promise(resolve=>setImmediate(resolve));},async submit(values){events.get('submit')({target:{id:'wellness-editor',values},preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));},async confirm(yes){element(yes?'confirm-yes':'confirm-no').listeners.click();await new Promise(resolve=>setImmediate(resolve));}};
}
test('app flow: home banner → selection entry → calendar face and detail → edit → delete',async()=>{
  const app=await appHarness();assert.ok(app.element('heading').innerHTML.includes('ここち'));assert.ok(app.element('content').innerHTML.includes('体調の記録をする'));
  await app.click({wellnessEdit:day});assert.ok(app.element('content').innerHTML.includes('wellness-editor'));
  await app.submit(sample());assert.ok(app.element('content').innerHTML.includes('今日の体調 · 不調'));
  await app.click({tab:'calendar'});let html=app.element('content').innerHTML;assert.ok(html.includes('体調 不調・服薬 予定なし'));assert.ok(html.includes('朝から頭が重い。'));assert.ok(html.includes('data-mood="low"'));
  await app.click({wellnessEdit:day});assert.ok(app.element('content').innerHTML.includes('value="low" checked required'));
  await app.submit({mood:'good',symptoms:[],note:'落ち着いた'});html=app.element('content').innerHTML;assert.ok(html.includes('体調 良好・服薬 予定なし'));assert.ok(html.includes('落ち着いた'));assert.ok(!html.includes('朝から頭が重い。'));
  await app.click({wellnessEdit:day});await app.click({wellnessDelete:day});assert.equal(app.element('confirm').open,true);await app.confirm(false);assert.ok(app.element('content').innerHTML.includes('wellness-editor'));
  await app.click({wellnessDelete:day});await app.confirm(true);assert.ok(app.element('content').innerHTML.includes('まだ記録されていません'));
});
test('app flow: unsaved entry asks before leaving and 05:00 does not move a draft to another date',async()=>{
  let clock=now;const app=await appHarness(()=>clock);await app.click({wellnessEdit:day});await app.click({tab:'calendar'});assert.equal(app.element('confirm').open,true);await app.confirm(false);assert.ok(app.element('content').innerHTML.includes('wellness-editor'));
  clock=tomorrow;await app.submit(sample());assert.ok(app.element('message').textContent.includes('保存できませんでした'));assert.ok(app.element('message').textContent.includes('朝5時'));assert.ok(app.element('content').innerHTML.includes('wellness-editor'));
});
test('app flow: yesterday remains editable while today is a new blank wellness record',async()=>{
  let clock=now;const app=await appHarness(()=>clock);await app.click({wellnessEdit:day});await app.submit(sample());clock=tomorrow;
  await app.click({reload:'1'});assert.ok(app.element('content').innerHTML.includes('体調の記録をする'));await app.click({tab:'calendar'});await app.click({day});
  assert.ok(app.element('content').innerHTML.includes('朝から頭が重い。'));await app.click({wellnessEdit:day});await app.submit({mood:'okay',symptoms:[],note:'昨日の補足'});
  assert.ok(app.element('content').innerHTML.includes('昨日の補足'));await app.click({day:'2026-09-07'});assert.ok(app.element('content').innerHTML.includes('まだ記録されていません'));
});

// An IDB protocol double exercises transactional calls; it is not a real-browser test.
function persistenceDouble(seed,{rejectWrites=false}={}) {
  let stored=structuredClone(seed),puts=0;
  const db={transaction(){
    let aborted=false,staged=stored;
    const tx={objectStore:()=>({get(){const req={};queueMicrotask(()=>{req.result=structuredClone(stored);req.onsuccess();queueMicrotask(()=>{if(!aborted){stored=staged;tx.oncomplete();}});});return req;},put(value){puts++;if(rejectWrites)throw new Error('容量不足');staged=structuredClone(value);}}),abort(){aborted=true;queueMicrotask(()=>tx.onabort());}};
    return tx;
  },close(){}};
  return {get stored(){return structuredClone(stored);},get puts(){return puts;},factory:{open(){const req={};queueMicrotask(()=>{req.result=db;req.onsuccess();});return req;}}};
}
test('persistence path upgrades v1 on read and keeps wellness in a new store instance',async()=>{
  const old=core.initial(now);old.version=1;delete old.wellness;old.settings.theme='soft';
  const db=persistenceDouble(old),store=new LocalStore(core,{factory:db.factory,clock:()=>now});const first=await store.request({type:'get'});
  assert.equal(db.stored.version,2);assert.equal(db.puts,1);assert.equal(db.stored.settings.theme,'soft');
  await store.request({type:'wellness',revision:first.state.revision,day,viewDay:day,wellness:sample()});
  const reopened=await new LocalStore(core,{factory:db.factory,clock:()=>now}).request({type:'get'});assert.deepEqual(reopened.state.wellness[day],{...sample(),updatedAt:now});assert.equal(db.puts,2);
});
test('failed persistence never reports saved or replaces previous records',async()=>{
  const prior=record(core.initial(now)),db=persistenceDouble(prior,{rejectWrites:true});const store=new LocalStore(core,{factory:db.factory,clock:()=>now});
  await assert.rejects(store.request({type:'wellness',revision:prior.revision,day,viewDay:day,wellness:{mood:'great',symptoms:[],note:''}}),/容量不足/);assert.deepEqual(db.stored,prior);
});
