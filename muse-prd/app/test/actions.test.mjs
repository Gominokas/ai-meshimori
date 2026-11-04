// AIメシモリ Muse版 — 実地確認リストの自動テスト
// 実行: node muse-prd/app/test/actions.test.mjs
// app-port-design.md §5 の確認項目のうち、プログラムで検証できるものを assert する。
// 構築したアーティファクトでも、同等の項目を実物で確認すること（§5 の本文が正）。

import assert from 'node:assert/strict';
import { createMemoryStore, createActions } from '../server/actions.js';

const store = createMemoryStore();
const a = createActions(store);
let passed = 0;
const ok = (name) => { passed += 1; console.log(`ok ${passed} - ${name}`); };

// 1. 初期状態: 設定は全て未設定（個人の値が入っていない）
assert.deepEqual(a.get_settings(), { target_kcal: null, current_tz: null, week_start: null, spec_version: null });
ok('初期状態は全て未設定');

// 初期設定（その家の AI が決める値。ここではテスト用の架空値）
a.update_settings({ current_tz: 'Asia/Tokyo', target_kcal: 2000, week_start: 1, spec_version: '0.1.0' });

// 10. update_settings は渡した項目だけ変わる
a.update_settings({ target_kcal: 2100 });
assert.equal(a.get_settings().target_kcal, 2100);
assert.equal(a.get_settings().current_tz, 'Asia/Tokyo');
ok('update_settings は部分更新');

// 2. 採番: 同日・同区分で連番が進む
const id1 = a.next_meal_external_id('2026-11-04', '夕食');
assert.equal(id1, 'meal-20261104-yuu-01');
a.upsert_meal({ external_id: id1, date: '2026-11-04', eaten_time: '19:00', meal_type: '夕食', status: 'actual', menu: 'テスト定食', kcal: 800, kcal_pm: 50, report_source: '申告', emoji: '🍚' });
assert.equal(a.next_meal_external_id('2026-11-04', '夕食'), 'meal-20261104-yuu-02');
ok('採番が進む');

// 5. tz: 省略時は settings.current_tz で焼き込まれる
const saved = a.get_day('2026-11-04').sections[0].meals[0];
assert.equal(saved.tz, 'Asia/Tokyo');
ok('tz が焼き込まれる');

// 5. tz: 既存と食い違う tz の upsert はエラー
assert.throws(() => a.upsert_meal({ external_id: id1, date: '2026-11-04', tz: 'America/Los_Angeles', meal_type: '夕食', status: 'actual', menu: 'x', kcal: 1, kcal_pm: 0, report_source: '申告' }), /tz mismatch/);
ok('tz 不一致の upsert はエラー');

// 3. 集計: actual のみ合計、レンジは ± の合計、planned は別枠
a.upsert_meal({ external_id: 'meal-20261104-asa-01', date: '2026-11-04', eaten_time: '08:00', meal_type: '朝食', status: 'actual', menu: 'トースト', kcal: 400, kcal_pm: 40, report_source: '写真' });
a.upsert_meal({ external_id: 'meal-20261104-yuu-02', date: '2026-11-04', meal_type: '夕食', status: 'planned', menu: '明日の予定ではない', kcal: 600, kcal_pm: 0, report_source: '申告' });
const day = a.get_day('2026-11-04');
assert.equal(day.summary.actual_kcal, 1200);
assert.deepEqual(day.summary.actual_range, { low: 1110, high: 1290 });
assert.equal(day.summary.planned_kcal, 600);
assert.equal(day.summary.planned_count, 1);
ok('actual 合計・レンジ・planned 別枠');

