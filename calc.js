// 推し活ノートの計算ロジック（画面に依存しない純粋な処理だけを置く）
(function (root) {
  'use strict';

  // [id, 表示名, 絵文字]
  const EVENT_TYPES = [
    ['pay', '入金期限', '💴'],
    ['lottery', '抽選の締切', '🎫'],
    ['result', '当落発表', '📣'],
    ['show', '公演・イベント', '🎤'],
    ['release', '発売・予約締切', '🛍'],
    ['other', 'その他', '📌'],
  ];
  const CATS = [
    ['ticket', 'チケット'],
    ['goods', 'グッズ'],
    ['travel', '交通費'],
    ['hotel', '宿泊'],
    ['sub', 'FC・配信'],
    ['food', '飲食'],
    ['other', 'その他'],
  ];
  const typeInfo = (id) => EVENT_TYPES.find((t) => t[0] === id) || EVENT_TYPES[EVENT_TYPES.length - 1];
  const catName = (id) => (CATS.find((c) => c[0] === id) || CATS[CATS.length - 1])[1];

  const pad = (n) => String(n).padStart(2, '0');
  const toHalf = (s) => String(s == null ? '' : s).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

  // 「１２，０００円」「¥12,000」→ 12000。数字でなければ null
  function parseYen(v) {
    const s = toHalf(v).replace(/[,，円¥￥\s]/g, '');
    if (!/^\d{1,9}$/.test(s)) return null;
    return parseInt(s, 10);
  }

  function yen(n) {
    return '¥' + Math.round(Number(n) || 0).toLocaleString('ja-JP');
  }

  function ymd(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  // 期限の日時。時刻が無ければその日の 23:59 までとみなす
  function eventDue(ev) {
    const d = parseDate(ev.date);
    if (!d) return null;
    const t = /^(\d{2}):(\d{2})$/.exec(ev.time || '');
    if (t) d.setHours(+t[1], +t[2]);
    else d.setHours(23, 59);
    return d;
  }

  // 今日から何日後か（今日=0、明日=1、昨日=-1）
  function daysUntil(dateStr, now) {
    const d = parseDate(dateStr);
    if (!d) return null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((d - today) / 86400000);
  }

  // done / over（期限切れ）/ today / soon（3日以内）/ later
  function urgency(ev, now) {
    if (ev.done) return 'done';
    const due = eventDue(ev);
    if (!due) return 'later';
    if (due < now) return 'over';
    const d = daysUntil(ev.date, now);
    if (d === 0) return 'today';
    if (d <= 3) return 'soon';
    return 'later';
  }

  function untilLabel(ev, now) {
    const u = urgency(ev, now);
    if (u === 'done') return '完了';
    if (u === 'over') return '期限切れ';
    const d = daysUntil(ev.date, now);
    if (d === 0) {
      if (!ev.time) return '今日まで';
      const h = Math.floor((eventDue(ev) - now) / 3600000);
      return h >= 1 ? '今日・あと' + h + '時間' : '今日・まもなく';
    }
    if (d === 1) return '明日';
    return 'あと' + d + '日';
  }

  const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  function dateLabel(ev) {
    const d = parseDate(ev.date);
    if (!d) return '';
    return (d.getMonth() + 1) + '/' + d.getDate() + '(' + WEEK[d.getDay()] + ')' + (ev.time ? ' ' + ev.time : '');
  }

  const dueTime = (ev) => { const d = eventDue(ev); return d ? d.getTime() : 8.64e15; };
  // 期限が近い順（期限切れは一番上に来る）
  function sortEvents(evs) {
    return evs.slice().sort((a, b) => dueTime(a) - dueTime(b));
  }

  function monthKey(dateStr) {
    return String(dateStr || '').slice(0, 7);
  }

  function shiftMonth(key, delta) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }

  // その月の出費の集計。予算0なら予算なし扱い
  function monthSummary(expenses, key, budget) {
    const list = (expenses || []).filter((e) => monthKey(e.date) === key);
    let total = 0;
    const byCat = {}, byOshi = {};
    for (const e of list) {
      const a = Math.max(0, Math.round(Number(e.amount) || 0));
      total += a;
      const c = e.cat || 'other';
      byCat[c] = (byCat[c] || 0) + a;
      const o = e.oshi || '推し未設定';
      byOshi[o] = (byOshi[o] || 0) + a;
    }
    const b = Math.max(0, Math.round(Number(budget) || 0));
    return { list, total, byCat, byOshi, count: list.length, budget: b, remain: b ? b - total : null, ratio: b ? total / b : null };
  }

  // ---- iPhoneのカレンダーに入れる .ics ファイル ----
  function icsEscape(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
  }
  const icsLocal = (d) => '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  const icsDate = (d) => '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  const icsUtc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  // ics は1行75バイトまでのルールがあるので、長い行は折り返す（日本語は1文字3バイト）
  function fold(line) {
    const out = [];
    let cur = '', bytes = 0;
    for (const ch of line) {
      const b = ch.charCodeAt(0) < 0x80 ? 1 : ch.codePointAt(0) < 0x800 ? 2 : ch.codePointAt(0) < 0x10000 ? 3 : 4;
      if (bytes + b > (out.length ? 73 : 74)) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  }

  // 時刻ありは「前日」と「3時間前」、終日は「前日9時」と「当日9時」にアラーム
  function buildICS(ev, now) {
    return buildICSMulti([ev], now);
  }

  // 複数の予定を1つのファイルにまとめる（まとめてカレンダーに入れる用）
  function buildICSMulti(evs, now) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//oshi-note//JA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const ev of evs) lines.push(...veventLines(ev, now));
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  function veventLines(ev, now) {
    const t = typeInfo(ev.type);
    const title = '【' + t[1] + '】' + (ev.title || '') + (ev.oshi ? '（' + ev.oshi + '）' : '');
    const desc = [ev.amount ? '金額: ' + yen(ev.amount) : '', ev.shop ? '販売場所: ' + ev.shop : '', ev.memo || '', '推し活ノートから追加'].filter(Boolean).join('\n');
    const lines = ['BEGIN:VEVENT', 'UID:' + ev.id + '@oshi-note', 'DTSTAMP:' + icsUtc(now)];
    let alarms;
    if (ev.time) {
      const s = eventDue(ev);
      lines.push('DTSTART:' + icsLocal(s), 'DTEND:' + icsLocal(new Date(s.getTime() + 30 * 60000)));
      alarms = ['-P1D', '-PT3H'];
    } else {
      const d = parseDate(ev.date), e = new Date(d);
      e.setDate(e.getDate() + 1);
      lines.push('DTSTART;VALUE=DATE:' + icsDate(d), 'DTEND;VALUE=DATE:' + icsDate(e));
      alarms = ['-PT15H', 'PT9H'];
    }
    lines.push('SUMMARY:' + icsEscape(title), 'DESCRIPTION:' + icsEscape(desc));
    for (const a of alarms) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(title), 'TRIGGER:' + a, 'END:VALARM');
    lines.push('END:VEVENT');
    return lines;
  }

  // ---- これから必要なお金 ----
  // 未完了で金額が入っている予定を、期限順に並べて「○月末までに累計いくら」を出す
  function neededMoney(events, now) {
    const items = sortEvents((events || []).filter((e) => !e.done && Number(e.amount) > 0 && eventDue(e)));
    const byMonth = [];
    let total = 0;
    for (const e of items) {
      const a = Math.round(Number(e.amount));
      total += a;
      const key = monthKey(e.date);
      const last = byMonth[byMonth.length - 1];
      if (last && last.key === key) { last.sum += a; last.cum = total; }
      else byMonth.push({ key, sum: a, cum: total });
    }
    const overdue = items.filter((e) => urgency(e, now) === 'over').reduce((s, e) => s + Math.round(Number(e.amount)), 0);
    return { items, total, byMonth, overdue };
  }

  // ---- 推しとハッシュタグ ----
  const toHalfAll = (s) => toHalf(s).replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const normTag = (s) => toHalfAll(s).replace(/^[#＃]+/, '').trim();

  // 「#ナルト ＃NARUTO、ナルト」→ ['ナルト', 'NARUTO']（重複なし）
  function parseTags(text) {
    const out = [];
    for (const p of String(text || '').split(/[\s,、#＃]+/)) {
      const t = normTag(p);
      if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
    }
    return out;
  }

  // 昔の形（文字だけ）の推しを {name, tags} に直す
  function normalizeOshis(list) {
    return (list || []).map((o) => (typeof o === 'string' ? { name: o, tags: [o] } : { name: o.name, tags: o.tags || [] })).filter((o) => o.name);
  }

  // 検索：タイトル・メモ・推し・販売場所・タグ・読み取った文章のどれかに入っていればヒット。
  // 推しの名前かタグで検索した時は、その推しの記録も全部ヒットさせる
  function matchRecord(rec, q, oshis) {
    const k = normTag(q).toLowerCase();
    if (!k) return true;
    const hay = [rec.title, rec.memo, rec.oshi, rec.shop, (rec.tags || []).join(' '), rec.source].join(' ');
    const hayL = toHalfAll(hay).toLowerCase();
    if (hayL.includes(k)) return true;
    const o = (oshis || []).find((x) => x.name.toLowerCase() === k || (x.tags || []).some((t) => t.toLowerCase() === k));
    if (!o) return false;
    if (rec.oshi === o.name) return true;
    return [o.name].concat(o.tags || []).some((t) => hayL.includes(t.toLowerCase()));
  }

  function searchAll(state, q, now) {
    const oshis = normalizeOshis(state.oshis);
    const evs = (state.events || []).filter((e) => matchRecord(e, q, oshis));
    const upcoming = sortEvents(evs.filter((e) => !e.done && urgency(e, now) !== 'over'));
    const past = sortEvents(evs.filter((e) => e.done || urgency(e, now) === 'over')).reverse();
    const nextRelease = upcoming.find((e) => e.type === 'release') || null;
    const expenses = (state.expenses || []).filter((e) => matchRecord(e, q, oshis)).sort((a, b) => (a.date < b.date ? 1 : -1));
    const expenseTotal = expenses.reduce((s, e) => s + Math.round(Number(e.amount) || 0), 0);
    return { upcoming, past, nextRelease, expenses, expenseTotal };
  }

  // ---- スクショ・投稿の文章から予定を抜き出す ----
  function normText(s) {
    return toHalfAll(s)
      .replace(/[／]/g, '/').replace(/[：]/g, ':').replace(/[（]/g, '(').replace(/[）]/g, ')')
      .replace(/[～〜]/g, '~').replace(/[＃]/g, '#').replace(/[￥]/g, '¥').replace(/[，]/g, ',').replace(/[．]/g, '.')
      .replace(/　/g, ' ')
      .replace(/#\s+(?=\S)/g, '#'); // OCRで「# ちいかわ」とスペースが入るのを直す
  }

  // [種類, キーワード]。上から順に判定（「抽選受付」は抽選、「予約受付」は発売、など）
  const KEYWORDS = [
    ['result', /当落|当選発表|結果発表|当選者発表|当選通知/],
    ['pay', /入金|支払|払込|決済期限|払い込み/],
    ['lottery', /抽選|応募|エントリー|先行受付|申込|申し込み/],
    ['show', /公演|開演|開場|ライブ|LIVE|コンサート|上映|ファンミ|握手会|サイン会/i],
    ['release', /発売|販売|予約|受注|再販|入荷|ポップアップ|POP ?UP|オープン|OPEN|開催|登場|出荷|お届け|配信開始|スタート/i],
  ];
  const SHOPS = ['アニメイト', 'ジャンプショップ', 'ちいかわらんど', 'ポケモンセンター', 'ローソン', 'セブン-イレブン', 'セブンイレブン',
    'ファミリーマート', 'ファミマ', 'ミニストップ', 'Amazon', '楽天', 'ヴィレッジヴァンガード', 'ヴィレヴァン', 'ロフト', 'LOFT',
    'ハンズ', 'キデイランド', 'タワーレコード', 'HMV', 'TSUTAYA', 'ゲーマーズ', 'らしんばん', 'ドン・キホーテ', 'イオン', 'しまむら',
    'GU', 'ユニクロ', 'UNIQLO', 'サンリオ', '一番くじ', 'プレミアムバンダイ', 'プレバン', 'ムービック', 'グッドスマイル', 'あみあみ',
    '公式オンラインショップ', '公式通販', 'オンラインショップ', '通販', 'コラボカフェ', 'ガチャ', 'ゲームセンター', 'ゲーセン'];

  const DATE_RE = /(?:(\d{4})\s*[年\/.\-]\s*)?(\d{1,2})\s*([月\/.])\s*(\d{1,2})\s*日?(\s*\(\s*[^()\s]{1,3}\s*\))?(?:\s*(\d{1,2})\s*(?::\s*(\d{2})|時\s*(?:(\d{1,2})\s*分?)?))?/g;
  const PRICE_RE = /¥\s?(\d{1,3}(?:[,.]\d{3})+|\d{2,7})|(\d{1,3}(?:[,.]\d{3})+|\d{2,7})\s?円/;

  function findDates(line, now) {
    const out = [];
    DATE_RE.lastIndex = 0;
    let m;
    while ((m = DATE_RE.exec(line))) {
      const [all, y, mo, sep, d, week, h, mi1, mi2] = m;
      // 「12.5cm」のような数字を日付と間違えないよう、「.」区切りは年か曜日がある時だけ
      if (sep === '.' && !y && !week) continue;
      const month = +mo, day = +d;
      if (month < 1 || month > 12 || day < 1 || day > 31) continue;
      let year = y ? +y : now.getFullYear();
      if (!y && new Date(year, month - 1, day) < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90)) year++;
      let time = '';
      if (h != null) {
        let hh = +h, mm = +(mi1 || mi2 || 0);
        if (hh >= 24) { hh = 23; mm = 59; }
        if (mm < 60) time = pad(hh) + ':' + pad(mm);
      }
      out.push({ date: year + '-' + pad(month) + '-' + pad(day), time, index: m.index, end: m.index + all.length });
    }
    return out;
  }

  function keywordType(line) {
    for (const [type, re] of KEYWORDS) if (re.test(line)) return type;
    return null;
  }

  function findPrice(line) {
    if (/送料/.test(line) && !/円.*円/.test(line)) return null;
    const m = PRICE_RE.exec(line);
    return m ? parseInt((m[1] || m[2]).replace(/[,.]/g, ''), 10) : null;
  }

  function extractInfo(text, now) {
    const src = normText(text);
    const lines = src.split(/\r?\n/).map((l) => l.trim());
    const tags = [];
    for (const m of src.matchAll(/#([^\s#,、。!?()「」【】]+)/g)) {
      if (!tags.some((t) => t.toLowerCase() === m[1].toLowerCase())) tags.push(m[1]);
    }
    const noTags = src.replace(/#[^\s#]+/g, ' ');

    // 販売場所：店名のリスト ＋「会場:」「販売場所:」などの行
    const shops = [];
    for (const s of SHOPS) if (noTags.includes(s) && !shops.some((x) => x.includes(s))) shops.push(s);
    for (const l of lines) {
      const m = /^[■●◆・◎★☆【\[]?\s*(?:販売場所|販売店舗|取扱店舗|取扱店|取り扱い店舗|会場|場所|販売方法)\s*[】\]]?\s*[:・\s]\s*(.+)$/.exec(l);
      if (m && m[1].trim() && !shops.includes(m[1].trim())) shops.unshift(m[1].trim().slice(0, 40));
    }

    // 値段
    const prices = [];
    for (const l of lines) { const p = findPrice(l); if (p != null) prices.push(p); }

    // タイトル：【】「」がある行を優先。なければ日付の無い最初の行
    const cand = lines.filter((l) => l && !/^#/.test(l) && !findDates(l, now).length);
    let title = cand.find((l) => /【.+】|「.+」/.test(l)) || cand.find((l) => l.replace(/#[^\s#]+/g, '').trim().length >= 4) || '';
    title = title.replace(/#[^\s#]+/g, '').trim().slice(0, 40);

    // 予定：日付がある行ごとに、その行（なければ1つ上の行）の言葉で種類を決める
    const events = [];
    let prev = '';
    for (const l of lines) {
      if (!l) continue;
      const ds = findDates(l, now);
      if (!ds.length) { prev = l; continue; }
      const type = keywordType(l) || keywordType(prev) || 'other';
      const price = findPrice(l);
      const isRange = ds.length >= 2 && /~|-|から|まで/.test(l.slice(ds[0].end, ds[1].index));
      // 「11/3〜11/16 10:00〜20:00」は営業時間なので、開始日に10:00、終了日に20:00を付ける
      const last = ds[ds.length - 1];
      const tail = /^\s*~\s*(\d{1,2}):(\d{2})/.exec(l.slice(last.end));
      if (isRange && !ds[0].time && last.time && tail) { ds[0].time = last.time; last.time = pad(Math.min(+tail[1], 23)) + ':' + tail[2]; }
      ds.forEach((d, i) => {
        const isEnd = isRange && i === ds.length - 1;
        const isStart = isRange && i === 0;
        // 抽選・入金は「終わりの日」が締切。発売・公演は「始まりの日」が大事
        const deadlineType = type === 'lottery' || type === 'pay';
        const checked = !isRange || (deadlineType ? isEnd : isStart);
        const label = isStart ? (deadlineType ? '受付開始' : '開始') : isEnd ? (deadlineType ? '締切' : '終了') : '';
        if (events.some((e) => e.date === d.date && e.time === d.time && e.type === type)) return;
        events.push({ type, date: d.date, time: d.time, label, amount: price, checked, line: l });
      });
      prev = l;
    }
    // 値段が1つしか書いてなければ、入金・発売の予定にその値段を入れる
    const single = prices.length && prices.every((p) => p === prices[0]) ? prices[0] : null;
    for (const e of events) if (e.amount == null) e.amount = single && ['pay', 'release'].includes(e.type) ? single : 0;

    return { title, tags, shops, shop: shops.join('・'), prices, events };
  }

  // バックアップを読み込むときの形チェック
  function validBackup(d) {
    return !!d && Array.isArray(d.events) && Array.isArray(d.expenses);
  }

  const Calc = { EVENT_TYPES, CATS, typeInfo, catName, parseYen, yen, ymd, parseDate, eventDue, daysUntil, urgency, untilLabel, dateLabel, sortEvents, monthKey, shiftMonth, monthSummary, buildICS, buildICSMulti, fold, validBackup,
    neededMoney, parseTags, normalizeOshis, matchRecord, searchAll, extractInfo, normText };
  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else root.Calc = Calc;
})(typeof self !== 'undefined' ? self : this);
