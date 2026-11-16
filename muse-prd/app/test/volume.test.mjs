// AIメシモリ Muse版 — 大量データの検証
// 実行: node muse-prd/app/test/volume.test.mjs
// 417日・1,273食規模（リポジトリ版の重いテストと同規模の合成データ）を
// import し、月集計を「アクション層を通さない独立計算」と突合する。

import assert from 'node:assert/strict';
import { createMemoryStore, createActions } from '../server/actions.js';

// 決定的な疑似乱数（再現性のため）
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pickOne = (arr) => arr[Math.floor(rnd() * arr.length)];

const TYPES = ['朝食', '昼食', '夕食', 'おやつ', '夜食'];
const SLUG = { '朝食': 'asa', '昼食': 'hiru', '夕食': 'yuu', 'おやつ': 'oyatsu', '夜食': 'yashoku' };
const MENUS = ['定食', '弁当', '麺類', 'カレー', 'サラダ', 'パンセット', '丼もの', '鍋'];

const meals = [];
const days = [];
const start = new Date('2025-09-14T00:00:00Z');
for (let i = 0; i < 417; i++) {
  const d = new Date(start.getTime() + i * 86400000);
  const date = d.toISOString().slice(0, 10);
  const ymd = date.replaceAll('-', '');
  days.push({
    external_id: `daily-${ymd}-tokyo`, date, tz: 'Asia/Tokyo',
    weight_kg: Math.round((100 - i * 0.01) * 10) / 10,
    emoji: pickOne(['🍚', '🍜', '🍛', '🐟']),
  });
  const perDay = 2 + Math.floor(rnd() * 3); // 2〜4食
  const usedTypes = new Set();
  const serialBySlug = {};
  for (let j = 0; j < perDay; j++) {
    let type = pickOne(TYPES);
    if (usedTypes.has(type)) type = 'その他';
    usedTypes.add(type);
    const slug = SLUG[type] ?? 'other';
    serialBySlug[slug] = (serialBySlug[slug] ?? 0) + 1;
    const serial = String(serialBySlug[slug]).padStart(2, '0');
    const status = rnd() < 0.08 ? 'skipped' : rnd() < 0.05 ? 'planned' : 'actual';
    meals.push({
      external_id: `meal-${ymd}-${slug}-${serial}`, date, tz: 'Asia/Tokyo',
      eaten_time: type === '朝食' ? '08:00' : type === '昼食' ? '12:30' : type === '夕食' ? '19:00' : null,
      meal_type: type, status,
      menu: pickOne(MENUS),
      kcal: status === 'skipped' ? 0 : 300 + Math.floor(rnd() * 900),
      kcal_pm: Math.floor(rnd() * 80),
      report_source: pickOne(['レシート', '写真', '申告', 'レシピ']),
    });
  }
}
console.log(`generated: ${days.length} days, ${meals.length} meals`);

const store = createMemoryStore();
const a = createActions(store);
a.update_settings({ current_tz: 'Asia/Tokyo' });

const t0 = performance.now();
const summary = a.import_records({ meals, days });
const t1 = performance.now();
console.log(`import: ${(t1 - t0).toFixed(0)}ms`);

// 独立計算（アクション層を通さない）で全日合計を作り、import の突合サマリと比べる
const expected = {};
for (const m of meals) if (m.status === 'actual') expected[m.date] = (expected[m.date] ?? 0) + m.kcal;
assert.deepEqual(summary.actual_kcal_by_date, expected);
assert.equal(summary.weight_days, 417);
console.log('ok - import 突合サマリが独立計算と一致');

// 全ての月について get_month の日別合計を独立計算と突合
const months = [...new Set(meals.map((m) => m.date.slice(0, 7)))];
const t2 = performance.now();
for (const mo of months) {
  const view = a.get_month(mo);
  for (const cell of view.days) {
    assert.equal(cell.actual_kcal, expected[cell.date] ?? 0, `${cell.date} の月ビュー合計`);
  }
  assert.equal(view.weights.length, 417, '体重系列は全期間分');
}
const t3 = performance.now();
console.log(`ok - 全 ${months.length} ヶ月分の月ビューが独立計算と一致（get_month 平均 ${((t3 - t2) / months.length).toFixed(1)}ms/月）`);

// export の件数
const out = a.export_records();
assert.equal(out.meals.length, meals.length);
assert.equal(out.days.length, days.length);
console.log('ok - export 件数一致');

console.log('\nVolume test passed.');