// 4. skipped: kcal=0 で登録でき合計に入らない。kcal≠0 はエラー
a.upsert_meal({ external_id: 'meal-20261104-oyatsu-01', date: '2026-11-04', meal_type: 'おやつ', status: 'skipped', kcal: 0, kcal_pm: 0, report_source: '申告' });
assert.equal(a.get_day('2026-11-04').summary.actual_kcal, 1200);
assert.throws(() => a.upsert_meal({ external_id: 'meal-20261104-oyatsu-02', date: '2026-11-04', meal_type: 'おやつ', status: 'skipped', kcal: 100, kcal_pm: 0, report_source: '申告' }), /skipped meal must have kcal=0/);
ok('skipped の扱い');

// 並び: 時刻ありは時刻順に先、時刻なし同士は区分順（仕様 §2: おやつ が 夕食 より前）
const untimed = a.get_day('2026-11-04').sections[0].meals.filter((m) => !m.eaten_time).map((m) => m.meal_type);
assert.deepEqual(untimed, ['おやつ', '夕食'], `時刻なしの区分順が仕様どおりでない: ${untimed}`);
ok('時刻なしの区分順（仕様 §2）');

// 6. 日次: 部分送信で既存値を保持、明示的 null で消える
a.upsert_day({ external_id: 'daily-20261104-tokyo', date: '2026-11-04', weight_kg: 80.5 });
a.upsert_day({ external_id: 'daily-20261104-tokyo', date: '2026-11-04', steps: 9000, exercise_minutes: 30 });
let dayRec = a.get_day('2026-11-04').sections[0].day;
assert.equal(dayRec.weight_kg, 80.5);
assert.equal(dayRec.steps, 9000);
a.upsert_day({ external_id: 'daily-20261104-tokyo', date: '2026-11-04', steps: null });
dayRec = a.get_day('2026-11-04').sections[0].day;
assert.equal(dayRec.steps, undefined);
assert.equal(dayRec.weight_kg, 80.5);
ok('upsert_day の部分保持と null クリア');

// 8. 月表示: 代表メニュー・スタンプ・予定のみの日
const month = a.get_month('2026-11');
const cell = month.days.find((d) => d.date === '2026-11-04');
assert.equal(cell.representative_menu, 'テスト定食');
assert.equal(cell.stamp, '🍚'); // days.emoji が無いので代表メニューの emoji
a.upsert_meal({ external_id: 'meal-20261105-hiru-01', date: '2026-11-05', meal_type: '昼食', status: 'planned', menu: '予定ランチ', kcal: 500, kcal_pm: 0, report_source: '申告', emoji: '🍜' });
const cell2 = a.get_month('2026-11').days.find((d) => d.date === '2026-11-05');
assert.equal(cell2.planned_only, true);
assert.equal(cell2.representative_menu, '予定ランチ');
assert.equal(cell2.stamp, '🍜');
ok('代表メニュー・スタンプ・planned_only');

// value_source: items からの自動判定（読み取り時）
a.upsert_meal({ external_id: 'meal-20261104-hiru-01', date: '2026-11-04', eaten_time: '12:30', meal_type: '昼食', status: 'actual', kcal: 700, kcal_pm: 0, report_source: 'レシート', items: [{ name: 'a', kcal: 300, value_source: '公式値' }, { name: 'b', kcal: 400, value_source: '推定' }] });
const lunch = a.get_day('2026-11-04').sections[0].meals.find((m) => m.meal_type === '昼食');
assert.equal(lunch.value_source, '混在');
ok('value_source の自動判定');

// 7. 削除: 物理削除され、不在 ID はエラー
a.delete_meal('meal-20261104-hiru-01');
assert.equal(a.get_day('2026-11-04').sections[0].meals.some((m) => m.external_id === 'meal-20261104-hiru-01'), false);
assert.throws(() => a.delete_meal('meal-20261104-hiru-01'), /存在しない/);
assert.throws(() => a.delete_day('daily-29990101-nowhere'), /存在しない/);
ok('削除と不在エラー');

