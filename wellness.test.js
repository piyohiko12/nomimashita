import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createCore } from './core.js';
import { LocalStore, validateBackup } from './storage.js';
import { MOODS, SYMPTOMS, BOWEL_OPTIONS, bowelLabel, validateWellness, faceIcon, moodLabel, wellnessBanner, wellnessDetails, wellnessEditor } from './wellness.js';
import { largeDate, verticalMedicines, calendarDoseDots } from './medicine-view.js';

const core=createCore(), now='2026-09-06T03:00:00Z', tomorrow='2026-09-06T20:00:00Z', day=core.day(now);
const sample=()=>({mood:'low',symptoms:['headache','fatigue'],note:'朝から頭が重い。\n午後は少し落ち着いた。',bowel:'unrecorded'});
const record=(state,value=sample(),date=day,clock=now)=>core.apply(state,{type:'wellness',revision:state.revision,day:date,viewDay:core.day(clock),wellness:value},clock);

test('wellness can be recorded without registering medication',()=>{
  const initial=core.initial(now), saved=record(initial);
  assert.equal(saved.wellness[day].mood,'low');assert.equal(saved.version,3);
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
test('version 1 migration preserves medicines and checks while retiring the old theme',()=>{
  const old=core.initial(now);old.version=1;delete old.wellness;old.settings.theme='retired-theme';
  old.medicines=[{id:'m_12345678',revisions:[{day,name:'既存の薬',note:'そのまま残す',active:true,slots:[{on:true,qty:1,time:'08:00',remind:true},{on:false,qty:1,time:'12:00',remind:false},{on:true,qty:2,time:'20:00',remind:false}]}]}];
  old.records[day]={m_12345678:{0:{name:'既存の薬',qty:1,time:'08:00',recordedAt:now,retrospective:false}}};
  const migrated=validateBackup({app:'のみました',state:old},core,now);
  assert.equal(migrated.version,3);assert.deepEqual(migrated.wellness,{});assert.deepEqual(migrated.medicines,old.medicines);assert.deepEqual(migrated.records,old.records);assert.equal(migrated.settings.theme,'coral');assert.equal(old.settings.theme,'retired-theme');assert.equal(old.version,1);assert.equal(old.wellness,undefined);
});
test('new backups retain wellness and old or new wrapper labels can be read',()=>{
  const state=record(core.initial(now));for(const app of ['おくすり記録','お薬記録','ここちログ','のみました'])assert.deepEqual(validateBackup({app,state},core,now),state);
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
  assert.equal((html.match(/name="mood"/g)||[]).length,5);assert.equal((html.match(/name="symptoms"/g)||[]).length,SYMPTOMS.length);assert.equal((html.match(/name="bowel"/g)||[]).length,3);
  assert.ok(html.includes('value="low" checked required'));assert.ok(html.includes('maxlength="1000"'));assert.ok(!html.includes('<img src=x'));
  const bowelBlock=html.match(/<div class="bowel-options">([\s\S]*?)<\/div><\/fieldset>/)[1];
  assert.ok(bowelBlock.includes('>でた</span>'));assert.ok(bowelBlock.includes('>でていない</span>'));assert.ok(!bowelBlock.includes('<b'));
  const detail=wellnessDetails({...sample(),note:'<script>bad</script>\nメモ'},day);assert.ok(detail.includes('&lt;script&gt;'));assert.ok(detail.includes('頭痛'));assert.ok(detail.includes('編集する'));
  assert.ok(wellnessDetails(null,day).includes('まだ記録されていません'));assert.ok(wellnessBanner(null,day).includes('体調の記録をする'));
});
test('name and PWA identity preserve existing installation and storage',()=>{
  const source=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8'),html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  const manifest=JSON.parse(fs.readFileSync(new URL('./manifest.webmanifest',import.meta.url)));
  assert.equal(manifest.short_name,'おくすり記録');assert.equal(manifest.id,'./');assert.equal(manifest.start_url,'./');assert.ok(html.includes('おくすり記録'));assert.ok(!source.includes('class="brand">のみました'));
  const store=new LocalStore(core);assert.equal(store.dbName,'nomimashita-v1:/');
  const sw=fs.readFileSync(new URL('./sw.js',import.meta.url),'utf8');assert.ok(sw.includes("'v3-4-coral-clean'"));for(const asset of ['wellness.js','medicine-view.js','brand-mark.svg'])assert.ok(sw.includes("'./"+asset+"'"));
});

// Exercise the real application event handlers without a browser or personal data.
async function appHarness(clock=()=>now,seed=null){
  const elements=new Map(),events=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',className:'',dataset:{},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},appendChild(){},showModal(){this.open=true;},close(){this.open=false;}});
    return elements.get(id);
  };
  const doc={getElementById:element,querySelectorAll:()=>[],body:{dataset:{}},addEventListener:(type,fn)=>events.set(type,fn),visibilityState:'visible',createElement:()=>({dataset:{}})};
  class TestStore extends LocalStore { constructor(c){super(c,{memory:true,clock});if(seed)this.value=structuredClone(seed);} }
  class Form { constructor(target){this.values=target.values;}get(name){return this.values[name]??null;}getAll(name){return this.values[name]||[];} }
  const source=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  const ctx={createCore,LocalStore:TestStore,validateBackup,faceIcon,moodLabel,wellnessBanner,wellnessDetails,wellnessEditor,largeDate,verticalMedicines,calendarDoseDots,document:doc,location:{href:'https://example.test/nomimashita/?demo=1'},URL,FormData:Form,Date,structuredClone,crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'},window:{scrollTo(){}},navigator:{},setTimeout(){},setInterval(){},clearTimeout(){}};
  vm.runInNewContext(source,ctx);await new Promise(resolve=>setImmediate(resolve));
  return {element,async click(dataset){events.get('click')({target:{closest:()=>({dataset,disabled:false})}});await new Promise(resolve=>setImmediate(resolve));},async submit(values){events.get('submit')({target:{id:'wellness-editor',values},preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));},async confirm(yes){element(yes?'confirm-yes':'confirm-no').listeners.click();await new Promise(resolve=>setImmediate(resolve));}};
}
test('app flow: home banner → selection entry → calendar face and detail → edit → delete',async()=>{
  const app=await appHarness();assert.ok(app.element('heading').innerHTML.includes('おくすり記録'));assert.ok(app.element('content').innerHTML.includes('体調の記録をする'));
  await app.click({wellnessEdit:day});assert.ok(app.element('content').innerHTML.includes('wellness-editor'));
  await app.submit(sample());assert.ok(app.element('content').innerHTML.includes('今日の体調 · 不調'));
  await app.click({tab:'calendar'});let html=app.element('content').innerHTML;assert.ok(html.includes('体調 不調・服薬予定なし'));assert.ok(html.includes('朝から頭が重い。'));assert.ok(html.includes('data-mood="low"'));
  await app.click({wellnessEdit:day});assert.ok(app.element('content').innerHTML.includes('value="low" checked required'));
  await app.submit({mood:'good',symptoms:[],note:'落ち着いた'});html=app.element('content').innerHTML;assert.ok(html.includes('体調 良好・服薬予定なし'));assert.ok(html.includes('落ち着いた'));assert.ok(!html.includes('朝から頭が重い。'));
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
  assert.equal(db.stored.version,3);assert.equal(db.puts,1);assert.equal(db.stored.settings.theme,'soft');
  await store.request({type:'wellness',revision:first.state.revision,day,viewDay:day,wellness:sample()});
  const reopened=await new LocalStore(core,{factory:db.factory,clock:()=>now}).request({type:'get'});assert.deepEqual(reopened.state.wellness[day],{...sample(),updatedAt:now});assert.equal(db.puts,2);
});
test('failed persistence never reports saved or replaces previous records',async()=>{
  const prior=record(core.initial(now)),db=persistenceDouble(prior,{rejectWrites:true});const store=new LocalStore(core,{factory:db.factory,clock:()=>now});
  await assert.rejects(store.request({type:'wellness',revision:prior.revision,day,viewDay:day,wellness:{mood:'great',symptoms:[],note:''}}),/容量不足/);assert.deepEqual(db.stored,prior);
});
test('bowel records distinguish yes, no and unrecorded and validate all input',()=>{
  for(const option of BOWEL_OPTIONS){const s=record(core.initial(now),{...sample(),bowel:option.id});assert.equal(s.wellness[day].bowel,option.id);assert.ok(wellnessDetails(s.wellness[day],day).includes(bowelLabel(option.id)));assert.deepEqual(validateBackup({app:'おくすり記録',state:s},core,now),s);}
  const legacy=sample();delete legacy.bowel;assert.equal(validateWellness(legacy).bowel,'unrecorded');
  for(const bowel of [null,true,false,'','unknown','__proto__'])assert.throws(()=>validateWellness({...sample(),bowel}));
  const corrupt=record(core.initial(now));delete corrupt.wellness[day].bowel;assert.throws(()=>validateBackup(corrupt,core,now));
});
test('v2 migration preserves wellness and changes the retired theme to coral',async()=>{
  const old=record(core.initial(now));old.version=2;old.settings.theme='retired-theme';delete old.wellness[day].bowel;
  const migrated=validateBackup({app:'ここちログ',state:old},core,now);assert.equal(migrated.version,3);assert.equal(migrated.wellness[day].bowel,'unrecorded');assert.equal(migrated.settings.theme,'coral');assert.deepEqual(migrated.wellness[day].symptoms,old.wellness[day].symptoms);assert.equal(migrated.wellness[day].note,old.wellness[day].note);
  const db=persistenceDouble(old);await new LocalStore(core,{factory:db.factory,clock:()=>now}).request({type:'get'});assert.deepEqual(db.stored,migrated);
});
test('coral is the default among three supported themes',()=>{
  assert.equal(core.initial(now).settings.theme,'coral');
  for(const theme of ['coral','simple','soft']){const s=core.apply(core.initial(now),{type:'theme',revision:0,theme},now);assert.equal(validateBackup(s,core,now).settings.theme,theme);}
  const old=core.initial(now);old.version=2;old.settings.theme='soft';assert.equal(validateBackup(old,core,now).settings.theme,'soft');
});
test('reference home has a large correct JST date and vertical medication rows',()=>{
  assert.ok(largeDate(day).includes('9月6日'));assert.ok(largeDate(day).includes('（日）'));assert.ok(largeDate('2027-01-01').includes('（金）'));
  const plans=[{id:'m_12345678',name:'薬A',note:'',slots:[{on:true,qty:1,time:'08:00',taken:true},{on:false},{on:true,qty:2,time:'20:00',taken:false}]},{id:'m_abcdefgh',name:'<薬B>',note:'<script>x</script>',slots:[{on:true,qty:1,time:'08:00',taken:false},{on:true,qty:1,time:'12:00',taken:false},{on:true,qty:1,time:'20:00',taken:false}]}];
  const html=verticalMedicines(plans,day);assert.equal((html.match(/class="dose-list"/g)||[]).length,2);assert.equal((html.match(/data-check=/g)||[]).length,5);assert.ok(html.includes('（朝1錠・晩2錠）'));assert.ok(html.includes('（1錠）'));assert.ok(!html.includes('予定なし'));assert.ok(html.indexOf('薬A')<html.indexOf('&lt;薬B&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('服用済み'));assert.ok(html.includes('round-check'));assert.ok(!html.includes('1/5'));
});
test('app flow: selected bowel result persists in form and calendar and can be corrected',async()=>{
  const app=await appHarness();assert.ok(app.element('content').innerHTML.includes('9月6日'));assert.ok(app.element('heading').innerHTML.includes('設定を開く'));
  await app.click({wellnessEdit:day});assert.ok(app.element('content').innerHTML.includes('value="unrecorded" checked'));
  await app.submit({...sample(),bowel:'yes'});assert.ok(app.element('content').innerHTML.includes('トイレ：でた'));
  await app.click({tab:'calendar'});assert.ok(app.element('content').innerHTML.includes('トイレ（排便）</h3><strong>でた'));
  await app.click({wellnessEdit:day});assert.ok(app.element('content').innerHTML.includes('name="bowel" value="yes" checked'));
  await app.submit({...sample(),bowel:'no'});assert.ok(app.element('content').innerHTML.includes('トイレ（排便）</h3><strong>でていない'));
  await app.click({tab:'settings'});await app.click({page:'themes'});assert.equal((app.element('content').innerHTML.match(/data-theme-option=/g)||[]).length,3);await app.click({themeOption:'coral'});assert.ok(app.element('content').innerHTML.includes('やさしいコーラル'));
});
test('bowel belongs to one day and is retained in backup after midnight and 05:00',()=>{
  let s=record(core.initial(now),{...sample(),bowel:'yes'});assert.equal(s.wellness[core.day('2026-09-06T16:00:00Z')].bowel,'yes');assert.equal(s.wellness[core.day(tomorrow)],undefined);
  s=record(s,{...sample(),bowel:'no'},'2026-09-07',tomorrow);s=record(s,{...sample(),bowel:'unrecorded'},day,tomorrow);assert.equal(s.wellness['2026-09-07'].bowel,'no');assert.equal(s.wellness[day].bowel,'unrecorded');assert.deepEqual(validateBackup(s,core,tomorrow),s);
});

function medicationSeed(mask=5){
  const s=core.initial(now);
  s.medicines=[{id:'m_12345678',revisions:[{day,name:'表示確認用の薬',note:'',active:true,slots:[0,1,2].map(i=>({on:!!(mask&(1<<i)),qty:i+1,time:['08:00','12:00','20:00'][i],remind:false}))}]}];
  return s;
}
test('calendar dose dots use morning/noon/evening colors and distinguish taken, missing and partial',()=>{
  const plans=[
    {slots:[{on:true,taken:true},{on:true,taken:false},{on:true,taken:true}]},
    {slots:[{on:false},{on:false},{on:true,taken:false}]}
  ];
  const dots=calendarDoseDots(plans);
  assert.deepEqual(dots.statuses,['taken','missing','partial']);
  assert.ok(dots.html.includes('dose-dot-0 taken'));assert.ok(dots.html.includes('dose-dot-1 missing'));assert.ok(dots.html.includes('dose-dot-2 partial'));
  assert.equal(dots.text,'朝 服用済み・昼 未チェック・晩 一部服用済み');
  assert.ok(!/[✓○−]/.test(dots.html));
  assert.equal(calendarDoseDots([]).text,'服薬予定なし');
});
test('calendar dot row omits every unscheduled period across all seven schedules',()=>{
  for(let mask=1;mask<8;mask++){
    const dots=calendarDoseDots(core.plans(medicationSeed(mask),day));
    for(let i=0;i<3;i++)assert.equal(dots.html.includes('dose-dot-'+i),!!(mask&(1<<i)));
    assert.equal((dots.html.match(/class="dose-dot /g)||[]).length,[0,1,2].filter(i=>mask&(1<<i)).length);
  }
});
test('all seven schedules omit inactive home rows without reindexing morning/noon/evening',()=>{
  for(let mask=1;mask<8;mask++){
    const s=medicationSeed(mask),before=structuredClone(s),html=verticalMedicines(core.plans(s,day),day);
    for(let i=0;i<3;i++)assert.equal(html.includes('data-slot="'+i+'"'),!!(mask&(1<<i)));
    assert.equal((html.match(/class="dose-row"/g)||[]).length,[0,1,2].filter(i=>mask&(1<<i)).length);
    assert.ok(!html.includes('dose-inactive'));assert.ok(!html.includes('予定なし'));assert.deepEqual(s,before);
  }
  assert.ok(verticalMedicines([],day).includes('この日の服薬予定はありません'));
});
test('app flow: hidden noon remains absent while evening check works in home and calendar',async()=>{
  const app=await appHarness(()=>now,medicationSeed());
  const slots=()=>Array.from(app.element('content').innerHTML.matchAll(/data-slot="(\d)"/g),m=>m[1]);
  assert.deepEqual(slots(),['0','2']);
  await app.click({check:'m_12345678',date:day,slot:'2'});
  assert.ok(app.element('content').innerHTML.includes('data-slot="2" aria-pressed="true"'));
  await app.click({tab:'calendar'});assert.deepEqual(slots(),['0','2']);
  let calendarHtml=app.element('content').innerHTML;
  assert.ok(calendarHtml.indexOf('calendar-stamp')<calendarHtml.indexOf('dose-dots'));
  assert.ok(calendarHtml.includes('dose-dot-0 missing'));assert.ok(calendarHtml.includes('dose-dot-2 taken'));assert.ok(!calendarHtml.includes('class="med-status"'));
  assert.ok(calendarHtml.includes('朝 未チェック・晩 服用済み'));
  assert.ok(app.element('content').innerHTML.includes('data-slot="2" aria-pressed="true"'));
  assert.ok(!app.element('content').innerHTML.includes('check no-plan'));
  await app.click({check:'m_12345678',date:day,slot:'2'});await app.confirm(true);
  assert.ok(app.element('content').innerHTML.includes('data-slot="2" aria-pressed="false"'));
  await app.click({tab:'home'});assert.deepEqual(slots(),['0','2']);
  await app.click({tab:'settings'});await app.click({edit:'m_12345678'});
  for(let i=0;i<3;i++)assert.ok(app.element('content').innerHTML.includes('name="on'+i+'"'));
});
test('calendar omits inactive slots for every schedule and retains original labels and indices',async()=>{
  for(let mask=1;mask<8;mask++){
    const app=await appHarness(()=>now,medicationSeed(mask));await app.click({tab:'calendar'});
    const html=app.element('content').innerHTML;
    for(let i=0;i<3;i++)assert.equal(html.includes('data-slot="'+i+'"'),!!(mask&(1<<i)));
  }
});
test('hiding unscheduled slots never hides a recorded snapshot or historical prescription',()=>{
  let s=medicationSeed();s=core.apply(s,{type:'check',revision:s.revision,id:'m_12345678',slot:2,day,viewDay:day,taken:true},now);
  // A later schedule only needs morning; yesterday's actual evening record survives.
  s.medicines[0].revisions.push({...structuredClone(s.medicines[0].revisions[0]),day:'2026-09-07',slots:[{on:true,qty:1,time:'08:00',remind:false},{on:false,qty:1,time:'12:00',remind:false},{on:false,qty:1,time:'20:00',remind:false}]});
  const old=verticalMedicines(core.plans(s,day),day),next=verticalMedicines(core.plans(s,'2026-09-07'),'2026-09-07');
  assert.ok(old.includes('data-slot="2" aria-pressed="true"'));assert.ok(!next.includes('data-slot="2"'));
  s.medicines[0].revisions[0].slots[2].on=false;
  assert.ok(verticalMedicines(core.plans(s,day),day).includes('data-slot="2" aria-pressed="true"'));
});
test('compact home retains touch-sized controls and responsive date typography',()=>{
  const css=fs.readFileSync(new URL('./styles.css',import.meta.url),'utf8');
  assert.ok(css.includes('font-size:clamp(2rem,9vw,2.625rem)'));assert.ok(css.includes('min-height:84px'));
  assert.ok(css.includes('min-height:44px'));assert.ok(css.includes('width:44px;height:44px'));
  assert.ok(!css.includes('min-height:102px'));assert.ok(!css.includes('font-size:clamp(2.5rem,12vw,3.5rem)'));
});
test('rose capsule icons have opaque PNGs at iPhone and PWA sizes and cache-matched version URLs',()=>{
  const root=new URL('./',import.meta.url),html=fs.readFileSync(new URL('index.html',root),'utf8'),sw=fs.readFileSync(new URL('sw.js',root),'utf8');
  const manifest=JSON.parse(fs.readFileSync(new URL('manifest.webmanifest',root)));
  for(const [name,size] of [['apple-touch-icon.png',180],['icon-192.png',192],['icon-512.png',512]]){
    const png=fs.readFileSync(new URL(name,root));assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);assert.equal(png[25],2);
    assert.ok(sw.includes('./'+name+'?v=rose-1'));
  }
  for(const icon of manifest.icons){assert.ok(sw.includes(icon.src));assert.ok(fs.existsSync(new URL(icon.src.split('?')[0],root)));}
  assert.ok(html.includes('sizes="180x180" href="./apple-touch-icon.png?v=rose-1"'));
  assert.ok(fs.readFileSync(new URL('icon.svg',root),'utf8').includes('カプセルとチェック'));
});
