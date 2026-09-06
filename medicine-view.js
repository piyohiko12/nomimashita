import { escapeHtml as esc } from './wellness.js';

const labels=['朝','昼','晩'];
const timeIcons=[
  '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  '<path d="M3 17h18M5 21h14M6 13a6 6 0 0 1 12 0M12 2v2M3 6l2 2m14 0 2-2"/>',
  '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"/>'
];
export function largeDate(date) {
  const [year,month,day]=date.split('-').map(Number),weekday=['日','月','火','水','木','金','土'][new Date(Date.UTC(year,month-1,day)).getUTCDay()];
  return '<div class="today-date"><p>今日</p><h1><time datetime="'+esc(date)+'">'+month+'月'+day+'日</time><span>（'+weekday+'）</span></h1></div>';
}
export function verticalMedicines(plans,date) {
  if(!plans.length)return '<div class="vertical-empty"><p>この日の服薬予定はありません。</p><button class="primary" data-add="1">＋ 薬を登録する</button></div>';
  return plans.map(m=>'<section class="vertical-medicine"><h2><span class="medicine-dot" aria-hidden="true"></span>'+esc(m.name)+'<span class="medicine-quantity">'+esc(quantityTitle(m))+'</span></h2><div class="dose-list">'
    +m.slots.map((slot,i)=>{
      const content='<span class="dose-time-icon dose-time-'+i+'" aria-hidden="true"><svg viewBox="0 0 24 24">'+timeIcons[i]+'</svg></span><span class="dose-copy"><strong>'+labels[i]+'</strong><span>'+(slot.on?(slot.taken?'服用済み':'飲んだらチェック'):'予定なし')+'</span>'+(slot.on?'<small>'+slot.qty+'錠 · '+slot.time+'</small>':'')+'</span><span class="round-check" aria-hidden="true">'+(slot.on&&slot.taken?'<svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9"/></svg>':'')+'</span>';
      return slot.on?'<button class="dose-row" data-check="'+esc(m.id)+'" data-date="'+esc(date)+'" data-slot="'+i+'" aria-pressed="'+!!slot.taken+'" aria-label="'+esc(m.name)+' '+labels[i]+' '+(slot.taken?'飲んだ・チェックを外す':'飲んだと記録')+'">'+content+'</button>':'<div class="dose-row dose-inactive" aria-label="'+labels[i]+' 予定なし">'+content+'</div>';
    }).join('')+'</div>'+(m.note?'<p class="note">'+esc(m.note)+'</p>':'')+'</section>').join('');
}
function quantityTitle(m) {
  const active=m.slots.filter(slot=>slot.on);
  if(!active.length)return '';
  return '（'+(active.every(slot=>slot.qty===active[0].qty)?active[0].qty+'錠':m.slots.map((slot,i)=>slot.on?labels[i]+slot.qty+'錠':'').filter(Boolean).join('・'))+'）';
}
