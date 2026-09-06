// Stable IDs are stored; labels and functional face icons are presentation only.
export const MOODS = [
  {id:'great',label:'快調'}, {id:'good',label:'良好'}, {id:'okay',label:'ふつう'},
  {id:'low',label:'不調'}, {id:'bad',label:'つらい'}
];
export const BOWEL_OPTIONS = [
  {id:'yes',label:'でた'}, {id:'no',label:'でていない'}, {id:'unrecorded',label:'未記録'}
];
export function bowelLabel(id) { return BOWEL_OPTIONS.find(option=>option.id===id)?.label || '未記録'; }
export const SYMPTOMS = [
  ['headache','頭痛'], ['fatigue','だるさ'], ['fever','発熱'],
  ['cough','せき'], ['throat','のどの痛み'], ['nose','鼻水'],
  ['dizziness','めまい'], ['nausea','吐き気'], ['stomach','腹痛'],
  ['diarrhea','下痢'], ['constipation','便秘'], ['appetite','食欲不振'],
  ['sleepy','眠気'], ['insomnia','眠れない'], ['other','その他']
].map(([id,label])=>({id,label}));
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateWellness(value) {
  if (!value || !MOODS.some(m=>m.id===value.mood)) throw new Error('体調を5つの顔から選んでください。');
  if (!Array.isArray(value.symptoms) || value.symptoms.length > SYMPTOMS.length
    || value.symptoms.some(id=>!SYMPTOMS.some(s=>s.id===id))
    || new Set(value.symptoms).size!==value.symptoms.length) throw new Error('症状を選び直してください。');
  if (typeof value.note!=='string' || value.note.length>1000) throw new Error('体調メモは1,000文字以内で入力してください。');
  const bowel=value.bowel===undefined?'unrecorded':value.bowel;
  if (!BOWEL_OPTIONS.some(option=>option.id===bowel)) throw new Error('トイレ状況を選び直してください。');
  return {mood:value.mood,symptoms:SYMPTOMS.filter(s=>value.symptoms.includes(s.id)).map(s=>s.id),note:value.note.trim(),bowel};
}
export function moodLabel(id) { return MOODS.find(m=>m.id===id)?.label || '未記録'; }
export function faceIcon(id) {
  if (!MOODS.some(m=>m.id===id)) return '';
  const eyes = id==='great' ? '<path d="M17 27q4-7 8 0m14 0q4-7 8 0"/>'
    : id==='bad' ? '<path d="m18 22 7 7m0-7-7 7m21-7 7 7m0-7-7 7"/>'
    : '<circle cx="22" cy="26" r="2.4" class="eye"/><circle cx="42" cy="26" r="2.4" class="eye"/>';
  const mouth = {great:'M20 36q12 19 24 0',good:'M21 36q11 14 22 0',okay:'M23 39h18',low:'M22 42q10-9 20 0',bad:'M21 42q11-6 22 0'}[id];
  return '<svg class="mood-face" data-mood="'+id+'" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><circle class="face-fill" cx="32" cy="32" r="29"/><g class="face-lines">'+eyes+'<path d="'+mouth+'"/></g>'+(id==='great'||id==='good'?'<g class="cheeks"><ellipse cx="14" cy="35" rx="4" ry="2.5"/><ellipse cx="50" cy="35" rx="4" ry="2.5"/></g>':'')+'</svg>';
}
export function wellnessBanner(record, date) {
  return '<button class="wellness-banner" data-wellness-edit="'+escapeHtml(date)+'">'
    +(record?faceIcon(record.mood):'<span class="wellness-add" aria-hidden="true">＋</span>')
    +'<span class="wellness-banner-copy"><strong>'+(record?'今日の体調 · '+moodLabel(record.mood):'体調の記録をする')
    +'</strong><small>'+(record?'トイレ：'+bowelLabel(record.bowel)+' · 確認・編集':'体調・症状・トイレ状況を残す')+'</small></span><span class="chevron" aria-hidden="true">›</span></button>';
}
export function wellnessDetails(record, date) {
  const heading='<div class="row"><h3>体調の記録</h3><button class="text-button" data-wellness-edit="'+escapeHtml(date)+'">'+(record?'編集する':'記録する')+'</button></div>';
  if (!record) return '<section class="section wellness-detail">'+heading+'<p class="muted">この日の体調は、まだ記録されていません。</p></section>';
  return '<section class="section wellness-detail">'+heading+'<div class="condition-summary">'+faceIcon(record.mood)+'<strong>'+moodLabel(record.mood)+'</strong></div>'
    +(record.symptoms.length?'<ul class="symptom-tags" aria-label="記録した症状">'+record.symptoms.map(id=>'<li>'+escapeHtml(SYMPTOMS.find(s=>s.id===id)?.label)+'</li>').join('')+'</ul>':'<p class="muted">症状の選択なし</p>')
    +'<div class="bowel-summary"><h3>トイレ（排便）</h3><strong>'+bowelLabel(record.bowel)+'</strong></div>'
    +(record.note?'<div class="wellness-note"><h3>体調メモ</h3><p>'+escapeHtml(record.note)+'</p></div>':'')+'</section>';
}
export function wellnessEditor(draft) {
  return '<form id="wellness-editor"><p class="entry-date">'+escapeHtml(draft.day.replaceAll('-','/'))+' の体調</p>'
    +'<fieldset class="section wellness-field"><legend><span class="step-number">01</span>体調はいかがですか？</legend><p class="muted">いちばん近い顔を1つ選んでください。</p><div class="mood-options">'
    +MOODS.map(m=>'<label class="mood-choice"><input type="radio" name="mood" value="'+m.id+'" '+(draft.mood===m.id?'checked ':'')+'required><span class="mood-option-content">'+faceIcon(m.id)+'<strong>'+m.label+'</strong><span class="choice-state" aria-hidden="true">✓</span></span></label>').join('')+'</div></fieldset>'
    +'<fieldset class="section wellness-field"><legend><span class="step-number">02</span>気になる症状<span class="optional">任意</span></legend><p class="muted">あてはまるものをすべて選べます。</p><div class="symptom-options">'
    +SYMPTOMS.map(s=>'<label class="symptom-choice"><input type="checkbox" name="symptoms" value="'+s.id+'" '+(draft.symptoms.includes(s.id)?'checked':'')+'><span><b aria-hidden="true">✓</b>'+s.label+'</span></label>').join('')+'</div></fieldset>'
    +'<fieldset class="section wellness-field"><legend><span class="step-number">03</span>トイレ状況（排便）<span class="optional">任意</span></legend><p class="muted">この日の排便はありましたか？</p><div class="bowel-options">'
    +BOWEL_OPTIONS.map(option=>'<label class="bowel-choice"><input type="radio" name="bowel" value="'+option.id+'" '+((draft.bowel||'unrecorded')===option.id?'checked':'')+'><span>'+option.label+'</span></label>').join('')+'</div></fieldset>'
    +'<section class="section wellness-field"><label class="memo-label" for="wellness-note"><span class="step-number">04</span>具体的な症状・メモ<span class="optional">任意</span></label><textarea id="wellness-note" name="note" maxlength="1000" rows="4" placeholder="どこが、いつから、どのようにつらいかなど">'+escapeHtml(draft.note)+'</textarea><p class="muted memo-hint">書かずに保存しても大丈夫です。1,000文字まで。</p></section>'
    +'<div class="row savebar"><button type="button" data-cancel="1">キャンセル</button><button class="primary" type="submit">体調を保存する</button></div>'
    +(draft.existing?'<button type="button" class="delete-wellness" data-wellness-delete="'+escapeHtml(draft.day)+'">この日の体調記録を削除</button>':'')+'</form>';
}
