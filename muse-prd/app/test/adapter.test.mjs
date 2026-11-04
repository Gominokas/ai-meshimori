// AIメシモリ Muse版 — テンプレート流し込みアダプタの検証
// 実行: node muse-prd/app/test/adapter.test.mjs

import assert from 'node:assert/strict';
import { createMemoryStore, createActions } from '../server/actions.js';
import { buildTemplateData } from '../server/template-adapter.js';

const store = createMemoryStore();
const a = createActions(store);
a.update_settings({ current_tz: 'Asia/Tokyo', target_kcal: 2000, week_start: 1 });
a.upsert_meal({ external_id: 'meal-20261104-asa-01', date: '2026-11-04', eaten_time: '07:30', meal_type: '朝食', status: 'actual', menu: '納豆ご飯', kcal: 450, kcal_pm: 30, report_source: '写真', emoji: '🍚', place: '自宅' });
a.upsert_meal({ external_id: 'meal-20261104-yuu-01', date: '2026-11-04', meal_type: '夕食', status: 'planned', menu: '鍋', kcal: 900, kcal_pm: 100, report_source: '申告' });
a.upsert_meal({ external_id: 'meal-20261105-asa-01', date: '2026-11-05', tz: 'America/Los_Angeles', eaten_time: '08:00', meal_type: '朝食', status: 'actual', menu: 'LA朝食', kcal: 600, kcal_pm: 0, report_source: '写真' });
a.upsert_day({ external_id: 'daily-20261104-tokyo', date: '2026-11-04', weight_kg: 80.2, body_fat_pct: 25.1, bmi: 24.0, emoji: '🐷' });
a.upsert_day({ external_id: 'daily-20261105-losangeles', date: '2026-11-05', tz: 'America/Los_Angeles', weight_kg: 79.5 });

const data = buildTemplateData(a);

assert.equal(data.TARGET, 2000);
assert.equal(data.selectedDate, '2026-11-05');
console.log('ok 1 - TARGET / selectedDate');

// DAYS の行形式: [時刻, 区分, タグ, メニュー, kcal, ±, 状態, メモ, 場所]
const rows = data.DAYS['2026-11-04'].meals;
assert.deepEqual(rows[0], ['07:30', '朝食', '', '納豆ご飯', 450, 30, 'a', '', '自宅']);
assert.deepEqual(rows[1], ['--:--', '夕食', '', '鍋', 900, 100, 'p', '', '']);
console.log('ok 2 - DAYS の行形式（時刻なしは --:--、状態は a/p/s）');

// 体重文字列は原本生成器と同じ書式
assert.equal(data.DAYS['2026-11-04'].w, '⚖️ 80.2kg ・ 体脂肪 25.1% ・ BMI 24');
console.log('ok 3 - 体重文字列の書式');

// TOT / SHORT は actual のある日だけ
assert.equal(data.TOT['2026-11-04'], 450);
assert.equal(data.SHORT['2026-11-04'], '納豆ご飯');
assert.equal(data.TOT['2026-11-05'], 600);
console.log('ok 4 - TOT / SHORT');

// スタンプ
assert.equal(data.DAY_EMOJI['2026-11-04'], '🐷');
assert.equal(data.MEAL_EMOJI['2026-11-04|07:30'], '🍚');
console.log('ok 5 - MEAL_EMOJI / DAY_EMOJI');

// WEIGHTS は [日付, 体重, 体脂肪]、複数 tz も行として残る
assert.deepEqual(data.WEIGHTS, [['2026-11-04', 80.2, 25.1], ['2026-11-05', 79.5, null]]);
console.log('ok 6 - WEIGHTS');

console.log('\nAdapter test passed.');
