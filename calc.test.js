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

t('複数の予定を1つのカレンダーファイルにまとめる', () => {
  const ics = C.buildICSMulti([{ id: 'a', type: 'pay', date: '2026-11-01' }, { id: 'b', type: 'release', date: '2026-11-03', time: '10:00', shop: 'アニメイト' }], now);
  assert.strictEqual(ics.split('BEGIN:VEVENT').length - 1, 2);
  assert.strictEqual(ics.split('BEGIN:VCALENDAR').length - 1, 1);
  assert.ok(ics.replace(/\r\n /g, '').includes('販売場所: アニメイト'));
});

t('これから必要なお金：月ごとの累計', () => {
  const r = C.neededMoney([
    { date: '2026-11-15', amount: 9800 },
    { date: '2026-11-03', amount: 1980 },
    { date: '2026-12-01', amount: 5000 },
    { date: '2026-11-20', amount: 3000, done: true }, // 完了は入らない
    { date: '2026-11-21', amount: 0 }, // 金額なしは入らない
  ], now);
  assert.strictEqual(r.total, 16780);
  assert.deepStrictEqual(r.byMonth, [{ key: '2026-11', sum: 11780, cum: 11780 }, { key: '2026-12', sum: 5000, cum: 16780 }]);
});

t('タグの入力：# あり・なし・全角・重複', () => {
  assert.deepStrictEqual(C.parseTags('#ナルト ＃ＮＡＲＵＴＯ、ナルト naruto'), ['ナルト', 'NARUTO']);
});

t('昔の推し（文字だけ）を新しい形に直す', () => {
  assert.deepStrictEqual(C.normalizeOshis(['ちいかわ', { name: 'ナルト', tags: ['NARUTO'] }]), [{ name: 'ちいかわ', tags: ['ちいかわ'] }, { name: 'ナルト', tags: ['NARUTO'] }]);
});

t('検索：#ちいかわ で、推し・タグ・本文どれでもヒット', () => {
  const oshis = [{ name: 'ちいかわ', tags: ['ちいかわ', 'chiikawa'] }];
  assert.ok(C.matchRecord({ title: 'ぬいぐるみ', oshi: 'ちいかわ' }, '#ちいかわ', oshis));
  assert.ok(C.matchRecord({ title: 'ぬいぐるみ', tags: ['chiikawa'] }, 'ちいかわ', oshis));
  assert.ok(C.matchRecord({ title: 'ちいかわ ポップアップ' }, '＃ちいかわ', oshis));
  assert.ok(!C.matchRecord({ title: 'ナルト 一番くじ' }, '#ちいかわ', oshis));
  assert.ok(C.matchRecord({ title: 'x' }, '', oshis)); // 空なら全部
});

t('検索：次の発売日が分かる', () => {
  const st = { oshis: ['ちいかわ'], expenses: [{ date: '2026-10-01', amount: 1500, oshi: 'ちいかわ' }], events: [
    { id: '1', type: 'release', title: '旧グッズ', oshi: 'ちいかわ', date: '2026-09-01', done: true },
    { id: '2', type: 'release', title: 'マスコット', oshi: 'ちいかわ', date: '2026-11-10' },
    { id: '3', type: 'release', title: 'ぬいぐるみ', oshi: 'ちいかわ', date: '2026-11-03' },
    { id: '4', type: 'release', title: 'ナルト', oshi: 'ナルト', date: '2026-11-01' },
  ] };
  const r = C.searchAll(st, '#ちいかわ', now);
  assert.strictEqual(r.nextRelease.title, 'ぬいぐるみ');
  assert.deepStrictEqual(r.upcoming.map((e) => e.id), ['3', '2']);
  assert.deepStrictEqual(r.past.map((e) => e.id), ['1']);
  assert.strictEqual(r.expenseTotal, 1500);
});

t('読み取り：ポップアップの告知文', () => {
  const r = C.extractInfo([
    '【ちいかわ】ポップアップストア開催決定！',
    '11/3(火)〜11/16(月) 10:00〜20:00',
    '会場：〇〇百貨店 7F',
    'ぬいぐるみ １，９８０円(税込)',
    '#ちいかわ #ちいかわらんど',
  ].join('\n'), now);
  assert.strictEqual(r.title, '【ちいかわ】ポップアップストア開催決定!'.replace('!', '！'));
  assert.deepStrictEqual(r.tags, ['ちいかわ', 'ちいかわらんど']);
  assert.strictEqual(r.shop, '〇〇百貨店 7F'); // ハッシュタグの中の店名は拾わない
  assert.deepStrictEqual(r.events.map((e) => [e.type, e.date, e.time, e.label, e.checked, e.amount]), [
    ['release', '2026-11-03', '10:00', '開始', true, 1980],
    ['release', '2026-11-16', '20:00', '終了', false, 1980],
  ]);
});

t('読み取り：チケットの抽選・当落・入金', () => {
  const r = C.extractInfo([
    'NARUTO ライブイベント',
    'FC先行抽選受付：2026年11月1日(日)12:00〜11月8日(日)23:59',
    '当落発表：11月12日(木)18:00',
    '入金期間：11月12日(木)18:00〜11月15日(日)23:59',
    'チケット代 9,800円',
    '#ナルト #NARUTO',
  ].join('\n'), now);
  assert.deepStrictEqual(r.events.map((e) => [e.type, e.date, e.time, e.label, e.checked, e.amount]), [
    ['lottery', '2026-11-01', '12:00', '受付開始', false, 0],
    ['lottery', '2026-11-08', '23:59', '締切', true, 0],
    ['result', '2026-11-12', '18:00', '', true, 0],
    ['pay', '2026-11-12', '18:00', '受付開始', false, 9800],
    ['pay', '2026-11-15', '23:59', '締切', true, 9800],
  ]);
  assert.strictEqual(r.title, 'NARUTO ライブイベント');
});

t('読み取り：見出しの次の行に日付 / 年またぎ / 12.5cm は日付にしない', () => {
  const r = C.extractInfo('■予約締切\n1月10日(土)23:59まで\nサイズ 約12.5cm\n価格 ¥2,200', now);
  assert.deepStrictEqual(r.events.map((e) => [e.type, e.date, e.time]), [['release', '2027-01-10', '23:59']]);
  assert.strictEqual(r.events[0].amount, 2200);
});

t('読み取り：スクショ読み取り（OCR）の読み間違いがあっても拾える', () => {
  // 実際に無料OCRで読んだ結果そのまま
  const r = C.extractInfo('【ちいかわ】ポップアップストア開催 !\n11/3(X)~11/16(H) 10:00~20:00\n会場・大阪百貨店 7F\n\nぬいぐるみ 1.980 円 (税込 )\n\n# ちいかわ', now);
  assert.deepStrictEqual(r.events.map((e) => [e.date, e.time, e.amount]), [['2026-11-03', '10:00', 1980], ['2026-11-16', '20:00', 1980]]);
  assert.strictEqual(r.shop, '大阪百貨店 7F');
  assert.deepStrictEqual(r.tags, ['ちいかわ']);
});

console.log(`\n${passed} 件合格`);
