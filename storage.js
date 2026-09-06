/** Local-only persistence. No network requests or account credentials. */
export function validateBackup(input, core, now = new Date().toISOString()) {
  const data = input && input.app === 'のみました' ? input.state : input;
  const fail = () => { throw new Error('バックアップの内容や形式が正しくありません。記録は変更していません。'); };
  const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const time = v => typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
  const today = core.day(now);
  if (!object(data) || data.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0
    || !core.validDay(data.startedDay) || data.startedDay > today || !time(data.updatedAt)
    || !object(data.settings) || !['simple','soft','character'].includes(data.settings.theme)
    || !Array.isArray(data.medicines) || data.medicines.length > 100 || !object(data.records)) fail();
  const ids = new Set();
  const medicines = data.medicines.map(m => {
    if (!object(m) || typeof m.id !== 'string' || !/^m_[a-zA-Z0-9-]{8,70}$/.test(m.id)
      || ids.has(m.id) || !Array.isArray(m.revisions) || !m.revisions.length || m.revisions.length > 10000) fail();
    ids.add(m.id);
    let previous = '';
    const revisions = m.revisions.map(r => {
      if (!object(r) || !core.validDay(r.day) || r.day < data.startedDay || r.day > today || r.day <= previous) fail();
      previous = r.day;
      return { ...core.validateMedicine(r), day: r.day };
    });
    return { id: m.id, revisions };
  });
  const records = {};
  if (Object.keys(data.records).length > 30000) fail();
  for (const [day, entries] of Object.entries(data.records)) {
    if (!core.validDay(day) || day < data.startedDay || day > today || !object(entries)) fail();
    records[day] = {};
    for (const [id, slots] of Object.entries(entries)) {
      if (!ids.has(id) || !object(slots)) fail();
      records[day][id] = {};
      for (const [slot, r] of Object.entries(slots)) {
        if (!['0','1','2'].includes(slot) || !object(r) || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 80
          || typeof r.qty !== 'number' || !Number.isFinite(r.qty) || r.qty <= 0 || r.qty > 99
          || Math.abs(r.qty * 100 - Math.round(r.qty * 100)) > 0.000001
          || typeof r.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)
          || !time(r.recordedAt) || typeof r.retrospective !== 'boolean') fail();
        const med = medicines.find(m => m.id === id);
        if (day < med.revisions[0].day) fail();
        records[day][id][slot] = {name:r.name,qty:r.qty,time:r.time,recordedAt:r.recordedAt,retrospective:r.retrospective};
      }
    }
  }
  // Whitelist fields instead of trusting arbitrary JSON keys from imported files.
  return {version:1,revision:data.revision,startedDay:data.startedDay,updatedAt:data.updatedAt,
    settings:{theme:data.settings.theme},medicines,records};
}

export class LocalStore {
  constructor(core, {memory = false, dbName = 'nomimashita-v1:' + new URL('.', globalThis.location?.href || 'https://nomimashita.test/').pathname, factory = globalThis.indexedDB, clock = () => new Date().toISOString()} = {}) {
    this.core = core;
    this.memory = memory;
    this.dbName = dbName;
    this.factory = factory;
    this.clock = clock;
    this.dbPromise = null;
    this.value = null;
  }
  open() {
    if (!this.factory) return Promise.reject(new Error('端末の保存機能を利用できません。プライベートブラウズを閉じ、通常のSafariで開いてください。'));
    if (!this.dbPromise) this.dbPromise = new Promise((resolve, reject) => {
      const request = this.factory.open(this.dbName, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('records'); };
      request.onerror = () => reject(new Error('保存領域を開けませんでした。通常のSafariで再度開いてください。'));
      request.onblocked = () => reject(new Error('別のタブを閉じてから、もう一度開いてください。'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); this.dbPromise = null; };
        resolve(db);
      };
    }).catch(e => { this.dbPromise = null; throw e; });
    return this.dbPromise;
  }
  change(current, request, now) {
    if (request.type === 'get') return current;
    if (request.type === 'restore') {
      if (request.revision !== current.revision) throw new Error('別の画面で変更がありました。最新の記録を読み込んでからやり直してください。');
      const imported = validateBackup(request.backup, this.core, now);
      return {...imported,revision:current.revision+1,updatedAt:now};
    }
    return this.core.apply(current, request, now);
  }
  async request(request) {
    const now = this.clock();
    if (this.memory) {
      const current = this.value || this.core.initial(now);
      this.value = this.change(current, request, now);
      return {state:structuredClone(this.value),now,today:this.core.day(now)};
    }
    const db = await this.open();
    // All read-modify-write operations occur in a single serialized IDB transaction.
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite'), storage = tx.objectStore('records');
      const read = storage.get('state');
      let result, failure;
      read.onsuccess = () => {
        try {
          const current = read.result === undefined ? this.core.initial(now) : validateBackup(read.result, this.core, now);
          const updated = this.change(current, request, now);
          result = {state:updated,now,today:this.core.day(now)};
          if (read.result === undefined || request.type !== 'get') storage.put(updated, 'state');
        } catch (e) { failure = e; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => { failure ||= new Error('端末に保存できませんでした。空き容量やブラウザーの設定を確認してください。'); };
      tx.onabort = () => reject(failure || new Error('保存が中断されました。変更は未保存です。'));
    });
  }
}
