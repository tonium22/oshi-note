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

  // 画面の色（推しカラー）。[id, 名前, 見本の色]
  const THEMES = [
    ['purple', '紫', '#6a4bc4'], ['pink', 'ピンク', '#d6336c'], ['red', '赤', '#d62839'], ['orange', 'オレンジ', '#e8590c'],
    ['yellow', '黄', '#f5c400'], ['green', '緑', '#2b9348'], ['sky', '水色', '#1c9fd6'], ['blue', '青', '#2f5bd3'],
  ];
  const MODES = [['light', '明るい'], ['dark', '暗い'], ['auto', '自動']];
  const LOOK_KEY = 'oshi-note-look';
  function getLook() {
    const h = document.documentElement.dataset;
    return { theme: h.theme || 'purple', mode: h.mode || 'light' };
  }
  function setLook(patch) {
    const look = Object.assign(getLook(), patch);
    document.documentElement.dataset.theme = look.theme;
    document.documentElement.dataset.mode = look.mode;
    const t = THEMES.find((x) => x[0] === look.theme);
    document.querySelector('meta[name=theme-color]').content = t ? t[2] : '#6a4bc4';
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch (e) { /* 保存できなくても今回は反映 */ }
  }

  const defaults = () => ({ events: [], expenses: [], oshis: [], budget: 0, lastOshi: '' });
  let state = load();
  let eventsTab = 'open';
  let moneyMonth = C.monthKey(today());

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (C.validBackup(s)) return Object.assign(defaults(), s);
    } catch (e) { /* 壊れていたら空で始める */ }
    return defaults();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('保存できませんでした（空き容量を確認してください）'); }
  }
  function rememberOshi(name) {
    name = (name || '').trim();
    if (!name) return;
    state.lastOshi = name;
    if (!state.oshis.includes(name)) state.oshis.push(name);
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
        ${s.remain >= 0 ? `<span>のこり <b class="ok-text">${C.yen(s.remain)}</b></span>` : `<span><b class="over-text">${C.yen(-s.remain)} オーバー</b></span>`}</div>`;
    } else {
      body = `<p class="muted" style="margin:6px 0 10px">月の予算を決めると、使いすぎたときに色で分かるようになるで</p>
        <button class="btn sub" data-act="go-settings">月の予算を決める</button>`;
    }
    return `<div class="card"><h2>${label}の推し活</h2><div class="big">${C.yen(s.total)}</div>
      <div class="muted">${s.count}件</div>${body}</div>`;
  }

  function eventRow(ev, now) {
    const t = C.typeInfo(ev.type);
    const u = C.urgency(ev, now);
    return `<li class="item ${ev.done ? 'done' : ''}" data-act="event" data-id="${ev.id}">
      <div class="emoji">${t[2]}</div>
      <div class="main"><div class="ttl">${esc(ev.title || t[1])}</div>
        <div class="muted">${t[1]}・${C.dateLabel(ev)}${ev.oshi ? '・' + esc(ev.oshi) : ''}</div></div>
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
          ${urgent ? `<div class="card" style="background:var(--over-soft)"><b class="over-text">⚠️ 今日まで・期限切れが ${urgent}件 あるで</b></div>` : ''}
          <div class="btn-pair">
            <button class="btn" data-act="new-event">＋ 期限を登録</button>
            <button class="btn pink" data-act="new-expense">＋ 出費を記録</button>
          </div>
          <div class="card"><h2>次の期限</h2>
            ${open.length ? `<ul class="list">${open.slice(0, 5).map((e) => eventRow(e, now)).join('')}</ul>
              ${open.length > 5 ? `<a class="muted" href="#/events">ほか${open.length - 5}件を見る ›</a>` : ''}`
              : '<div class="empty">期限はまだ無いで。<br>チケットの入金期限や抽選の締切を入れてみよう</div>'}
          </div>
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
        return `
          <div class="seg">
            <button data-act="events-tab" data-tab="open" class="${eventsTab === 'open' ? 'on' : ''}">これから ${open.length}</button>
            <button data-act="events-tab" data-tab="done" class="${eventsTab === 'done' ? 'on' : ''}">完了 ${done.length}</button>
          </div>
          <button class="btn" data-act="new-event" style="margin-bottom:12px">＋ 期限を登録</button>
          <div class="card">${list.length ? `<ul class="list">${list.map((e) => eventRow(e, now)).join('')}</ul>`
            : `<div class="empty">${eventsTab === 'open' ? 'これからの期限は無いで' : '完了したものはまだ無いで'}</div>`}</div>`;
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
          ${cats.length ? `<div class="card"><h2>何に使った？</h2>${bars(cats, C.catName)}</div>` : ''}
          ${oshis.length > 1 ? `<div class="card"><h2>推しごと</h2>${bars(oshis, (k) => k)}</div>` : ''}
          <div class="card"><h2>記録</h2>${list.length ? `<ul class="list">${list.map(expenseRow).join('')}</ul>` : '<div class="empty">この月の記録はまだ無いで</div>'}</div>`;
      },
    },

    settings: {
      title: '設定',
      html() {
        const look = getLook();
        return `
          <div class="card"><h2>画面の色</h2>
            <p class="muted" style="margin:0 0 10px">推しのメンバーカラーにしてもええで</p>
            <div class="swatches">${THEMES.map((t) => `<button data-act="theme" data-v="${t[0]}" class="${look.theme === t[0] ? 'on' : ''}"><i style="background:${t[2]}"></i>${t[1]}</button>`).join('')}</div>
            <div class="seg" style="margin:0">${MODES.map((m) => `<button data-act="mode" data-v="${m[0]}" class="${look.mode === m[0] ? 'on' : ''}">${m[1]}</button>`).join('')}</div>
            <p class="muted" style="margin:6px 0 0">「自動」はiPhoneのダークモード設定に合わせる</p>
          </div>
          <div class="card"><h2>月の予算</h2>
            <label class="f"><span>1か月に推し活で使っていい金額（0で予算なし）</span>
              <input id="budget" class="yen" inputmode="numeric" value="${state.budget || ''}" placeholder="例：30000"></label>
            <button class="btn" data-act="save-budget">予算を保存</button>
          </div>
          <div class="card"><h2>推しの名前</h2>
            <div class="chips" style="margin-bottom:10px">${state.oshis.length ? state.oshis.map((o, i) => `<button data-act="del-oshi" data-i="${i}">${esc(o)} ✕</button>`).join('') : '<span class="muted">まだ登録なし（入力すると自動で増えるで）</span>'}</div>
            <div class="row"><input id="new-oshi" class="f" style="flex:1;border:1px solid var(--line);background:var(--card);border-radius:12px;padding:12px;font-size:16px" placeholder="推しの名前を追加">
              <button class="btn" style="width:auto;padding:12px 16px" data-act="add-oshi">追加</button></div>
          </div>
          <div class="card"><h2>バックアップ</h2>
            <p class="help">データは<b>このiPhoneの中だけ</b>に保存してる。Safariの履歴やWebサイトデータを消すと<b>全部消える</b>から、たまにバックアップしといてな。</p>
            <button class="btn sub" data-act="export">バックアップを保存（ファイル）</button>
            <button class="btn sub" data-act="import">バックアップから戻す</button>
            <input id="import-file" type="file" accept="application/json,.json" hidden>
          </div>
          <div class="card"><h2>このアプリについて</h2>
            <p class="help">
              ・無料。アカウント登録なし。データは外に送らない<br>
              ・「カレンダーにアラームを入れる」を押すと、iPhoneのカレンダーに予定が入る（時刻ありは<b>前日</b>と<b>3時間前</b>、時刻なしは<b>前日9時</b>と<b>当日9時</b>に通知）<br>
              ・通知はiPhoneのカレンダーが出すので、このアプリを開いてなくても届く
            </p>
          </div>`;
      },
    },
  };

  function render() {
    const name = location.hash.replace(/^#\/?/, '').split('/')[0] || 'home';
    const view = VIEWS[name] || VIEWS.home;
    document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === (VIEWS[name] ? name : 'home')));
    $('#title').textContent = view.title;
    $('#view').innerHTML = view.html();
  }

  // ---------- 下から出る入力画面 ----------
  function openSheet(title, html, onAct) {
    const sh = $('#sheet');
    sh.innerHTML = `<div class="panel" role="dialog" aria-label="${esc(title)}">
      <div class="panel-head"><h3>${esc(title)}</h3><button class="x" data-close aria-label="閉じる">✕</button></div>${html}</div>`;
    sh.hidden = false;
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

  const oshiList = () => `<datalist id="oshi-list">${state.oshis.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>`;
  const chipsHtml = (items, cur, key) => `<div class="chips">${items.map((it) => `<button type="button" data-sact="${key}" data-v="${it[0]}" class="${it[0] === cur ? 'on' : ''}">${it[2] ? it[2] + ' ' : ''}${it[1]}</button>`).join('')}</div>`;
  const pickChip = (el) => { el.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el)); return el.dataset.v; };

  // 期限の登録・編集
  function eventForm(ev, preset) {
    const isNew = !ev;
    const d = Object.assign({ type: 'pay', title: '', oshi: state.lastOshi, date: today(), time: '', amount: '', memo: '' }, preset, ev);
    openSheet(isNew ? '期限を登録' : '期限を編集', `
      <label class="f"><span>種類</span>${chipsHtml(C.EVENT_TYPES, d.type, 'type')}</label>
      <label class="f"><span>なんの予定？</span><input id="ev-title" value="${esc(d.title)}" placeholder="例：○○ドームツアー 大阪 1日目"></label>
      <label class="f"><span>推し</span><input id="ev-oshi" list="oshi-list" value="${esc(d.oshi)}" placeholder="例：推しの名前">${oshiList()}</label>
      <div class="two">
        <label class="f"><span>日付</span><input id="ev-date" type="date" value="${esc(d.date)}"></label>
        <label class="f"><span>時刻（なくてもOK）</span><input id="ev-time" type="time" value="${esc(d.time)}"></label>
      </div>
      <label class="f"><span>金額（なくてもOK）</span><input id="ev-amount" inputmode="numeric" value="${d.amount || ''}" placeholder="例：12000"></label>
      <label class="f"><span>メモ</span><textarea id="ev-memo" placeholder="例：FC先行・2枚・コンビニ払い">${esc(d.memo)}</textarea></label>
      <button class="btn" data-sact="save">保存する</button>
      ${isNew ? '' : '<button class="btn danger" data-sact="delete">削除する</button>'}`,
    (act, el, sh) => {
      if (act === 'type') d.type = pickChip(el);
      if (act === 'save') {
        const date = $('#ev-date', sh).value;
        if (!date) return toast('日付を入れてな');
        const amtText = $('#ev-amount', sh).value.trim();
        const amount = amtText ? C.parseYen(amtText) : 0;
        if (amount == null) return toast('金額は数字で入れてな');
        const data = { type: d.type, title: $('#ev-title', sh).value.trim(), oshi: $('#ev-oshi', sh).value.trim(), date, time: $('#ev-time', sh).value, amount, memo: $('#ev-memo', sh).value.trim() };
        let target = ev;
        if (isNew) { target = Object.assign({ id: uid(), done: false, created: Date.now() }, data); state.events.push(target); }
        else Object.assign(ev, data);
        rememberOshi(data.oshi);
        save();
        render();
        eventDetail(target);
        toast(isNew ? '登録した！カレンダーにも入れとこ' : '保存した');
      }
      if (act === 'delete' && confirm('この期限を削除する？')) {
        state.events = state.events.filter((x) => x.id !== ev.id);
        save(); closeSheet(); render(); toast('削除した');
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
    else if (ev.type === 'pay') doneBtns = '<button class="btn pink" data-sact="paid">入金した（出費にも記録）</button>';
    else if (ev.type === 'result') doneBtns = '<button class="btn pink" data-sact="won">当選した！→ 入金期限を登録</button><button class="btn sub" data-sact="done">落選・確認した</button>';
    else doneBtns = '<button class="btn pink" data-sact="done">完了にする</button>';
    openSheet(t[1], `
      <div class="detail-top"><div class="emoji">${t[2]}</div>
        <div class="ttl">${esc(ev.title || t[1])}</div>
        <div class="muted">${C.dateLabel(ev)}${ev.time ? '' : '（時刻なし）'}${ev.oshi ? '・' + esc(ev.oshi) : ''}</div>
        <div style="margin-top:6px"><span class="badge ${u}">${C.untilLabel(ev, now)}</span></div>
        ${ev.amount ? `<div class="big" style="margin-top:8px">${C.yen(ev.amount)}</div>` : ''}
        ${ev.memo ? `<p class="help" style="white-space:pre-wrap">${esc(ev.memo)}</p>` : ''}
      </div>
      ${ev.done ? '' : `<button class="btn" data-sact="cal">📅 iPhoneのカレンダーにアラームを入れる</button>
        ${ev.calAdded ? '<p class="muted" style="text-align:center;margin:4px 0 0">前にカレンダーへ送ったで（2回入れると重なるので注意）</p>' : ''}`}
      <div style="height:8px"></div>
      ${doneBtns}
      <button class="btn sub" data-sact="edit">編集する</button>`,
    (act) => {
      if (act === 'cal') { addToCalendar(ev); ev.calAdded = true; save(); }
      if (act === 'edit') eventForm(ev);
      if (act === 'undone') { ev.done = false; save(); render(); eventDetail(ev); }
      if (act === 'done') { ev.done = true; save(); render(); closeSheet(); toast('完了にした'); }
      if (act === 'won') {
        ev.done = true; save(); render();
        eventForm(null, { type: 'pay', title: ev.title, oshi: ev.oshi, amount: ev.amount, memo: ev.memo });
        toast('おめでとう！入金期限の日付を入れてな');
      }
      if (act === 'paid') {
        if (!ev.amount) {
          ev.done = true; save(); render();
          expenseForm(null, { cat: 'ticket', oshi: ev.oshi, memo: ev.title, fromEvent: ev.id });
          return toast('金額を入れて記録してな');
        }
        ev.done = true;
        state.expenses.push({ id: uid(), date: today(), amount: ev.amount, cat: 'ticket', oshi: ev.oshi, memo: ev.title, fromEvent: ev.id });
        save(); render(); closeSheet();
        toast('入金済みにして、出費に ' + C.yen(ev.amount) + ' を記録した');
      }
    });
  }

  // 出費の記録・編集
  function expenseForm(ex, preset) {
    const isNew = !ex;
    const d = Object.assign({ amount: '', cat: 'goods', oshi: state.lastOshi, date: today(), memo: '' }, preset, ex);
    openSheet(isNew ? '出費を記録' : '出費を編集', `
      <label class="f"><span>金額</span><input id="ex-amount" class="yen" inputmode="numeric" value="${d.amount || ''}" placeholder="¥0"></label>
      <label class="f"><span>なにに？</span>${chipsHtml(C.CATS, d.cat, 'cat')}</label>
      <label class="f"><span>推し</span><input id="ex-oshi" list="oshi-list" value="${esc(d.oshi)}" placeholder="例：推しの名前">${oshiList()}</label>
      <label class="f"><span>日付</span><input id="ex-date" type="date" value="${esc(d.date)}"></label>
      <label class="f"><span>メモ（なくてもOK）</span><input id="ex-memo" value="${esc(d.memo)}" placeholder="例：アクスタ・ランダム缶バッジ3個"></label>
      <button class="btn pink" data-sact="save">記録する</button>
      ${isNew ? '' : '<button class="btn danger" data-sact="delete">削除する</button>'}`,
    (act, el, sh) => {
      if (act === 'cat') d.cat = pickChip(el);
      if (act === 'save') {
        const amount = C.parseYen($('#ex-amount', sh).value);
        if (!amount) return toast('金額を数字で入れてな');
        const date = $('#ex-date', sh).value || today();
        const data = { amount, cat: d.cat, oshi: $('#ex-oshi', sh).value.trim(), date, memo: $('#ex-memo', sh).value.trim() };
        if (isNew) state.expenses.push(Object.assign({ id: uid(), fromEvent: d.fromEvent }, data));
        else Object.assign(ex, data);
        rememberOshi(data.oshi);
        save(); closeSheet(); render();
        const s = C.monthSummary(state.expenses, C.monthKey(date), state.budget);
        toast(s.budget && s.remain < 0 ? '記録した（今月は予算を ' + C.yen(-s.remain) + ' オーバー）' : '記録した');
      }
      if (act === 'delete' && confirm('この記録を削除する？')) {
        state.expenses = state.expenses.filter((x) => x.id !== ex.id);
        save(); closeSheet(); render(); toast('削除した');
      }
    });
  }

  // ---------- カレンダー・バックアップ ----------
  const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function addToCalendar(ev) {
    const ics = C.buildICS(ev, new Date());
    if (isIOS()) {
      // iPhoneは .ics を開くと「カレンダーに追加」の画面が出る
      location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
      return;
    }
    download(new Blob([ics], { type: 'text/calendar' }), 'oshi-' + ev.id + '.ics');
    toast('カレンダー用のファイルを保存した。開くと予定に入るで');
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
      try { d = JSON.parse(r.result); } catch (e) { return toast('このファイルは読めませんでした'); }
      if (!C.validBackup(d)) return toast('推し活ノートのバックアップではないみたい');
      if (!confirm(`期限${d.events.length}件・出費${d.expenses.length}件で今のデータを上書きする？`)) return;
      state = Object.assign(defaults(), d);
      save(); render(); toast('バックアップから戻した');
    };
    r.readAsText(file);
  }

  // ---------- ボタン操作 ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.closest('#sheet')) return;
    const act = el.dataset.act;
    const find = (arr) => arr.find((x) => x.id === el.dataset.id);
    if (act === 'new-event') eventForm();
    else if (act === 'new-expense') expenseForm();
    else if (act === 'event') { const ev = find(state.events); if (ev) eventDetail(ev); }
    else if (act === 'expense') { const ex = find(state.expenses); if (ex) expenseForm(ex); }
    else if (act === 'events-tab') { eventsTab = el.dataset.tab; render(); }
    else if (act === 'month') { moneyMonth = C.shiftMonth(moneyMonth, Number(el.dataset.d)); render(); }
    else if (act === 'theme') { setLook({ theme: el.dataset.v }); render(); }
    else if (act === 'mode') { setLook({ mode: el.dataset.v }); render(); }
    else if (act === 'go-settings') location.hash = '#/settings';
    else if (act === 'save-budget') {
      const v = $('#budget').value.trim();
      const n = v ? C.parseYen(v) : 0;
      if (n == null) return toast('予算は数字で入れてな');
      state.budget = n; save(); render(); toast(n ? '予算を ' + C.yen(n) + ' にした' : '予算なしにした');
    } else if (act === 'add-oshi') {
      const name = $('#new-oshi').value.trim();
      if (!name) return;
      if (!state.oshis.includes(name)) state.oshis.push(name);
      save(); render();
    } else if (act === 'del-oshi') {
      const name = state.oshis[Number(el.dataset.i)];
      if (confirm(`「${name}」を候補から消す？（記録は消えへん）`)) { state.oshis.splice(Number(el.dataset.i), 1); save(); render(); }
    } else if (act === 'export') {
      download(new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' }), 'oshi-note-backup-' + today() + '.json');
      toast('バックアップを保存した（「ファイル」アプリに入るで）');
    } else if (act === 'import') $('#import-file').click();
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'import-file' && e.target.files[0]) importBackup(e.target.files[0]);
  });

  window.addEventListener('hashchange', render);
  // 日付が変わったときや、アプリに戻ってきたときに「あと何日」を更新する
  document.addEventListener('visibilitychange', () => { if (!document.hidden && $('#sheet').hidden) render(); });
  setLook({});
  render();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