// 9. 移行: import → export の往復で件数と日別合計が一致
const before = a.export_records();
const store2 = createMemoryStore();
const a2 = createActions(store2);
const summary = a2.import_records(before);
const after = a2.export_records();
assert.equal(after.meals.length, before.meals.length);
assert.equal(after.days.length, before.days.length);
assert.equal(summary.actual_kcal_by_date['2026-11-04'], 1200);
assert.equal(summary.weight_days, 1);
ok('import/export の往復');

// --- エッジケース（別ストアで実施） ---
const s3 = createMemoryStore();
const a3 = createActions(s3);

// tz が解決できない場合はエラー（地域の実値を勝手に焼き込まない）
assert.throws(() => a3.upsert_meal({ external_id: 'meal-20261104-asa-01', date: '2026-11-04', meal_type: '朝食', status: 'actual', menu: 'x', kcal: 1, kcal_pm: 0, report_source: '申告' }), /tz を解決できません/);
a3.update_settings({ current_tz: 'Asia/Tokyo' });
ok('tz 未解決はエラー');


// 経過表記 24:41 を受理し、並びで通常時刻の後に来る
a3.upsert_meal({ external_id: 'meal-20261104-yuu-01', date: '2026-11-04', eaten_time: '19:00', meal_type: '夕食', status: 'actual', menu: '夕食', kcal: 500, kcal_pm: 0, report_source: '申告' });
a3.upsert_meal({ external_id: 'meal-20261104-yashoku-01', date: '2026-11-04', eaten_time: '24:41', meal_type: '夜食', status: 'actual', menu: '夜食', kcal: 300, kcal_pm: 0, report_source: '申告' });
const times = a3.get_day('2026-11-04').sections[0].meals.map((m) => m.eaten_time);
assert.deepEqual(times, ['19:00', '24:41']);
ok('経過表記 24:41');

// 絵文字: ZWJ 結合（家族絵文字）は書記素1つとして受理、2つは拒否
a3.upsert_day({ external_id: 'daily-20261104-tokyo', date: '2026-11-04', emoji: '👨‍👩‍👧' });
assert.throws(() => a3.upsert_day({ external_id: 'daily-20261104-tokyo', date: '2026-11-04', emoji: '👨‍👩‍👧🍚' }), /single emoji/);
ok('絵文字の書記素判定');

// 複数 tz の同日: get_day は節を分け、get_month は合算する
a3.upsert_meal({ external_id: 'meal-20261104-asa-01', date: '2026-11-04', tz: 'America/Los_Angeles', eaten_time: '08:00', meal_type: '朝食', status: 'actual', menu: 'LA朝食', kcal: 600, kcal_pm: 0, report_source: '写真' });
a3.upsert_day({ external_id: 'daily-20261104-losangeles', date: '2026-11-04', tz: 'America/Los_Angeles', weight_kg: 79.0 });
const d3 = a3.get_day('2026-11-04');
assert.equal(d3.sections.length, 2);
assert.equal(d3.summary.actual_kcal, 1400);
const m3 = a3.get_month('2026-11').days.find((d) => d.date === '2026-11-04');
assert.equal(m3.actual_kcal, 1400);
assert.deepEqual(m3.weights.map((w) => w.label), ['LA']);
ok('複数 tz の同日（節分けと合算）');

// 空の月: days は空配列、体重系列は全期間分が返る
const empty = a3.get_month('2030-01');
assert.deepEqual(empty.days, []);
assert.equal(empty.weights.length, 1);
ok('空の月と体重系列');

// 運動フィールドの往復
a3.upsert_day({ external_id: 'daily-20261104-tokyo', date: '2026-11-04', steps: 12345, exercise_minutes: 45, exercise_kcal: 300 });
const rec3 = a3.export_records().days.find((d) => d.external_id === 'daily-20261104-tokyo');
assert.equal(rec3.steps, 12345);
assert.equal(rec3.exercise_kcal, 300);
ok('運動フィールドの保持');

console.log(`\nAll ${passed} checks passed.`);
