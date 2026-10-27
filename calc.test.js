// 計算テスト： node calc.test.js で実行
const assert = require('assert');
const C = require('./calc.js');

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { console.error('✗ ' + name + '\n  ' + e.message); process.exitCode = 1; }
}

const now = new Date(2026, 9, 27, 12, 0); // 2026/10/27(火) 12:00

t('金額の入力：全角・カンマ・円・¥ を読める', () => {
  assert.strictEqual(C.parseYen('１２，０００円'), 12000);
  assert.strictEqual(C.parseYen('¥8,800'), 8800);
  assert.strictEqual(C.parseYen(' 500 '), 500);
  assert.strictEqual(C.parseYen('abc'), null);
  assert.strictEqual(C.parseYen(''), null);
  assert.strictEqual(C.parseYen('-300'), null);
});

t('金額の表示', () => {
  assert.strictEqual(C.yen(59000), '¥59,000');
  assert.strictEqual(C.yen(0), '¥0');
});

t('何日後か', () => {
  assert.strictEqual(C.daysUntil('2026-10-27', now), 0);
  assert.strictEqual(C.daysUntil('2026-10-28', now), 1);
  assert.strictEqual(C.daysUntil('2026-11-03', now), 7);
  assert.strictEqual(C.daysUntil('2026-10-26', now), -1);
});

t('急ぎ具合：期限切れ・今日・3日以内・まだ先・完了', () => {
  assert.strictEqual(C.urgency({ date: '2026-10-27', time: '10:00' }, now), 'over');
  assert.strictEqual(C.urgency({ date: '2026-10-27' }, now), 'today'); // 時刻なしは23:59まで
  assert.strictEqual(C.urgency({ date: '2026-10-30' }, now), 'soon');
  assert.strictEqual(C.urgency({ date: '2026-10-31' }, now), 'later');
  assert.strictEqual(C.urgency({ date: '2026-10-20', done: true }, now), 'done');
});

t('残り表示', () => {
  assert.strictEqual(C.untilLabel({ date: '2026-10-27', time: '23:00' }, now), '今日・あと11時間');
  assert.strictEqual(C.untilLabel({ date: '2026-10-27', time: '12:30' }, now), '今日・まもなく');
  assert.strictEqual(C.untilLabel({ date: '2026-10-28' }, now), '明日');
  assert.strictEqual(C.untilLabel({ date: '2026-11-01' }, now), 'あと5日');
  assert.strictEqual(C.untilLabel({ date: '2026-10-01' }, now), '期限切れ');
});

t('日付の表示', () => {
  assert.strictEqual(C.dateLabel({ date: '2026-10-30', time: '23:59' }), '10/30(金) 23:59');
});

t('期限が近い順。同じ日なら時刻が早い方が先', () => {
  const s = C.sortEvents([
    { id: 'a', date: '2026-11-05' },
    { id: 'b', date: '2026-10-28', time: '18:00' },
    { id: 'c', date: '2026-10-28', time: '10:00' },
    { id: 'd', date: '' },
  ]);
  assert.deepStrictEqual(s.map((e) => e.id), ['c', 'b', 'a', 'd']);
});

t('月の集計：予算3万円で 遠征5.9万円 → 2.9万円オーバー', () => {
  const ex = [
    { date: '2026-10-03', amount: 12000, cat: 'ticket', oshi: 'A' },
    { date: '2026-10-03', amount: 25000, cat: 'travel', oshi: 'A' },
    { date: '2026-10-04', amount: 15000, cat: 'hotel', oshi: 'A' },
    { date: '2026-10-04', amount: 7000, cat: 'goods' },
    { date: '2026-09-30', amount: 99999, cat: 'goods' }, // 先月分は入らない
  ];
  const s = C.monthSummary(ex, '2026-10', 30000);
  assert.strictEqual(s.total, 59000);
  assert.strictEqual(s.count, 4);
  assert.strictEqual(s.remain, -29000);
  assert.strictEqual(s.byCat.travel, 25000);
  assert.strictEqual(s.byOshi.A, 52000);
  assert.strictEqual(s.byOshi['推し未設定'], 7000);
});

t('予算0なら「予算なし」扱い', () => {
  const s = C.monthSummary([{ date: '2026-10-01', amount: 100 }], '2026-10', 0);
  assert.strictEqual(s.remain, null);
  assert.strictEqual(s.ratio, null);
});

t('月の切り替え（年またぎ）', () => {
  assert.strictEqual(C.shiftMonth('2026-12', 1), '2027-01');
  assert.strictEqual(C.shiftMonth('2026-01', -1), '2025-12');
});

t('カレンダー用ファイル：時刻ありは前日と3時間前にアラーム', () => {
  const ics = C.buildICS({ id: 'x1', type: 'pay', title: 'ドームツアー大阪', oshi: 'A', date: '2026-10-30', time: '23:59', amount: 12000 }, now);
  assert.ok(ics.includes('DTSTART:20261030T235900'));
  assert.ok(ics.includes('TRIGGER:-P1D'));
  assert.ok(ics.includes('TRIGGER:-PT3H'));
  assert.ok(ics.includes('BEGIN:VCALENDAR') && ics.trim().endsWith('END:VCALENDAR'));
  assert.ok(ics.replace(/\r\n /g, '').includes('SUMMARY:【入金期限】ドームツアー大阪（A）'));
});

t('カレンダー用ファイル：時刻なしは終日＋前日9時と当日9時', () => {
  const ics = C.buildICS({ id: 'x2', type: 'lottery', title: 'FC先行', date: '2026-11-01' }, now);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261101'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20261102'));
  assert.ok(ics.includes('TRIGGER:-PT15H') && ics.includes('TRIGGER:PT9H'));
});

t('カレンダー用ファイル：長い行は75バイト以内に折り返す', () => {
  const ics = C.buildICS({ id: 'x3', type: 'show', title: 'あ'.repeat(60), memo: 'カンマ,セミコロン;改行\nあり', date: '2026-11-01' }, now);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line);
  assert.ok(ics.replace(/\r\n /g, '').includes('カンマ\\,セミコロン\\;改行\\nあり'));
});

t('バックアップの形チェック', () => {
  assert.ok(C.validBackup({ events: [], expenses: [] }));
  assert.ok(!C.validBackup({ events: [] }));
  assert.ok(!C.validBackup(null));
});

console.log(`\n${passed} 件合格`);
