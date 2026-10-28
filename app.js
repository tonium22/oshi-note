// 推し活ノート 画面まわり
// データはこのiPhoneの中（localStorage）だけに保存。サーバーには何も送らない。
(function () {
  'use strict';
  const C = self.Calc;
  const KEY = 'oshi-note-v1';
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const today = () => C.ymd(new Date());
  const monthName = (key) => { const [y, m] = key.split('-'); return y + '年' + Number(m) + '月'; };
  // 写真を画面に入れる（古いindex.htmlが残っていてphotos.jsが無い時でも止まらないように）
  const hydrate = (el) => { if (self.Photos) self.Photos.hydrate(el); };
  const tagText = (tags) => (tags || []).map((t) => '#' + t).join(' ');

  // ---------- 見た目（色・明るさ・背景画像） ----------
  // [id, 名前, 見本の色]
  const THEMES = [
    ['purple', '紫', '#6a4bc4'], ['pink', 'ピンク', '#d6336c'], ['red', '赤', '#d62839'], ['orange', 'オレンジ', '#e8590c'],
    ['yellow', '黄', '#f5c400'], ['green', '緑', '#2b9348'], ['sky', '水色', '#1c9fd6'], ['blue', '青', '#2f5bd3'],
  ];
  const MODES = [['light', '明るい'], ['dark', '暗い'], ['auto', '自動']];
  const LOOK_KEY = 'oshi-note-look';
  const BG_KEY = 'oshi-note-bg';
  function getLook() {
    const h = document.documentElement.dataset;
    return { theme: h.theme || 'purple', mode: h.mode || 'light' };
  }
  function setLook(patch) {
    const look = Object.assign(getLook(), patch);
    document.documentElement.dataset.theme = look.theme;
    document.documentElement.dataset.mode = look.mode;
    const t = THEMES.find((x) => x[0] === look.theme);
    $('meta[name=theme-color]').content = t ? t[2] : '#6a4bc4';
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch (e) { /* 保存できなくても今回は反映 */ }
  }

  // 背景画像は容量が大きいので、データとは別に保存する
  function getBg() {
    try { return JSON.parse(localStorage.getItem(BG_KEY)) || {}; } catch (e) { return {}; }
  }
  function applyBg() {
    const bg = getBg();
    const el = $('#bg');
    document.documentElement.classList.toggle('has-bg', !!bg.img);
    el.style.backgroundImage = bg.img ? `url("${bg.img}")` : '';
    // strength = 画像の見えやすさ（%）。上にかぶせる色の濃さはその逆
    document.documentElement.style.setProperty('--veil', String(1 - (bg.strength == null ? 55 : bg.strength) / 100));
  }
  function saveBg(bg) {
    try { localStorage.setItem(BG_KEY, JSON.stringify(bg)); return true; }
    catch (e) { toast('画像が大きすぎて保存できませんでした'); return false; }
  }

  // ---------- データ ----------
  const defaults = () => ({ events: [], expenses: [], oshis: [], budget: 0, lastOshi: '' });
  let state = load();
  let eventsTab = 'cal';
  let calMonth = C.monthKey(today());
  let selDay = today();
  let pendingShot = null; // 読み取りに使ったスクショ（登録時に写真として付ける）
  let moneyMonth = C.monthKey(today());
  let searchQ = '';

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (C.validBackup(s)) return migrate(Object.assign(defaults(), s));
    } catch (e) { /* 壊れていたら空で始める */ }
    return defaults();
  }
  function migrate(s) {
    s.oshis = C.normalizeOshis(s.oshis);
    return s;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('保存できませんでした（空き容量を確認してください）'); }
  }
  const findOshi = (name) => state.oshis.find((o) => o.name === name);
  function rememberOshi(name) {
    name = (name || '').trim();
    if (!name) return;
    state.lastOshi = name;
    if (!findOshi(name)) state.oshis.push({ name, tags: [name] });
  }
  // 読み取ったハッシュタグから、どの推しの投稿か当てる
  function guessOshi(tags) {
    const low = (tags || []).map((t) => t.toLowerCase());
    const o = state.oshis.find((x) => [x.name].concat(x.tags).some((t) => low.includes(t.toLowerCase())));
    return o ? o.name : '';
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ---------- 部品 ----------
  function budgetCard(s, label) {
    let body = '';
    if (s.budget) {
      const pct = Math.min(100, Math.round(s.ratio * 100));
      const cls = s.ratio > 1 ? 'over' : s.ratio >= 0.8 ? 'warn' : '';
      body = `<div class="bar ${cls}"><i style="width:${pct}%"></i></div>
        <div class="row between muted"><span>予算 ${C.yen(s.budget)}</span>
        ${s.remain >= 0 ? `<span>残り <b class="ok-text">${C.yen(s.remain)}</b></span>` : `<span><b class="over-text">${C.yen(-s.remain)} オーバー</b></span>`}</div>`;
    } else {
      body = `<p class="muted" style="margin:6px 0 10px">月の予算を決めると、使いすぎた時に色でお知らせします</p>
        <button class="btn sub" data-act="go-settings">月の予算を決める</button>`;
    }
    return `<div class="card"><h2>${label}の推し活</h2><div class="big">${C.yen(s.total)}</div>
      <div class="muted">${s.count}件</div>${body}</div>`;
  }

  function neededCard(now) {
    const n = C.neededMoney(state.events, now);
    if (!n.items.length) return '';
    return `<div class="card"><h2>これから必要なお金</h2>
      <div class="big">${C.yen(n.total)}</div>
      ${n.overdue ? `<div class="over-text" style="font-size:14px">うち期限切れ ${C.yen(n.overdue)}</div>` : ''}
      <ul class="list" style="margin-top:6px">${n.byMonth.map((m) => `<li class="item" style="cursor:default">
        <div class="main"><div class="ttl">${Number(m.key.slice(5))}月末までに</div><div class="muted">${Number(m.key.slice(5))}月分 ${C.yen(m.sum)}</div></div>
        <div class="amt">${C.yen(m.cum)}</div></li>`).join('')}</ul>
      <p class="muted" style="margin:4px 0 0">金額を入れた、未完了の予定の合計です</p></div>`;
  }

  function eventRow(ev, now) {
    const t = C.typeInfo(ev.type);
    const u = C.urgency(ev, now);
    return `<li class="item ${ev.done ? 'done' : ''}" data-act="event" data-id="${ev.id}">
      ${(ev.photos || []).length ? `<img class="thumb" data-photo="${ev.photos[0]}" alt="">` : `<div class="emoji">${t[2]}</div>`}
      <div class="main"><div class="ttl">${esc(ev.title || t[1])}</div>
        <div class="muted">${t[1]}・${C.dateLabel(ev)}${ev.oshi ? '・' + esc(ev.oshi) : ''}</div>
        ${ev.shop ? `<div class="muted">📍${esc(ev.shop)}</div>` : ''}</div>
      <div style="text-align:right"><span class="badge ${u}">${C.untilLabel(ev, now)}</span>
        ${ev.amount ? `<div class="muted">${C.yen(ev.amount)}</div>` : ''}</div>
    </li>`;
  }

  function expenseRow(e) {
    const d = C.parseDate(e.date);
    return `<li class="item" data-act="expense" data-id="${e.id}">
      <div class="emoji" style="font-size:13px;color:var(--sub)">${d ? (d.getMonth() + 1) + '/' + d.getDate() : ''}</div>
      <div class="main"><div class="ttl">${esc(e.memo || C.catName(e.cat))}</div>
        <div class="muted">${C.catName(e.cat)}${e.oshi ? '・' + esc(e.oshi) : ''}</div></div>
      <div class="amt">${C.yen(e.amount)}</div>
    </li>`;
  }

  // ---------- 画面 ----------
  const VIEWS = {
    home: {
      title: '推し活ノート',
      html() {
        const now = new Date();
        const s = C.monthSummary(state.expenses, C.monthKey(today()), state.budget);
        const open = C.sortEvents(state.events.filter((e) => !e.done));
        const urgent = open.filter((e) => ['over', 'today'].includes(C.urgency(e, now))).length;
        return `
          ${urgent ? `<div class="card" style="background:var(--over-soft)"><b class="over-text">⚠️ 今日まで・期限切れの予定が ${urgent}件 あります</b></div>` : ''}
          <div class="btn-pair">
            <button class="btn" data-act="new-event">＋ 期限を登録</button>
            <button class="btn pink" data-act="new-expense">＋ 出費を記録</button>
          </div>
          <button class="btn sub" data-act="import" style="margin-bottom:12px">📷 スクショ・投稿から読み取る</button>
          <div class="card"><h2>次の期限</h2>
            ${open.length ? `<ul class="list">${open.slice(0, 5).map((e) => eventRow(e, now)).join('')}</ul>
              ${open.length > 5 ? `<a class="muted" href="#/events">ほか${open.length - 5}件を見る ›</a>` : ''}`
              : '<div class="empty">まだ期限がありません。<br>チケットの入金期限や抽選の締切を登録してみましょう</div>'}
          </div>
          ${neededCard(now)}
          ${budgetCard(s, '今月')}`;
      },
    },

    events: {
      title: '期限',
      html() {
        const now = new Date();
        const open = C.sortEvents(state.events.filter((e) => !e.done));
        const done = C.sortEvents(state.events.filter((e) => e.done)).reverse();
        const list = eventsTab === 'open' ? open : done;
        const seg = `<div class="seg">
            <button data-act="events-tab" data-tab="cal" class="${eventsTab === 'cal' ? 'on' : ''}">カレンダー</button>
            <button data-act="events-tab" data-tab="open" class="${eventsTab === 'open' ? 'on' : ''}">これから ${open.length}</button>
            <button data-act="events-tab" data-tab="done" class="${eventsTab === 'done' ? 'on' : ''}">完了 ${done.length}</button>
          </div>`;
        if (eventsTab === 'cal') return seg + calendarHtml(now);
        return `${seg}
          <div class="btn-pair">
            <button class="btn" data-act="new-event">＋ 期限を登録</button>
            <button class="btn sub" data-act="import">📷 読み取る</button>
          </div>
          <div class="card">${list.length ? `<ul class="list">${list.map((e) => eventRow(e, now)).join('')}</ul>`
            : `<div class="empty">${eventsTab === 'open' ? 'これからの予定はありません' : '完了した予定はまだありません'}</div>`}</div>`;
      },
    },

    search: {
      title: '検索',
      html() {
        return `
          <div class="search-box"><input id="q" type="search" value="${esc(searchQ)}" placeholder="例：#ちいかわ、ナルト、一番くじ" autocomplete="off"></div>
          ${state.oshis.length ? `<div class="chips" style="margin-bottom:12px">${state.oshis.map((o) => `<button data-act="search-tag" data-v="${esc(o.tags[0] || o.name)}" class="${searchQ && C.matchRecord({ oshi: o.name }, searchQ, [o]) ? 'on' : ''}">#${esc(o.tags[0] || o.name)}</button>`).join('')}</div>` : ''}
          <div id="search-results">${searchResults()}</div>`;
      },
    },

    money: {
      title: 'お金',
      html() {
        const s = C.monthSummary(state.expenses, moneyMonth, state.budget);
        const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
        const oshis = Object.entries(s.byOshi).sort((a, b) => b[1] - a[1]);
        const bars = (rows, name) => rows.map(([k, v]) => `<div class="cat-row">
            <div class="row between"><span>${esc(name(k))}</span><b>${C.yen(v)}</b></div>
            <div class="bar"><i style="width:${s.total ? Math.round(v / s.total * 100) : 0}%"></i></div></div>`).join('');
        const list = s.list.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        return `
          <div class="month-nav">
            <button data-act="month" data-d="-1" aria-label="前の月">‹</button>
            <b>${monthName(moneyMonth)}</b>
            <button data-act="month" data-d="1" aria-label="次の月">›</button>
          </div>
          ${budgetCard(s, monthName(moneyMonth))}
          <button class="btn pink" data-act="new-expense" style="margin-bottom:12px">＋ 出費を記録</button>
          ${neededCard(new Date())}
          ${cats.length ? `<div class="card"><h2>何に使った？</h2>${bars(cats, C.catName)}</div>` : ''}
          ${oshis.length > 1 ? `<div class="card"><h2>推しごと</h2>${bars(oshis, (k) => k)}</div>` : ''}
          <div class="card"><h2>記録</h2>${list.length ? `<ul class="list">${list.map(expenseRow).join('')}</ul>` : '<div class="empty">この月の記録はまだありません</div>'}</div>`;
      },
    },

    settings: {
      title: '設定',
      html() {
        const look = getLook();
        const bg = getBg();
        return `
          <div class="card"><h2>画面の色</h2>
            <p class="muted" style="margin:0 0 10px">推しのメンバーカラーにもできます</p>
            <div class="swatches">${THEMES.map((t) => `<button data-act="theme" data-v="${t[0]}" class="${look.theme === t[0] ? 'on' : ''}"><i style="background:${t[2]}"></i>${t[1]}</button>`).join('')}</div>
            <div class="seg" style="margin:0">${MODES.map((m) => `<button data-act="mode" data-v="${m[0]}" class="${look.mode === m[0] ? 'on' : ''}">${m[1]}</button>`).join('')}</div>
            <p class="muted" style="margin:6px 0 0">「自動」はiPhoneのダークモード設定に合わせます</p>
          </div>
          <div class="card"><h2>背景の画像</h2>
            ${bg.img ? `<div class="bg-thumb" style="background-image:url('${bg.img}')"></div>
              <label class="f"><span>画像の見えやすさ：<b id="bg-val">${bg.strength == null ? 55 : bg.strength}%</b></span>
                <input id="bg-strength" type="range" min="10" max="90" step="5" value="${bg.strength == null ? 55 : bg.strength}" style="padding:0;border:0;background:none"></label>
              <button class="btn sub" data-act="bg-pick">画像を変える</button>
              <button class="btn danger" data-act="bg-clear">画像を外す</button>`
            : `<p class="muted" style="margin:0 0 10px">写真アプリの好きな画像を背景にできます。画像はこのiPhoneの中だけに保存されます</p>
              <button class="btn sub" data-act="bg-pick">画像を選ぶ</button>`}
            <input id="bg-file" type="file" accept="image/*" hidden>
          </div>
          <div class="card"><h2>推しとハッシュタグ</h2>
            <p class="muted" style="margin:0 0 8px">タグを付けておくと、検索や読み取りの時に自動でその推しの記録になります</p>
            ${state.oshis.length ? `<ul class="list">${state.oshis.map((o, i) => `<li class="item" data-act="oshi" data-i="${i}">
              <div class="main"><div class="ttl">${esc(o.name)}</div><div class="muted">${esc(tagText(o.tags)) || 'タグなし'}</div></div><span class="muted">›</span></li>`).join('')}</ul>`
              : '<div class="empty">まだ登録されていません</div>'}
            <button class="btn sub" data-act="oshi" data-i="-1" style="margin-top:8px">＋ 推しを追加</button>
          </div>
          <div class="card"><h2>月の予算</h2>
            <label class="f"><span>1か月に推し活で使ってよい金額（0で予算なし）</span>
              <input id="budget" class="yen" inputmode="numeric" value="${state.budget || ''}" placeholder="例：30000"></label>
            <button class="btn" data-act="save-budget">予算を保存</button>
          </div>
          <div class="card"><h2>バックアップ</h2>
            <p class="help">データと写真は<b>このiPhoneの中だけ</b>に保存しています。Safariの履歴やWebサイトデータを消すと<b>すべて消えてしまう</b>ので、ときどきバックアップしてください。</p>
            <button class="btn sub" data-act="export">バックアップを保存（ファイル）</button>
            <button class="btn sub" data-act="import-backup">バックアップから戻す</button>
            <input id="import-file" type="file" accept="application/json,.json" hidden>
          </div>
          <div class="card"><h2>このアプリについて</h2>
            <p class="help">
              ・無料です。アカウント登録は不要で、データを外に送ることはありません<br>
              ・「カレンダーにアラームを入れる」を押すと、iPhoneのカレンダーに予定が入ります（時刻ありは<b>前日</b>と<b>3時間前</b>、時刻なしは<b>前日9時</b>と<b>当日9時</b>に通知）<br>
              ・通知はiPhoneのカレンダーが出すので、このアプリを開いていなくても届きます<br>
              ・スクショの読み取りもiPhoneの中で行います。画像はどこにも送りません
            </p>
          </div>`;
      },
    },
  };

  // 月のカレンダー。日にちをタップすると、その日の予定（写真つき）が下に出る
  function calendarHtml(now) {
    const [y, m] = calMonth.split('-').map(Number);
    const startW = new Date(y, m - 1, 1).getDay();
    const days = new Date(y, m, 0).getDate();
    const byDay = {};
    for (const e of state.events) if (C.monthKey(e.date) === calMonth) (byDay[e.date] = byDay[e.date] || []).push(e);
    const todayKey = today();
    let cells = '';
    for (let i = 0; i < startW; i++) cells += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const key = calMonth + '-' + String(d).padStart(2, '0');
      const evs = C.sortEvents(byDay[key] || []);
      const withPhoto = evs.find((e) => (e.photos || []).length);
      const w = (startW + d - 1) % 7;
      cells += `<button class="day ${key === todayKey ? 'today' : ''} ${key === selDay ? 'sel' : ''} ${w === 0 ? 'sun' : w === 6 ? 'sat' : ''}" data-act="day" data-v="${key}">
        ${withPhoto ? `<img data-photo="${withPhoto.photos[0]}" alt="">` : ''}
        <span class="n">${d}</span>
        <span class="dots">${evs.slice(0, 4).map((e) => `<i class="dot ${C.urgency(e, now)}"></i>`).join('')}</span></button>`;
    }
    const sel = C.sortEvents(state.events.filter((e) => e.date === selDay));
    const selLabel = C.dateLabel({ date: selDay });
    return `
      <div class="month-nav">
        <button data-act="cal-month" data-d="-1" aria-label="前の月">‹</button>
        <b>${monthName(calMonth)}</b>
        <button data-act="cal-month" data-d="1" aria-label="次の月">›</button>
      </div>
      <div class="card" style="padding:10px">
        <div class="cal-head">${['日', '月', '火', '水', '木', '金', '土'].map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="cal">${cells}</div>
      </div>
      <div class="card"><h2>${selLabel}の予定</h2>
        ${sel.length ? `<ul class="list">${sel.map((e) => eventRow(e, now)).join('')}</ul>` : '<div class="empty" style="padding:10px 0">予定はありません</div>'}
        <button class="btn sub" data-act="new-event" data-date="${selDay}" style="margin-top:8px">＋ この日に登録</button>
      </div>`;
  }

  function searchResults() {
    const now = new Date();
    if (!searchQ.trim()) {
      return '<div class="empty">推しの名前やハッシュタグで、<br>登録した予定や出費をまとめて見られます</div>';
    }
    const r = C.searchAll(state, searchQ, now);
    if (!r.upcoming.length && !r.past.length && !r.expenses.length) return '<div class="empty">見つかりませんでした</div>';
    const nr = r.nextRelease;
    return `
      ${nr ? `<div class="card hl"><h2>次の発売・販売</h2>
        <div class="ttl" style="font-size:18px;font-weight:800">${esc(nr.title || '発売')}</div>
        <div>${C.dateLabel(nr)}　<span class="badge ${C.urgency(nr, now)}">${C.untilLabel(nr, now)}</span></div>
        ${nr.shop ? `<div class="muted">📍${esc(nr.shop)}</div>` : ''}${nr.amount ? `<div class="muted">${C.yen(nr.amount)}</div>` : ''}</div>` : ''}
      <div class="card"><h2>これからの予定 ${r.upcoming.length}件</h2>
        ${r.upcoming.length ? `<ul class="list">${r.upcoming.map((e) => eventRow(e, now)).join('')}</ul>` : '<div class="empty">ありません</div>'}</div>
      ${r.past.length ? `<div class="card"><h2>過去の予定 ${r.past.length}件</h2><ul class="list">${r.past.map((e) => eventRow(e, now)).join('')}</ul></div>` : ''}
      ${r.expenses.length ? `<div class="card"><h2>使ったお金 ${C.yen(r.expenseTotal)}</h2><ul class="list">${r.expenses.map(expenseRow).join('')}</ul></div>` : ''}`;
  }

  function render() {
    const name = location.hash.replace(/^#\/?/, '').split('/')[0] || 'home';
    const key = VIEWS[name] ? name : 'home';
    document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === key));
    $('#title').textContent = VIEWS[key].title;
    $('#view').innerHTML = VIEWS[key].html();
    hydrate($('#view'));
  }

  // ---------- 下から出る入力画面 ----------
  function openSheet(title, html, onAct) {
    const sh = $('#sheet');
    sh.innerHTML = `<div class="panel" role="dialog" aria-label="${esc(title)}">
      <div class="panel-head"><h3>${esc(title)}</h3><button class="x" data-close aria-label="閉じる">✕</button></div>${html}</div>`;
    sh.hidden = false;
    hydrate(sh);
    sh.onclick = (e) => {
      if (e.target === sh || e.target.closest('[data-close]')) return closeSheet();
      const el = e.target.closest('[data-sact]');
      if (el && onAct) onAct(el.dataset.sact, el, sh);
    };
  }
  function closeSheet() {
    const sh = $('#sheet');
    sh.hidden = true;
    sh.innerHTML = '';
    sh.onclick = null;
  }

  const oshiList = () => `<datalist id="oshi-list">${state.oshis.map((o) => `<option value="${esc(o.name)}">`).join('')}</datalist>`;
  const chipsHtml = (items, cur, key) => `<div class="chips">${items.map((it) => `<button type="button" data-sact="${key}" data-v="${it[0]}" class="${it[0] === cur ? 'on' : ''}">${it[2] ? it[2] + ' ' : ''}${it[1]}</button>`).join('')}</div>`;
  const pickChip = (el) => { el.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el)); return el.dataset.v; };

  // 期限の登録・編集
  function eventForm(ev, preset) {
    const isNew = !ev;
    const d = Object.assign({ type: 'pay', title: '', oshi: state.lastOshi, date: today(), time: '', amount: '', memo: '', shop: '', tags: [] }, preset, ev);
    openSheet(isNew ? '期限を登録' : '期限を編集', `
      <label class="f"><span>種類</span>${chipsHtml(C.EVENT_TYPES, d.type, 'type')}</label>
      <label class="f"><span>何の予定ですか？</span><input id="ev-title" value="${esc(d.title)}" placeholder="例：〇〇ドームツアー 大阪 1日目"></label>
      <label class="f"><span>推し</span><input id="ev-oshi" list="oshi-list" value="${esc(d.oshi)}" placeholder="例：推しの名前">${oshiList()}</label>
      <div class="two">
        <label class="f"><span>日付</span><input id="ev-date" type="date" value="${esc(d.date)}"></label>
        <label class="f"><span>時刻（任意）</span><input id="ev-time" type="time" value="${esc(d.time)}"></label>
      </div>
      <label class="f"><span>金額（任意）</span><input id="ev-amount" inputmode="numeric" value="${d.amount || ''}" placeholder="例：12000"></label>
      <label class="f"><span>販売場所・会場（任意）</span><input id="ev-shop" value="${esc(d.shop)}" placeholder="例：アニメイト、公式通販"></label>
      <label class="f"><span>タグ（任意）</span><input id="ev-tags" value="${esc(tagText(d.tags))}" placeholder="例：#ちいかわ #ポップアップ"></label>
      <label class="f"><span>メモ</span><textarea id="ev-memo" placeholder="例：FC先行・2枚・コンビニ払い">${esc(d.memo)}</textarea></label>
      <button class="btn" data-sact="save">保存する</button>
      ${isNew ? '' : '<button class="btn danger" data-sact="delete">削除する</button>'}`,
    (act, el, sh) => {
      if (act === 'type') d.type = pickChip(el);
      if (act === 'save') {
        const date = $('#ev-date', sh).value;
        if (!date) return toast('日付を入力してください');
        const amtText = $('#ev-amount', sh).value.trim();
        const amount = amtText ? C.parseYen(amtText) : 0;
        if (amount == null) return toast('金額は数字で入力してください');
        const data = {
          type: d.type, title: $('#ev-title', sh).value.trim(), oshi: $('#ev-oshi', sh).value.trim(), date, time: $('#ev-time', sh).value,
          amount, shop: $('#ev-shop', sh).value.trim(), tags: C.parseTags($('#ev-tags', sh).value), memo: $('#ev-memo', sh).value.trim(),
        };
        let target = ev;
        if (isNew) { target = Object.assign({ id: uid(), done: false, created: Date.now(), source: d.source || '' }, data); state.events.push(target); }
        else Object.assign(ev, data);
        rememberOshi(data.oshi);
        save();
        render();
        eventDetail(target);
        toast(isNew ? '登録しました。カレンダーにも入れておきましょう' : '保存しました');
      }
      if (act === 'delete' && confirm('この予定を削除しますか？')) {
        state.events = state.events.filter((x) => x.id !== ev.id);
        save(); closeSheet(); render(); cleanupPhotos(); toast('削除しました');
      }
    });
  }

  // 期限の詳細（ここから完了・カレンダー追加）
  function eventDetail(ev) {
    const now = new Date();
    const t = C.typeInfo(ev.type);
    const u = C.urgency(ev, now);
    let doneBtns = '';
    if (ev.done) doneBtns = '<button class="btn sub" data-sact="undone">未完了に戻す</button>';
    else if (ev.type === 'pay') doneBtns = '<button class="btn pink" data-sact="paid">入金しました（出費にも記録）</button>';
    else if (ev.type === 'result') doneBtns = '<button class="btn pink" data-sact="won">当選しました → 入金期限を登録</button><button class="btn sub" data-sact="done">落選・確認済み</button>';
    else if (ev.type === 'release') doneBtns = '<button class="btn pink" data-sact="bought">買いました（出費にも記録）</button><button class="btn sub" data-sact="done">完了にする</button>';
    else doneBtns = '<button class="btn pink" data-sact="done">完了にする</button>';
    openSheet(t[1], `
      <div class="detail-top"><div class="emoji">${t[2]}</div>
        <div class="ttl">${esc(ev.title || t[1])}</div>
        <div class="muted">${C.dateLabel(ev)}${ev.time ? '' : '（時刻なし）'}${ev.oshi ? '・' + esc(ev.oshi) : ''}</div>
        <div style="margin-top:6px"><span class="badge ${u}">${C.untilLabel(ev, now)}</span></div>
        ${ev.amount ? `<div class="big" style="margin-top:8px">${C.yen(ev.amount)}</div>` : ''}
        ${ev.shop ? `<div style="margin-top:6px">📍${esc(ev.shop)}</div>` : ''}
        ${(ev.tags || []).length ? `<div class="chips" style="justify-content:center;margin-top:8px">${ev.tags.map((g) => `<button data-sact="tag" data-v="${esc(g)}">#${esc(g)}</button>`).join('')}</div>` : ''}
        ${ev.memo ? `<p class="help" style="white-space:pre-wrap">${esc(ev.memo)}</p>` : ''}
      </div>
      <div class="photos">${(ev.photos || []).map((id) => `<img data-photo="${id}" data-sact="photo" data-v="${id}" alt="写真">`).join('')}
        <button class="add-photo" data-sact="add-photo">📷<br>写真を追加</button></div>
      <input id="ev-photo" type="file" accept="image/*" multiple hidden>
      ${ev.done ? '' : `<button class="btn" data-sact="cal">📅 iPhoneのカレンダーにアラームを入れる</button>
        ${ev.calAdded ? '<p class="muted" style="text-align:center;margin:4px 0 0">カレンダーに送信済みです（2回入れると重複します）</p>' : ''}`}
      <div style="height:8px"></div>
      ${doneBtns}
      <button class="btn sub" data-sact="edit">編集する</button>
      ${ev.source ? `<details class="src"><summary>読み取った元の文章</summary><pre>${esc(ev.source)}</pre></details>` : ''}`,
    (act, el) => {
      if (act === 'cal') { addToCalendar([ev]); ev.calAdded = true; save(); }
      if (act === 'add-photo') $('#ev-photo').click();
      if (act === 'photo') photoViewer(el.dataset.v, ev);
      if (act === 'edit') eventForm(ev);
      if (act === 'tag') { closeSheet(); searchQ = '#' + el.dataset.v; location.hash = '#/search'; render(); }
      if (act === 'undone') { ev.done = false; save(); render(); eventDetail(ev); }
      if (act === 'done') { ev.done = true; save(); render(); closeSheet(); toast('完了にしました'); }
      if (act === 'won') {
        ev.done = true; save(); render();
        eventForm(null, { type: 'pay', title: ev.title, oshi: ev.oshi, amount: ev.amount, memo: ev.memo, tags: ev.tags, shop: ev.shop });
        toast('おめでとうございます！入金期限の日付を入力してください');
      }
      if (act === 'paid' || act === 'bought') {
        const cat = act === 'paid' ? 'ticket' : 'goods';
        ev.done = true;
        if (!ev.amount) {
          save(); render();
          expenseForm(null, { cat, oshi: ev.oshi, memo: ev.title, fromEvent: ev.id, tags: ev.tags });
          return toast('金額を入力して記録してください');
        }
        state.expenses.push({ id: uid(), date: today(), amount: ev.amount, cat, oshi: ev.oshi, memo: ev.title, tags: ev.tags || [], fromEvent: ev.id });
        save(); render(); closeSheet();
        toast('完了にして、出費に ' + C.yen(ev.amount) + ' を記録しました');
      }
    });
    $('#ev-photo').onchange = async (e) => {
      const files = [...e.target.files];
      if (!files.length) return;
      toast('写真を保存しています…');
      try {
        for (const f of files) ev.photos = (ev.photos || []).concat(await savePhoto(f));
        save(); render(); eventDetail(ev); toast('写真を追加しました');
      } catch (err) { toast(err.message || '写真を保存できませんでした'); }
    };
  }

  // 写真は長い辺1200pxのJPEGに縮めて保存（1枚あたり200KB前後）
  async function savePhoto(file) {
    const data = await self.OCR.shrink(file, 1200, 0.8);
    const id = 'p' + uid();
    await self.Photos.put(id, data);
    return id;
  }

  // どの予定からも使われていない写真を消す
  async function cleanupPhotos() {
    const used = new Set();
    for (const e of state.events) for (const id of e.photos || []) used.add(id);
    try { for (const id of await self.Photos.keys()) if (!used.has(id)) await self.Photos.del(id); } catch (e) { /* 次の機会に */ }
  }

  function photoViewer(id, ev) {
    openSheet('写真', `
      <img class="viewer" data-photo="${id}" alt="写真">
      <button class="btn sub" data-sact="back">戻る</button>
      <button class="btn danger" data-sact="delete">この写真を削除</button>`,
    async (act) => {
      if (act === 'back') eventDetail(ev);
      if (act === 'delete' && confirm('この写真を削除しますか？')) {
        ev.photos = (ev.photos || []).filter((x) => x !== id);
        save(); await cleanupPhotos(); render(); eventDetail(ev); toast('写真を削除しました');
      }
    });
  }

  // 出費の記録・編集
  function expenseForm(ex, preset) {
    const isNew = !ex;
    const d = Object.assign({ amount: '', cat: 'goods', oshi: state.lastOshi, date: today(), memo: '', tags: [] }, preset, ex);
    openSheet(isNew ? '出費を記録' : '出費を編集', `
      <label class="f"><span>金額</span><input id="ex-amount" class="yen" inputmode="numeric" value="${d.amount || ''}" placeholder="¥0"></label>
      <label class="f"><span>何に使いましたか？</span>${chipsHtml(C.CATS, d.cat, 'cat')}</label>
      <label class="f"><span>推し</span><input id="ex-oshi" list="oshi-list" value="${esc(d.oshi)}" placeholder="例：推しの名前">${oshiList()}</label>
      <label class="f"><span>日付</span><input id="ex-date" type="date" value="${esc(d.date)}"></label>
      <label class="f"><span>メモ（任意）</span><input id="ex-memo" value="${esc(d.memo)}" placeholder="例：アクスタ・ランダム缶バッジ3個"></label>
      <button class="btn pink" data-sact="save">記録する</button>
      ${isNew ? '' : '<button class="btn danger" data-sact="delete">削除する</button>'}`,
    (act, el, sh) => {
      if (act === 'cat') d.cat = pickChip(el);
      if (act === 'save') {
        const amount = C.parseYen($('#ex-amount', sh).value);
        if (!amount) return toast('金額を数字で入力してください');
        const date = $('#ex-date', sh).value || today();
        const data = { amount, cat: d.cat, oshi: $('#ex-oshi', sh).value.trim(), date, memo: $('#ex-memo', sh).value.trim() };
        if (isNew) state.expenses.push(Object.assign({ id: uid(), fromEvent: d.fromEvent, tags: d.tags || [] }, data));
        else Object.assign(ex, data);
        rememberOshi(data.oshi);
        save(); closeSheet(); render();
        const s = C.monthSummary(state.expenses, C.monthKey(date), state.budget);
        toast(s.budget && s.remain < 0 ? '記録しました（今月は予算を ' + C.yen(-s.remain) + ' オーバー）' : '記録しました');
      }
      if (act === 'delete' && confirm('この記録を削除しますか？')) {
        state.expenses = state.expenses.filter((x) => x.id !== ex.id);
        save(); closeSheet(); render(); toast('削除しました');
      }
    });
  }

  // 推しの名前とハッシュタグ
  function oshiForm(i) {
    const isNew = i < 0;
    const o = isNew ? { name: '', tags: [] } : state.oshis[i];
    openSheet(isNew ? '推しを追加' : '推しを編集', `
      <label class="f"><span>名前</span><input id="o-name" value="${esc(o.name)}" placeholder="例：ナルト"></label>
      <label class="f"><span>ハッシュタグ（スペース区切りで何個でも）</span><input id="o-tags" value="${esc(tagText(o.tags))}" placeholder="例：#ナルト #NARUTO #うずまきナルト"></label>
      <p class="muted" style="margin:-4px 0 12px">読み取った投稿にこのタグがあると、自動でこの推しの予定になります</p>
      <button class="btn" data-sact="save">保存する</button>
      ${isNew ? '' : '<button class="btn danger" data-sact="delete">削除する</button>'}`,
    (act, el, sh) => {
      if (act === 'save') {
        const name = $('#o-name', sh).value.trim();
        if (!name) return toast('名前を入力してください');
        if (state.oshis.some((x, j) => x.name === name && j !== i)) return toast('同じ名前の推しがすでにいます');
        let tags = C.parseTags($('#o-tags', sh).value);
        if (!tags.length) tags = [name];
        if (isNew) state.oshis.push({ name, tags });
        else {
          // 名前を変えたら、今までの記録の推し名も変える
          if (o.name !== name) for (const r of state.events.concat(state.expenses)) if (r.oshi === o.name) r.oshi = name;
          o.name = name; o.tags = tags;
        }
        save(); closeSheet(); render(); toast('保存しました');
      }
      if (act === 'delete' && confirm(`「${o.name}」を削除しますか？（予定や出費の記録は消えません）`)) {
        state.oshis.splice(i, 1);
        save(); closeSheet(); render();
      }
    });
  }

  // ---------- スクショ・投稿から読み取る ----------
  function importSheet() {
    openSheet('スクショ・投稿から読み取る', `
      <button class="btn" data-sact="pick">🖼 スクショを選んで読み取る</button>
      <input id="imp-file" type="file" accept="image/*" hidden>
      <div id="imp-progress" class="muted" style="text-align:center;margin:8px 0" hidden></div>
      <p class="muted" style="margin:10px 0 4px">初回だけ読み取り用のデータ（数MB）をダウンロードします。Wi-Fiがおすすめです</p>
      <div class="or">または</div>
      <label class="f"><span>文章を貼り付ける（いちばん正確です）</span>
        <textarea id="imp-text" style="min-height:140px" placeholder="投稿の文章をここに貼り付け"></textarea></label>
      <button class="btn sub" data-sact="read-text">この文章を読み取る</button>
      <details class="src" style="margin-top:12px"><summary>スクショの文字をコピーする方法</summary>
        <p class="help">① 写真アプリでスクショを開く<br>② 文字の部分を長押し<br>③「すべてを選択」→「コピー」<br>④ 上の欄を長押しして「ペースト」<br>InstagramやXの投稿文なら、投稿の「…」やテキストの長押しからもコピーできます。</p></details>`,
    async (act, el, sh) => {
      if (act === 'pick') $('#imp-file', sh).click();
      if (act === 'read-text') {
        const text = $('#imp-text', sh).value.trim();
        if (!text) return toast('文章を貼り付けてください');
        pendingShot = null;
        importReview(text);
      }
    });
    $('#imp-file').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const prog = $('#imp-progress');
      prog.hidden = false;
      prog.textContent = '準備しています…';
      pendingShot = file;
      try {
        const text = await self.OCR.readImage(file, (p) => { prog.textContent = '読み取り中… ' + Math.round(p * 100) + '%'; });
        if (!text) { prog.textContent = '文字が見つかりませんでした。文章の貼り付けを試してください'; return; }
        importReview(text);
      } catch (err) {
        prog.textContent = err.message || '読み取りに失敗しました';
      }
    };
  }

  function importReview(text) {
    const now = new Date();
    const info = C.extractInfo(text, now);
    const rows = info.events.length ? info.events : [];
    const oshi = guessOshi(info.tags) || state.lastOshi;
    const rowHtml = (e, i) => `<div class="cand" data-i="${i}">
      <label class="row" style="gap:6px"><input type="checkbox" class="c-on" ${e.checked ? 'checked' : ''} style="width:22px;height:22px">
        <select class="c-type">${C.EVENT_TYPES.map((t) => `<option value="${t[0]}" ${t[0] === e.type ? 'selected' : ''}>${t[2]} ${t[1]}${t[0] === e.type && e.label ? '（' + e.label + '）' : ''}</option>`).join('')}</select></label>
      <div class="two" style="margin-top:6px"><input class="c-date" type="date" value="${e.date}"><input class="c-time" type="time" value="${e.time || ''}"></div>
      <div class="row" style="margin-top:6px"><input class="c-amount" inputmode="numeric" value="${e.amount || ''}" placeholder="金額（任意）" style="flex:1"></div>
      ${e.suspect ? '<div class="over-text" style="font-size:13px;margin-top:4px">⚠️ 読み間違いかもしれません。画像と見比べてください</div>' : e.past ? '<div class="over-text" style="font-size:13px;margin-top:4px">この日付はもう過ぎています</div>' : ''}
      ${e.line ? `<div class="muted" style="margin-top:4px">元の文：${esc(e.line)}</div>` : ''}
    </div>`;
    openSheet('読み取り結果の確認', `
      <p class="muted" style="margin:0 0 10px">間違いがあれば直してから登録してください。チェックした予定だけ登録されます</p>
      <label class="f"><span>タイトル</span><input id="r-title" value="${esc(info.title)}" placeholder="例：ちいかわ ポップアップストア"></label>
      <label class="f"><span>推し</span><input id="r-oshi" list="oshi-list" value="${esc(oshi)}">${oshiList()}</label>
      <label class="f"><span>販売場所・会場</span><input id="r-shop" value="${esc(info.shop)}" placeholder="見つかりませんでした"></label>
      <label class="f"><span>タグ</span><input id="r-tags" value="${esc(tagText(info.tags))}" placeholder="例：#ちいかわ"></label>
      <h4 style="margin:14px 0 6px">見つかった日付（${rows.length}件）</h4>
      <div id="cands">${rows.length ? rows.map(rowHtml).join('') : '<div class="empty" style="padding:8px">日付が見つかりませんでした。下のボタンで追加できます</div>'}</div>
      <button class="btn sub" data-sact="add-row" style="margin-bottom:12px">＋ 日付を手で追加</button>
      <label class="f"><span>写真（任意）</span>
        <div class="row" style="gap:10px">${pendingShot ? '<span class="badge">📷 読み取ったスクショを付けます</span>' : ''}
          <button type="button" class="btn sub" style="width:auto;padding:10px 14px" data-sact="pick-shot">${pendingShot ? '別の写真にする' : '📷 写真を付ける'}</button></div></label>
      <input id="r-photo" type="file" accept="image/*" hidden>
      <button class="btn" data-sact="save">チェックした予定を登録</button>
      <details class="src"><summary>読み取った文章（直して読み直せます）</summary>
        <textarea id="r-text" style="width:100%;min-height:140px;margin-top:8px;border:1px solid var(--line);border-radius:12px;padding:10px;background:var(--card)">${esc(text)}</textarea>
        <button class="btn sub" data-sact="reread" style="margin-top:8px">この文章で読み直す</button></details>`,
    async (act, el, sh) => {
      if (act === 'reread') return importReview($('#r-text', sh).value);
      if (act === 'pick-shot') {
        const inp = $('#r-photo', sh);
        inp.onchange = () => { if (inp.files[0]) { pendingShot = inp.files[0]; el.textContent = '別の写真にする'; toast('写真を付けます'); } };
        inp.click();
      }
      if (act === 'add-row') {
        const box = $('#cands', sh);
        if (!box.querySelector('.cand')) box.innerHTML = '';
        box.insertAdjacentHTML('beforeend', rowHtml({ type: 'release', date: today(), time: '', amount: 0, checked: true }, box.children.length));
      }
      if (act === 'save') {
        const title = $('#r-title', sh).value.trim();
        const oshiName = $('#r-oshi', sh).value.trim();
        const shop = $('#r-shop', sh).value.trim();
        const tags = C.parseTags($('#r-tags', sh).value);
        const added = [];
        for (const c of sh.querySelectorAll('.cand')) {
          if (!c.querySelector('.c-on').checked) continue;
          const date = c.querySelector('.c-date').value;
          if (!date) continue;
          const i = Number(c.dataset.i);
          const label = rows[i] && rows[i].type === c.querySelector('.c-type').value ? rows[i].label : '';
          const amt = C.parseYen(c.querySelector('.c-amount').value) || 0;
          added.push({
            id: uid(), done: false, created: Date.now(), type: c.querySelector('.c-type').value,
            title: title + (label ? '（' + label + '）' : ''), oshi: oshiName, date, time: c.querySelector('.c-time').value,
            amount: amt, shop, tags, memo: rows[i] ? rows[i].line : '', source: $('#r-text', sh).value,
          });
        }
        if (!added.length) return toast('登録する予定にチェックを入れてください');
        if (pendingShot) {
          try { const pid = await savePhoto(pendingShot); added.forEach((e) => { e.photos = [pid]; }); }
          catch (err) { toast('写真は保存できませんでした（予定は登録します）'); }
          pendingShot = null;
        }
        state.events.push(...added);
        rememberOshi(oshiName);
        save(); render();
        importDone(added);
      }
    });
  }

  function importDone(added) {
    const now = new Date();
    openSheet(added.length + '件 登録しました', `
      <ul class="list card" style="padding:4px 14px">${added.map((e) => eventRow(e, now)).join('')}</ul>
      <button class="btn" data-sact="cal">📅 ${added.length}件まとめてカレンダーに入れる</button>
      <button class="btn sub" data-close>閉じる</button>`,
    (act) => {
      if (act === 'cal') { addToCalendar(added); added.forEach((e) => { e.calAdded = true; }); save(); }
    });
  }

  // ---------- カレンダー・バックアップ ----------
  const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function addToCalendar(evs) {
    const ics = C.buildICSMulti(evs, new Date());
    if (isIOS()) {
      // iPhoneは .ics を開くと「カレンダーに追加」の画面が出る
      location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
      return;
    }
    download(new Blob([ics], { type: 'text/calendar' }), 'oshi-note.ics');
    toast('カレンダー用のファイルを保存しました。開くと予定に追加されます');
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function importBackup(file) {
    const r = new FileReader();
    r.onload = () => {
      let d;
      try { d = JSON.parse(r.result); } catch (e) { return toast('このファイルは読み込めませんでした'); }
      if (!C.validBackup(d)) return toast('推し活ノートのバックアップではないようです');
      if (!confirm(`予定${d.events.length}件・出費${d.expenses.length}件で、今のデータを上書きしますか？`)) return;
      const photos = d.photos || {};
      delete d.photos;
      state = migrate(Object.assign(defaults(), d));
      save();
      Promise.all(Object.entries(photos).map(([id, v]) => self.Photos.put(id, v))).catch(() => toast('一部の写真を戻せませんでした')).then(() => { render(); toast('バックアップから戻しました'); });
    };
    r.readAsText(file);
  }

  // ---------- ボタン操作 ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.closest('#sheet')) return;
    const act = el.dataset.act;
    const find = (arr) => arr.find((x) => x.id === el.dataset.id);
    if (act === 'new-event') eventForm(null, el.dataset.date ? { date: el.dataset.date } : null);
    else if (act === 'new-expense') expenseForm();
    else if (act === 'import') importSheet();
    else if (act === 'event') { const ev = find(state.events); if (ev) eventDetail(ev); }
    else if (act === 'expense') { const ex = find(state.expenses); if (ex) expenseForm(ex); }
    else if (act === 'events-tab') { eventsTab = el.dataset.tab; render(); }
    else if (act === 'day') { selDay = el.dataset.v; render(); }
    else if (act === 'cal-month') {
      calMonth = C.shiftMonth(calMonth, Number(el.dataset.d));
      selDay = calMonth === C.monthKey(today()) ? today() : calMonth + '-01';
      render();
    }
    else if (act === 'search-tag') { searchQ = '#' + el.dataset.v; render(); }
    else if (act === 'month') { moneyMonth = C.shiftMonth(moneyMonth, Number(el.dataset.d)); render(); }
    else if (act === 'theme') { setLook({ theme: el.dataset.v }); render(); }
    else if (act === 'mode') { setLook({ mode: el.dataset.v }); render(); }
    else if (act === 'bg-pick') $('#bg-file').click();
    else if (act === 'bg-clear') { localStorage.removeItem(BG_KEY); applyBg(); render(); toast('背景の画像を外しました'); }
    else if (act === 'oshi') oshiForm(Number(el.dataset.i));
    else if (act === 'go-settings') location.hash = '#/settings';
    else if (act === 'save-budget') {
      const v = $('#budget').value.trim();
      const n = v ? C.parseYen(v) : 0;
      if (n == null) return toast('予算は数字で入力してください');
      state.budget = n; save(); render(); toast(n ? '予算を ' + C.yen(n) + ' にしました' : '予算なしにしました');
    } else if (act === 'export') {
      self.Photos.all().catch(() => ({})).then((photos) => {
        download(new Blob([JSON.stringify(Object.assign({}, state, { photos }))], { type: 'application/json' }), 'oshi-note-backup-' + today() + '.json');
        toast('バックアップを保存しました（写真も入っています）');
      });
    } else if (act === 'import-backup') $('#import-file').click();
  });

  document.addEventListener('change', async (e) => {
    if (e.target.id === 'import-file' && e.target.files[0]) importBackup(e.target.files[0]);
    if (e.target.id === 'bg-file' && e.target.files[0]) {
      try {
        const img = await self.OCR.shrink(e.target.files[0], 1400, 0.8);
        if (saveBg(Object.assign(getBg(), { img }))) { applyBg(); render(); toast('背景を設定しました'); }
      } catch (err) { toast(err.message || '画像を読み込めませんでした'); }
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'q') {
      searchQ = e.target.value;
      $('#search-results').innerHTML = searchResults();
      hydrate($('#search-results'));
    }
    if (e.target.id === 'bg-strength') {
      const v = Number(e.target.value);
      $('#bg-val').textContent = v + '%';
      saveBg(Object.assign(getBg(), { strength: v }));
      applyBg();
    }
  });

  window.addEventListener('hashchange', render);
  // 日付が変わった時や、アプリに戻ってきた時に「あと何日」を更新する
  document.addEventListener('visibilitychange', () => { if (!document.hidden && $('#sheet').hidden && document.activeElement.id !== 'q') render(); });
  setLook({});
  applyBg();
  render();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
