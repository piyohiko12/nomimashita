import { validateWellness } from './wellness.js';

export function createCore() {
  var names = ['朝', '昼', '晩'];
  var clone = function (v) { return JSON.parse(JSON.stringify(v)); };
  function fail(message) { throw new Error(message); }
  // Fixed Asia/Tokyo day boundary: UTC+9 minus five hours, independent of script TZ.
  function day(iso) { return new Date(new Date(iso).getTime() + 4 * 3600000).toISOString().slice(0, 10); }
  function initial(now) {
    return { version: 2, revision: 0, startedDay: day(now), updatedAt: now,
      settings: { theme: 'simple' }, medicines: [], records: {}, wellness: {} };
  }
  function revision(m, date) {
    return m.revisions.filter(function (r) { return r.day <= date; }).slice(-1)[0] || null;
  }
  function plans(state, date) {
    if (date < state.startedDay) return [];
    var records = state.records[date] || {};
    return state.medicines.map(function (m) {
      var r = revision(m, date), checked = records[m.id] || {};
      if ((!r || !r.active) && !Object.keys(checked).length) return null;
      var slots = names.map(function (_, i) {
        var snapshot = checked[i];
        if (snapshot) return { on: true, qty: snapshot.qty, time: snapshot.time, taken: true };
        var s = r && r.slots[i];
        return s && r.active && s.on ? { on: true, qty: s.qty, time: s.time, taken: false } : { on: false };
      });
      var first = Object.keys(checked)[0];
      return { id: m.id, name: first !== undefined ? checked[first].name : r.name,
        note: r ? r.note : '', slots: slots };
    }).filter(function (m) { return m && m.slots.some(function (s) { return s.on; }); });
  }
  function title(m) {
    var active = m.slots.filter(function (s) { return s.on; });
    if (!active.length) return m.name;
    var same = active.every(function (s) { return s.qty === active[0].qty; });
    return m.name + '（' + (same ? active[0].qty + '錠' : m.slots.map(function (s, i) {
      return s.on ? names[i] + s.qty + '錠' : '';
    }).filter(Boolean).join('・')) + '）';
  }
  function summary(state, date) {
    var all = [], list = plans(state, date);
    list.forEach(function (m) { all = all.concat(m.slots.filter(function (s) { return s.on; })); });
    return !all.length ? 'empty' : all.every(function (s) { return s.taken; }) ? 'complete'
      : all.some(function (s) { return s.taken; }) ? 'partial' : 'missing';
  }
  function validDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var d = new Date(value + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }
  function validateMedicine(value) {
    if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 80) fail('薬名は1〜80文字で入力してください。');
    if (typeof value.note !== 'string' || value.note.length > 300 || typeof value.active !== 'boolean') fail('薬の設定を確認してください。');
    if (!Array.isArray(value.slots) || value.slots.length !== 3) fail('朝・昼・晩の設定が必要です。');
    var slots = value.slots.map(function (s) {
      if (!s || typeof s.on !== 'boolean' || typeof s.remind !== 'boolean' || typeof s.qty !== 'number'
        || !Number.isFinite(s.qty) || s.qty <= 0 || s.qty > 99 || Math.abs(s.qty * 100 - Math.round(s.qty * 100)) > 0.000001
        || typeof s.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) fail('錠数と時刻を確認してください（0.01〜99錠）。');
      return { on: s.on, qty: s.qty, time: s.time, remind: s.remind };
    });
    if (!slots.some(function (s) { return s.on; })) fail('飲む時間帯を1つ以上選んでください。');
    return { name: value.name.trim(), note: value.note, active: value.active, slots: slots };
  }
  function apply(previous, request, now) {
    if (request.revision !== previous.revision) fail('別の画面で記録が更新されています。「再読み込み」で最新の記録を確認してください。');
    var state = clone(previous), today = day(now);
    state.version = 2;
    state.wellness = state.wellness || {};
    if (request.type === 'theme') {
      if (['simple', 'soft', 'character'].indexOf(request.theme) < 0) fail('テーマを選び直してください。');
      state.settings.theme = request.theme;
    } else if (request.type === 'medicine') {
      if (request.day !== today) fail('朝5時を過ぎました。再読み込みしてから保存してください。');
      if (typeof request.id !== 'string' || !/^m_[a-zA-Z0-9-]{8,70}$/.test(request.id)) fail('薬のIDが正しくありません。');
      var validated = validateMedicine(request.medicine), target = state.medicines.find(function (m) { return m.id === request.id; });
      if (!target) {
        if (state.medicines.length >= 100) fail('登録できる薬は100件までです。');
        target = { id: request.id, revisions: [] }; state.medicines.push(target);
      }
      validated.day = today;
      target.revisions = target.revisions.filter(function (r) { return r.day !== today; });
      target.revisions.push(validated);
    } else if (request.type === 'wellness' || request.type === 'wellness-delete') {
      if (request.viewDay !== today) fail('朝5時を過ぎました。再読み込みして日付を確認してください。');
      if (!validDay(request.day) || request.day < state.startedDay || request.day > today) fail('記録できる日付ではありません。');
      if (request.type === 'wellness-delete') delete state.wellness[request.day];
      else state.wellness[request.day] = Object.assign(validateWellness(request.wellness), {updatedAt: now});
    } else if (request.type === 'check') {
      if (request.viewDay !== today) fail('日付が変わりました。再読み込みしてからチェックしてください。');
      if (!validDay(request.day) || request.day < state.startedDay || request.day > today) fail('記録できる日付ではありません。');
      if (typeof request.taken !== 'boolean' || !Number.isInteger(request.slot) || request.slot < 0 || request.slot > 2) fail('チェック内容が正しくありません。');
      var plan = plans(state, request.day).find(function (m) { return m.id === request.id; });
      if (!plan || !plan.slots[request.slot].on) fail('この時間帯には服薬予定がありません。');
      var dateRecords = state.records[request.day] || {}, medRecords = dateRecords[request.id] || {};
      if (request.taken) {
        if (!medRecords[request.slot]) medRecords[request.slot] = {
          name: plan.name, qty: plan.slots[request.slot].qty, time: plan.slots[request.slot].time,
          recordedAt: now, retrospective: request.day !== today
        };
        dateRecords[request.id] = medRecords; state.records[request.day] = dateRecords;
      } else {
        delete medRecords[request.slot];
        if (!Object.keys(medRecords).length) delete dateRecords[request.id];
        if (!Object.keys(dateRecords).length) delete state.records[request.day];
      }
    } else fail('この操作には対応していません。');
    state.revision++; state.updatedAt = now;
    return state;
  }
  return { day: day, initial: initial, revision: revision, plans: plans, title: title,
    summary: summary, apply: apply, validateMedicine: validateMedicine, validateWellness: validateWellness, validDay: validDay };
}
