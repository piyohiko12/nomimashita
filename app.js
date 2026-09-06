import { createCore } from './core.js';
import { LocalStore, validateBackup } from './storage.js';
import { faceIcon, moodLabel, wellnessBanner, wellnessDetails, wellnessEditor } from './wellness.js';
import { largeDate, verticalMedicines } from './medicine-view.js';

    'use strict';
    const Core = createCore();
    const demo = new URL(location.href).searchParams.get('demo') === '1';
    const store = new LocalStore(Core, { memory: demo });
    const MASCOT = './mascot.png';
    const $ = id => document.getElementById(id), labels = ['朝','昼','晩'];
    const themes = {coral:'やさしいコーラル',simple:'シンプル',soft:'ふんわり可愛い',character:'キャラクター'};
    const themeNotes = {coral:'淡いコーラル色と、ゆったりした丸いカード',simple:'白とグリーンのすっきりしたデザイン',soft:'淡いピンクとハートのやさしいデザイン',character:'キャラクターとミント色の楽しいデザイン'};
    const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const clone = value => JSON.parse(JSON.stringify(value));
    let state=null,today='',selected='',month='',tab='home',page='',draft=null,editMode='',busy=false,offset=0,pending=null;
    const icons={home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h1m4 0h1m4 0h1"/>',settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="var(--panel)"/><circle cx="15" cy="12" r="2" fill="var(--panel)"/><circle cx="9" cy="18" r="2" fill="var(--panel)"/>'};
    function call(request){return store.request(request);}
    function tell(text,error=false){$('message').className='message'+(error?' error':'');$('message').textContent=text;if(error){const b=document.createElement('button');b.textContent='再読み込み';b.dataset.reload='1';$('message').appendChild(b);}}
    function lock(value){busy=value;document.querySelectorAll('button,input,textarea').forEach(e=>{if(value){if(e.dataset.wasDisabled===undefined)e.dataset.wasDisabled=String(e.disabled);e.disabled=true;}else if(e.dataset.wasDisabled!==undefined){e.disabled=e.dataset.wasDisabled==='true';delete e.dataset.wasDisabled;}});}
    function accept(result){state=result.state;today=result.today;offset=new Date(result.now).getTime()-Date.now();if(!selected||selected>today||selected<state.startedDay)selected=today;if(!month||month<state.startedDay.slice(0,7))month=today.slice(0,7);}
    async function reload(silent=false){if(busy)return;lock(true);if(!silent)tell('読み込んでいます…');try{accept(await call({type:'get'}));draft=null;render();tell('');}catch(e){tell('読み込めませんでした。このブラウザーの保存機能が利用できません。通常のSafariで開いてください。 '+(e.message||''),true);}finally{lock(false);}}
    async function save(request,after){if(busy)return;lock(true);tell(demo?'体験用の記録を更新しています…':'この端末に保存しています…');try{accept(await call({...request,revision:state.revision}));if(after)after();render();tell(demo?'体験用の記録を更新しました':'保存しました');setTimeout(()=>{if(!busy&&['保存しました','体験用の記録を更新しました'].includes($('message').textContent))tell('');},2000);}catch(e){tell('保存できませんでした。変更は未保存です。 '+(e.message||''),true);}finally{lock(false);}}
    function decoration(theme){return theme==='character'?'<img class="mascot" src="'+MASCOT+'" alt="" aria-hidden="true">':theme==='soft'?'<span class="hearts" aria-hidden="true">✧<b>♡</b>✧</span>':'';}
    function back(){return '<button class="back" data-back="1">‹ 設定に戻る</button>';}
    function medicineCards(date){return Core.plans(state,date).map(m=>'<section class="section"><h2>'+esc(Core.title(m))+'</h2><div class="slots">'+m.slots.map((s,i)=>'<div class="slot"><span>'+labels[i]+'</span>'+(s.on?'<button class="check" data-check="'+esc(m.id)+'" data-date="'+date+'" data-slot="'+i+'" aria-pressed="'+!!s.taken+'" aria-label="'+esc(m.name)+' '+labels[i]+' '+(s.taken?'飲んだ・チェックを外す':'飲んだと記録')+'"><span class="mark" aria-hidden="true">'+(s.taken?'☑':'□')+'</span><strong>'+(s.taken?'飲んだ':'未チェック')+'</strong><small>'+s.qty+'錠 · '+s.time+'</small></button>':'<div class="check no-plan"><span class="mark" aria-hidden="true">—</span><small>予定なし</small></div>')+'</div>').join('')+'</div>'+(m.note?'<div class="note">'+esc(m.note)+'</div>':'')+'</section>').join('')||'<section class="section empty"><div class="symbol" aria-hidden="true">☑</div><p>この日の服薬予定はありません。</p>'+(date===today?'<button class="primary" data-add="1">＋ 薬を登録する</button>':'')+'</section>';}
    function due(){const now=new Date(Date.now()+offset+9*3600000),min=now.getUTCHours()*60+now.getUTCMinutes(),clock=min<300?min+1440:min;const result=[];for(const m of state.medicines){const r=Core.revision(m,today);if(!r||!r.active)continue;const p=Core.plans(state,today).find(p=>p.id===m.id);r.slots.forEach((s,i)=>{const [h,n]=s.time.split(':').map(Number),raw=h*60+n,target=raw<300?raw+1440:raw;if(s.on&&s.remind&&clock>=target&&!p?.slots[i]?.taken)result.push(r.name+' '+labels[i]+'（'+s.qty+'錠）');});}return result;}
    function home(){const reminders=due();return '<section class="section today-card">'+largeDate(today)+(reminders.length?'<div class="notice" role="status">設定した時刻を過ぎています<br>'+reminders.map(esc).join('<br>')+'<br><small>実際に飲んだことを確かめてチェックしてください。</small></div>':'')+verticalMedicines(Core.plans(state,today),today)+'<p class="automatic-save">'+(demo?'体験モード · 記録は保存されません':'<span aria-hidden="true">✓</span> 記録はこの端末に自動保存されます')+'</p></section>'+wellnessBanner(state.wellness[today],today)+'<p class="day-footnote">毎朝5:00に新しい日へ · 前日の記録は残ります</p>';}
    function calendar(){
      const [y,m]=month.split('-').map(Number),count=new Date(Date.UTC(y,m,0)).getUTCDate(),offset=new Date(Date.UTC(y,m-1,1)).getUTCDay();
      let cells=['日','月','火','水','木','金','土'].map(d=>'<small>'+d+'</small>').join('')+'<span></span>'.repeat(offset);
      const statusNames={empty:'予定なし',complete:'全部記録済み',partial:'一部記録済み',missing:'記録なし'};
      for(let d=1;d<=count;d++){
        const date=month+'-'+String(d).padStart(2,'0'),disabled=date<state.startedDay||date>today,status=Core.summary(state,date),record=state.wellness[date];
        const mark=disabled?'':({empty:'·',complete:'✓',partial:'○',missing:'−'}[status]);
        cells+='<button class="calendar-day" data-day="'+date+'" aria-label="'+date+' '+(disabled?'対象外':'体調 '+moodLabel(record?.mood)+'・服薬 '+statusNames[status])+'" aria-pressed="'+(date===selected)+'" data-state="'+(disabled?'empty':status)+'" '+(disabled?'disabled':'')+'><span class="calendar-number">'+d+'</span><span class="calendar-stamp" aria-hidden="true">'+(!disabled&&record?faceIcon(record.mood):'')+'</span><span class="med-status" aria-hidden="true">'+mark+'</span></button>';
      }
      return '<section class="section calendar-section"><div class="row"><button data-month="-1" aria-label="前の月" '+(month<=state.startedDay.slice(0,7)?'disabled':'')+'>‹</button><strong>'+y+'年'+m+'月</strong><button data-month="1" aria-label="次の月" '+(month>=today.slice(0,7)?'disabled':'')+'>›</button></div><div class="calendar">'+cells+'</div><div class="calendar-legend"><span>'+faceIcon('good')+'顔スタンプ：その日の体調</span><small>服薬　✓ 全部　○ 一部　− 記録なし　· 予定なし</small></div></section><div class="selected-date"><h2>'+selected.replaceAll('-','/')+' の記録</h2><p class="muted">日付を選ぶと、体調と服薬の記録が見られます。</p></div>'+wellnessDetails(state.wellness[selected],selected)+'<h3 class="medication-heading">お薬のチェック</h3>'+medicineCards(selected)+'<p class="muted">未チェックだけでは、実際に飲まなかったとは断定できません。記録開始前・未来の日は変更できません。</p>';
    }
    function settings(){return [['medicines','薬の登録','薬名・朝昼晩・何錠飲むか'],['reminders','アラーム・通知','時刻の設定と、Web版のお知らせ'],['reset','チェックの更新時間','毎朝 5:00・過去の記録は保持'],['themes','テーマ',themes[state.settings.theme]],['help','使い方・記録のバックアップ','iPhoneで開く・保存先について']].map(([id,title,note])=>'<button class="linkrow" data-page="'+id+'"><strong>'+title+'　›</strong><small>'+note+'</small></button>').join('');}
    function listMedicines(reminders=false){return back()+(reminders?'<div class="notice">このWeb版は、画面を閉じている間のアラーム・プッシュ通知には対応していません。下で時刻を設定すると、ホームを開いている間にお知らせします。<br>音での通知には、iPhoneの「時計」アプリにもアラームを設定してください。</div>':'<p><button class="primary" data-add="1">＋ 薬を追加</button></p>')+state.medicines.map(m=>{const r=Core.revision(m,today);if(!r)return '';return '<button class="linkrow" '+(reminders?'data-reminder':'data-edit')+'="'+m.id+'"><strong>'+esc(r.name)+'</strong><small>'+(r.active?r.slots.map((s,i)=>s.on?labels[i]+' '+(reminders?s.time+'・'+(s.remind?'画面内お知らせON':'お知らせOFF'):s.qty+'錠'):'').filter(Boolean).join(' / '):'休止中')+'</small></button>';}).join('')+(!state.medicines.length?'<p class="muted">まず「薬の登録」で薬を追加してください。</p>':'');}
    function themeOptions(){return back()+'<p class="muted">好きな雰囲気を選んでください</p>'+Object.keys(themes).map(id=>'<button class="theme-option" data-theme="'+id+'" data-theme-option="'+id+'" aria-pressed="'+(id===state.settings.theme)+'"><span class="row"><strong>'+themes[id]+'</strong><span class="theme-selected">'+(id===state.settings.theme?'✓ 選択中':'選ぶ')+'</span></span><small>'+themeNotes[id]+'</small><span class="mini"><span class="mini-content"><span>薬のチェック</span><span class="mini-slots">'+labels.map((s,i)=>'<span>'+s+'<b>'+(i===0?'☑':'□')+'</b></span>').join('')+'</span></span>'+decoration(id)+'</span></button>').join('')+'<p class="muted">選んだテーマは保存され、すべての画面に反映されます。</p>';}
    function resetPage(){return back()+'<section class="section"><h2>チェックの更新時間</h2><p class="time">毎朝 5:00</p><p>新しい日のチェックに切り替わります。</p><small>前日の記録はカレンダーに残ります。0:00〜4:59は前日分です。日本時間で朝5時固定です。</small></section><section class="section"><h2>通知時刻とは別です</h2><small>飲む時刻は「アラーム・通知」で設定できます。画面を閉じていた場合も、次に開くと新しい日を表示します。</small></section>';}
    function help(){return back()
      +'<section class="section help"><h2>iPhoneで使う</h2><ol><li>Safariで開き、共有メニューから「ホーム画面に追加」を選びます。Googleログインは不要です。</li><li>追加したアイコンから開いて、薬を登録してください。Safariとホーム画面版で記録が別になる場合があります。普段使う方を1つに決めてください。</li><li>アイコンは起動用です。アイコン上でチェックできるウィジェットではありません。</li></ol><a href="?demo=1" class="demo-link">保存せずに画面を試す →</a></section>'
      +'<section class="section"><h2>体調を残す</h2><p>ホームの薬チェックの下から、顔・症状・トイレ（排便）・メモを記録できます。トイレは「出た・出ていない・未記録」から選べます。顔を1つ選ぶだけでも保存できます。カレンダーの日付を選ぶと、内容の確認・編集ができます。</p><small>1日1つの体調記録です。薬と同じく日本時間の朝5:00が区切りで、0:00〜4:59は前日分になります。入力していないトイレ状況は「出ていない」ではなく「未記録」として残ります。体調の記録は自己評価であり、診断を行うものではありません。</small></section>'
      +'<section class="section"><h2>記録の保存とバックアップ</h2><p>薬・服薬記録・体調・テーマは、この端末のブラウザー内に保存します。アプリからGitHubやGoogleへ記録を送信しません。別の端末へは自動同期されません。</p><div class="notice">ブラウザーのデータ消去、端末の紛失、保存領域の整理で記録を失う場合があります。ときどきバックアップを保存してください。プライベートブラウズは使わないでください。</div><button class="secondary full" data-backup="1">記録をファイルに保存</button><label class="import-label">バックアップを読み込む<input id="import-file" type="file" accept="application/json,.json"></label><small>読み込むと、この画面の現在の記録を置き換えます。ファイルは端末内で処理し、アップロードしません。薬名や体調を含むファイルなので、共有先にはご注意ください。旧「のみました」のバックアップも読み込めます。</small></section>'
      +'<section class="section"><h2>服薬を記録するとき</h2><p>実際に飲んだことを確認してチェックしてください。服薬量や飲み忘れへの対応は、処方・医師や薬剤師の指示に従ってください。</p><small>このブラウザーを使える人は記録を見ることができます。端末の画面ロックを使ってください。画面を閉じている間の通知・アラームは未対応です。</small></section>';}
    function editor(){return '<form id="editor"><section class="section">'+(editMode==='medicine'?'<label>薬の名前<input name="name" maxlength="80" required autocomplete="off" value="'+esc(draft.name)+'"></label>':'<h2>'+esc(draft.name)+'</h2><p class="muted">ここで設定するのは、画面を開いている間のお知らせです。音は鳴りません。</p>')+draft.slots.map((s,i)=>editMode==='medicine'?'<div class="formslot"><label><input type="checkbox" name="on'+i+'" '+(s.on?'checked':'')+'>'+labels[i]+'に飲む</label><label class="qty">'+labels[i]+'の錠数<input name="qty'+i+'" type="number" min="0.01" max="99" step="0.01" inputmode="decimal" value="'+s.qty+'" required></label></div>':s.on?'<div class="formslot"><h3>'+labels[i]+'</h3><label>飲む時刻<input type="time" name="time'+i+'" value="'+s.time+'" required></label><label><input type="checkbox" name="remind'+i+'" '+(s.remind?'checked':'')+'>画面内のお知らせを表示</label></div>':'').join('')+(editMode==='medicine'?'<label>メモ（任意）<textarea name="note" maxlength="300">'+esc(draft.note)+'</textarea></label><label><input type="checkbox" name="active" '+(draft.active?'checked':'')+'>この薬の予定を有効にする</label><small>変更は今日から反映します。過去の日の予定と、チェック済みの錠数は保持します。使わなくなった薬はチェックを外して休止できます。お知らせ時刻は「アラーム・通知」で設定します。</small>':'<small>0:00〜4:59は前日分です。画面を閉じている間には通知されません。</small>')+'</section><div class="row savebar"><button type="button" data-cancel="1">キャンセル</button><button class="primary" type="submit">保存</button></div></form>';}
    function render(){
      if(!state)return;const theme=themes[state.settings.theme]?state.settings.theme:'simple',atHome=tab==='home'&&!draft;document.body.dataset.theme=theme;
      const title=draft?(editMode==='wellness'?'体調を記録':editMode==='medicine'?'薬の登録':'お知らせ時刻'):tab==='home'?'今日の記録':tab==='calendar'?'カレンダー':({medicines:'薬の登録',reminders:'アラーム・通知',reset:'チェックの更新時間',themes:'テーマ',help:'使い方'}[page]||'設定');
      $('heading').className=atHome?'home-masthead':'';
      $('heading').innerHTML='<div class="heading-copy"><div class="brand-lockup"><img class="brand-mark" src="./brand-mark.svg" alt=""><span class="brand-name">おくすり記録</span></div>'+(demo?'<span class="demo-badge">体験モード</span>':'')+(atHome?'':'<h1>'+title+'</h1>')+'</div><div class="header-actions">'+decoration(theme)+(atHome?'<button class="settings-shortcut" data-tab="settings" aria-label="設定を開く"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3 1-1h4l1 3 3 1 2-1 2 4-2 2v3l2 2-2 4-3-1-2 1-1 2h-4l-1-2-3-1-2 1-2-4 2-2v-3L2 9l2-4 3 1Z"/><circle cx="12" cy="12" r="3"/></svg></button>':'')+'</div>';
      $('content').innerHTML=draft?(editMode==='wellness'?wellnessEditor(draft):editor()):tab==='home'?home():tab==='calendar'?calendar():page==='medicines'?listMedicines():page==='reminders'?listMedicines(true):page==='themes'?themeOptions():page==='reset'?resetPage():page==='help'?help():settings();
      $('nav').innerHTML=[['home','ホーム'],['calendar','カレンダー'],['settings','設定']].map(([id,label])=>'<button data-tab="'+id+'" aria-current="'+(tab===id?'page':'false')+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+icons[id]+'</svg>'+label+'</button>').join('');$('saved').textContent=(demo?'体験用 · 記録は保存されません':'この端末に保存 · 日本時間');if(busy)lock(true);
    }
    function ask(text,action,label='変更する'){pending=action;$('confirm-text').textContent=text;$('confirm-yes').textContent=label;$('confirm').showModal();}
    function openEditor(id,mode){const m=state.medicines.find(m=>m.id===id);draft=m?{id,...clone(Core.revision(m,today))}:{id:'m_'+crypto.randomUUID(),name:'',note:'',active:true,slots:labels.map((_,i)=>({on:i===0,qty:1,time:['08:00','12:00','20:00'][i],remind:false}))};editMode=mode;tab='settings';page=mode==='medicine'?'medicines':'reminders';render();}
    function openWellness(date){if(!Core.validDay(date)||date<state.startedDay||date>today)return;const record=state.wellness[date];draft={day:date,mood:record?.mood||'',symptoms:clone(record?.symptoms||[]),note:record?.note||'',bowel:record?.bowel||'unrecorded',existing:!!record};editMode='wellness';render();window.scrollTo({top:0,behavior:'instant'});}
    function backup(){const blob=new Blob([JSON.stringify({app:'おくすり記録',exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='okusuri-kiroku-'+today+'.json';a.target='_blank';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    document.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b||b.disabled||busy)return;const d=b.dataset;
      if(d.reload){if(draft)ask('入力中の変更は保存されていません。破棄して読み直しますか？',()=>reload(),'読み直す');else reload();return;}
      if(!state)return;
      const go=()=>{
        tell('');
        if(d.tab){tab=d.tab;page='';draft=null;}
        else if(d.page)page=d.page;
        else if(d.back)page='';
        else if(d.month){const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-1+Number(d.month),1)).toISOString().slice(0,7);}
        else if(d.day)selected=d.day;
        else if(d.wellnessEdit){openWellness(d.wellnessEdit);return;}
        else if(d.wellnessDelete){ask(d.wellnessDelete.replaceAll('-','/')+' の体調記録（トイレ状況を含む）を削除しますか？\n薬のチェックは残ります。',()=>save({type:'wellness-delete',day:d.wellnessDelete,viewDay:today},()=>{draft=null;}),'体調記録を削除');return;}
        else if(d.edit||d.reminder){openEditor(d.edit||d.reminder,d.edit?'medicine':'reminder');return;}
        else if(d.add){openEditor(null,'medicine');return;}
        else if(d.cancel)draft=null;
        else if(d.themeOption){save({type:'theme',theme:d.themeOption});return;}
        else if(d.check){const m=Core.plans(state,d.date).find(m=>m.id===d.check),slot=Number(d.slot),taken=!m.slots[slot].taken;const action=()=>save({type:'check',id:m.id,slot,day:d.date,viewDay:today,taken});if(!taken||tab==='calendar')ask(d.date.replaceAll('-','/')+' '+m.name+' '+labels[slot]+'\n'+(taken?'実際に飲んだと記録しますか？':'チェックを外しますか？'),action,taken?'飲んだと記録':'チェックを外す');else action();return;}
        else if(d.backup){backup();return;}
        else return;
        render();window.scrollTo({top:0,behavior:'instant'});
      };
      if(draft&&(d.tab||d.cancel))ask('入力中の変更を破棄しますか？',go,'破棄する');else go();
    });
    $('confirm-no').addEventListener('click',()=>{pending=null;$('confirm').close();});$('confirm').addEventListener('cancel',()=>{pending=null;});$('confirm-yes').addEventListener('click',()=>{const action=pending;pending=null;$('confirm').close();if(action)action();});
    document.addEventListener('submit',e=>{
      if(!['editor','wellness-editor'].includes(e.target.id))return;
      e.preventDefault();if(busy||!draft)return;
      if(e.target.id==='wellness-editor'){
        const data=new FormData(e.target),updated={...draft,mood:data.get('mood'),symptoms:data.getAll('symptoms'),note:data.get('note'),bowel:data.get('bowel')||'unrecorded'};
        try{Core.validateWellness(updated);}catch(error){tell(error.message);return;}
        draft=updated;
        save({type:'wellness',day:updated.day,viewDay:today,wellness:updated},()=>{draft=null;});return;
      }
      const form=e.target.elements,updated=clone(draft);
      if(editMode==='medicine'){updated.name=form.namedItem('name').value.trim();updated.note=form.namedItem('note').value;updated.active=form.namedItem('active').checked;updated.slots.forEach((s,i)=>{s.on=form.namedItem('on'+i).checked;s.qty=Number(form.namedItem('qty'+i).value);});}
      else updated.slots.forEach((s,i)=>{if(s.on){s.time=form.namedItem('time'+i).value;s.remind=form.namedItem('remind'+i).checked;}});
      try{Core.validateMedicine(updated);}catch(error){tell(error.message,true);return;}
      draft=updated;save({type:'medicine',id:updated.id,day:today,medicine:updated},()=>{draft=null;});
    });
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!draft&&!busy)reload(true);});
    setInterval(()=>{if(state&&!busy&&!draft&&document.visibilityState==='visible'){if(Core.day(new Date(Date.now()+offset).toISOString())!==today)reload(true);else if(tab==='home')render();}},30000);
    document.addEventListener('change',async e=>{
      if(e.target.id!=='import-file'||busy)return;
      const file=e.target.files?.[0];if(!file)return;
      try{
        if(file.size>10*1024*1024)throw new Error('読み込めるファイルは10MBまでです。');
        const imported=validateBackup(JSON.parse(await file.text()),Core);
        ask('このバックアップで現在の記録を置き換えます。\n現在の記録は「記録をファイルに保存」から先に残しておくことをおすすめします。\n読み込みますか？',()=>save({type:'restore',backup:imported},()=>{selected=today;month=today.slice(0,7);draft=null;}),'読み込む');
      }catch(error){tell('読み込めませんでした。記録は変更していません。 '+error.message,true);}
      e.target.value='';
    });
    if(demo){$('offline').innerHTML='体験モード · 閉じると記録は消えます · <a href="./">通常版へ戻る</a>';}
    else if('serviceWorker' in navigator){
      navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{
        $('offline').textContent='オフライン利用の準備ができました';
        if(matchMedia('(display-mode: standalone)').matches)navigator.storage?.persist?.().catch(()=>{});
      }).catch(()=>{$('offline').textContent='オフライン準備ができませんでした。ネット接続中にご利用ください。';});
    }
    reload();
  
