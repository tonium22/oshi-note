// 写真の保存場所（iPhoneの中のデータベース IndexedDB）
// localStorage は5MBくらいしか入らないので、写真だけはこっちに分けて保存する
(function (root) {
  'use strict';

  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const r = indexedDB.open('oshi-note', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('photos');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => { dbp = null; reject(r.error); };
      });
    }
    return dbp;
  }

  async function run(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction('photos', mode);
      const req = fn(t.objectStore('photos'));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error || new Error('写真を保存できませんでした（空き容量を確認してください）'));
    });
  }

  const cache = new Map();

  async function put(id, dataUrl) {
    await run('readwrite', (s) => s.put(dataUrl, id));
    cache.set(id, dataUrl);
  }
  async function get(id) {
    if (cache.has(id)) return cache.get(id);
    const v = await run('readonly', (s) => s.get(id));
    if (v) cache.set(id, v);
    return v;
  }
  async function del(id) {
    cache.delete(id);
    await run('readwrite', (s) => s.delete(id));
  }
  async function keys() {
    return (await run('readonly', (s) => s.getAllKeys())) || [];
  }
  async function all() {
    const out = {};
    for (const k of await keys()) out[k] = await get(k);
    return out;
  }

  // 画面の中の <img data-photo="id"> に写真を入れる
  function hydrate(el) {
    if (!el) return;
    el.querySelectorAll('img[data-photo]:not([src])').forEach(async (img) => {
      try { const v = await get(img.dataset.photo); if (v) img.src = v; } catch (e) { /* 見つからなければ何もしない */ }
    });
  }

  root.Photos = { put, get, del, keys, all, hydrate };
})(self);
