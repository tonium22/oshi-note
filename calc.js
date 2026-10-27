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
    const t = typeInfo(ev.type);
    const title = '【' + t[1] + '】' + (ev.title || '') + (ev.oshi ? '（' + ev.oshi + '）' : '');
    const desc = [ev.amount ? '金額: ' + yen(ev.amount) : '', ev.memo || '', '推し活ノートから追加'].filter(Boolean).join('\n');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//oshi-note//JA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', 'UID:' + ev.id + '@oshi-note', 'DTSTAMP:' + icsUtc(now)];
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
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  // バックアップを読み込むときの形チェック
  function validBackup(d) {
    return !!d && Array.isArray(d.events) && Array.isArray(d.expenses);
  }

  const Calc = { EVENT_TYPES, CATS, typeInfo, catName, parseYen, yen, ymd, parseDate, eventDue, daysUntil, urgency, untilLabel, dateLabel, sortEvents, monthKey, shiftMonth, monthSummary, buildICS, fold, validBackup };
  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else root.Calc = Calc;
})(typeof self !== 'undefined' ? self : this);
