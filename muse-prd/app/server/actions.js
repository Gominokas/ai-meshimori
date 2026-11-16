// AIメシモリ Muse版 — アクション層（aiseki apps/api/src/schema.js からの移植）
//
// 移植元は GraphQL のリゾルバ実装で、本ファイルはそれを Muse 版の
// アクション契約（設計書 §2 の11アクション）へ変換したものである。
// 移植時の正規化は app-port-design.md §3 の一覧が正。
//
// 保存はストア越しとする。ストアの形は { meals: Map, days: Map, settings: Object }
// で、createMemoryStore() が参照実装。受け手の環境では、この形に合わせた
// アダプタ（アーティファクトの DB 等）を用意して createActions(store) に渡す。

import { validateMeal, validateDay, sortMeals, SLUGS } from './validate.js';

export const MEAL_FIELDS = [
  'external_id', 'date', 'tz', 'utc_offset', 'eaten_time', 'std_date', 'std_time',
  'meal_type', 'tags', 'status', 'menu', 'kcal', 'kcal_pm',
  'protein_g', 'protein_pm', 'fat_g', 'fat_pm', 'carbs_g', 'carbs_pm',
  'salt_g', 'salt_pm', 'value_source', 'report_source', 'items', 'note',
  'place', 'emoji',
];
export const DAY_FIELDS = [
  'external_id', 'date', 'tz', 'measured_time', 'std_date', 'std_time',
  'weight_kg', 'body_fat_pct', 'bmi', 'condition_note', 'emoji',
  'steps', 'exercise_minutes', 'exercise_kcal',
];
const SETTING_KEYS = ['target_kcal', 'current_tz', 'week_start', 'spec_version'];

export function createMemoryStore() {
  return {
    meals: new Map(),
    days: new Map(),
    // 既定値は持たない（正規化 §3 #5）。初期設定はその家の AI が行う。
    settings: { target_kcal: null, current_tz: null, week_start: null, spec_version: null },
  };
}

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

function pick(input, fields) {
  const out = {};
  for (const f of fields) if (input[f] !== undefined) out[f] = clone(input[f]);
  return out;
}

// tz の解決（正規化 §3 #6）: 入力 tz → settings.current_tz の順で解決し、
// 解決できなければエラー。地域の実値をフォールバックとして焼き込まない。
function resolveTz(store, input) {
  const tz = input.tz ?? store.settings.current_tz;
  if (!tz) throw new Error('tz を解決できません（入力にも settings.current_tz にもありません）');
  return tz;
}

// value_source の自動判定（正規化 §3 #7）: 読み取り時に items から判定する。
// 全部 公式値 → 公式値、全部 推定 → 推定、混在 → 混在。items が無ければ保存値。
export function deriveValueSource(meal) {
  if (Array.isArray(meal.items) && meal.items.length) {
    const vs = [...new Set(meal.items.map((i) => i.value_source).filter(Boolean))];
    if (vs.length === 1) return vs[0];
    if (vs.length > 1) return '混在';
  }
  return meal.value_source ?? null;
}

function summarize(meals) {
  let actualKcal = 0;
  let actualPm = 0;
  let plannedKcal = 0;
  let plannedCount = 0;
  for (const m of meals) {
    if (m.status === 'actual') {
      actualKcal += m.kcal ?? 0;
      actualPm += m.kcal_pm ?? 0;
    } else if (m.status === 'planned') {
      plannedKcal += m.kcal ?? 0;
      plannedCount += 1;
    }
  }
  return {
    actual_kcal: actualKcal,
    actual_range: { low: actualKcal - actualPm, high: actualKcal + actualPm },
    planned_kcal: plannedKcal,
    planned_count: plannedCount,
  };
}

// 代表メニュー（移植元の calendar リゾルバ）: 最大 kcal の actual（menu あり）、
// 無ければ並び順で最初の planned（menu あり）。
function representativeMeal(sortedMeals) {
  const actuals = sortedMeals.filter((m) => m.status === 'actual' && m.menu);
  if (actuals.length) return actuals.reduce((a, b) => (b.kcal > a.kcal ? b : a));
  const planned = sortedMeals.filter((m) => m.status === 'planned' && m.menu);
  return planned.length ? planned[0] : null;
}

// tz の短縮ラベル（移植元の Web 側 tzShort）: 表示専用。
export function tzShortLabel(tz) {
  if (!tz) return '';
  if (tz.includes('Tokyo')) return '東京';
  if (tz.includes('Los_Angeles')) return 'LA';
  if (tz.includes('New_York')) return 'NY';
  return tz.split('/').pop();
}

export function createActions(store) {
  return {
    // ---- 書き込み ----

    // 食事の登録・訂正: レコード全体の置き換え（移植元の upsertMeal）。
    upsert_meal(input) {
      const rec = pick(input, MEAL_FIELDS);
      rec.tz = resolveTz(store, rec);
      validateMeal(rec);
      const existing = store.meals.get(rec.external_id);
      if (existing && existing.tz && existing.tz !== rec.tz) {
        throw new Error(`tz mismatch for ${rec.external_id}: existing ${existing.tz} vs new ${rec.tz} (refusing silent overwrite)`);
      }
      if (rec.tags === undefined) rec.tags = [];
      store.meals.set(rec.external_id, rec);
      return clone(rec);
    },

    // 日次の登録・訂正: 部分保持（正規化 §3 #2）。
    // 省略したフィールドは既存値を保持し、明示的に null を渡したときだけ消す。
    upsert_day(input) {
      if (!input || !input.external_id) throw new Error('external_id required');
      const existing = store.days.get(input.external_id);
      const rec = existing ? clone(existing) : { external_id: input.external_id };
      for (const f of DAY_FIELDS) {
        if (f === 'external_id' || f === 'tz') continue;
        if (input[f] === null) delete rec[f];
        else if (input[f] !== undefined) rec[f] = clone(input[f]);
      }
      if (input.date !== undefined) rec.date = input.date;
      rec.tz = resolveTz(store, { ...rec, tz: input.tz ?? rec.tz });
      if (existing && existing.tz && existing.tz !== rec.tz) {
        throw new Error(`tz mismatch for ${rec.external_id}: existing ${existing.tz} vs new ${rec.tz} (refusing silent overwrite)`);
      }
      validateDay(rec);
      store.days.set(rec.external_id, rec);
      return clone(rec);
    },

    // 物理削除（正規化 §3 #4）: 存在しない場合はエラー。
    delete_meal(external_id) {
      if (!store.meals.delete(external_id)) throw new Error(`存在しない external_id です: ${external_id}`);
      return external_id;
    },
    delete_day(external_id) {
      if (!store.days.delete(external_id)) throw new Error(`存在しない external_id です: ${external_id}`);
      return external_id;
    },

    // 採番: meal-YYYYMMDD-{区分スラッグ}-{連番2桁}。連番は (date, 区分) で
    // tz をまたいで通し（仕様 §3）。移植元には無い Muse 版の追加アクション。
    next_meal_external_id(date, category) {
      const slug = SLUGS[category] ?? (Object.values(SLUGS).includes(category) ? category : null);
      if (!slug) throw new Error(`区分が不正です: ${category}`);
      const prefix = `meal-${String(date).replaceAll('-', '')}-${slug}-`;
      let max = 0;
      for (const id of store.meals.keys()) {
        if (!id.startsWith(prefix)) continue;
        const n = Number.parseInt(id.slice(prefix.length), 10);
        if (Number.isFinite(n) && n > max) max = n;
      }
      return `${prefix}${String(max + 1).padStart(2, '0')}`;
    },

    // ---- 読み取り ----

    // 1日のビュー（移植元の day リゾルバ）: (date, tz) ごとに節を分ける。
    get_day(date) {
      const mealsAll = [...store.meals.values()].filter((m) => m.date === date);
      const daysAll = [...store.days.values()].filter((d) => d.date === date);
      const tzs = [...new Set([...mealsAll.map((m) => m.tz || null), ...daysAll.map((d) => d.tz)])];
      const sections = (tzs.length ? tzs : [null]).map((tz) => {
        const meals = sortMeals(mealsAll.filter((m) => (m.tz || null) === tz))
          .map((m) => ({ ...clone(m), value_source: deriveValueSource(m) }));
        return {
          tz,
          day: clone(daysAll.find((d) => d.tz === tz) ?? null),
          meals,
          summary: summarize(meals),
        };
      });
      return { date, sections, summary: summarize(mealsAll) };
    },

    // 月のカレンダービュー（移植元の calendar リゾルバ）:
    // マスは日付単位で全 tz 合算。スタンプは設計 §4 の優先順位で解決する
    // （正規化 §3 #8）。体重推移の全期間分も一緒に返す。
    get_month(month) {
      const dates = new Set();
      for (const m of store.meals.values()) if (m.date.startsWith(month)) dates.add(m.date);
      for (const d of store.days.values()) if (d.date.startsWith(month)) dates.add(d.date);
      const days = [...dates].sort().map((date) => {
        const meals = sortMeals([...store.meals.values()].filter((m) => m.date === date));
        const dayRecords = [...store.days.values()].filter((d) => d.date === date);
        const summary = summarize(meals);
        const rep = representativeMeal(meals);
        let stamp = null;
        for (const d of dayRecords) if (d.emoji) stamp = d.emoji;
        if (!stamp && rep && rep.emoji) stamp = rep.emoji;
        if (!stamp) stamp = '🍽️';
        return {
          date,
          ...summary,
          planned_only: summary.actual_kcal === 0 && summary.planned_count > 0,
          representative_menu: rep ? rep.menu : null,
          representative_emoji: rep ? (rep.emoji ?? null) : null,
          stamp,
          weights: dayRecords
            .filter((d) => d.weight_kg != null)
            .map((d) => ({ tz: d.tz, label: tzShortLabel(d.tz), weight_kg: d.weight_kg })),
        };
      });
      const weights = [...store.days.values()]
        .filter((d) => d.weight_kg != null)
        .map((d) => ({
          date: d.date, tz: d.tz,
          std_date: d.std_date ?? null, std_time: d.std_time ?? null,
          weight_kg: d.weight_kg, body_fat_pct: d.body_fat_pct ?? null, bmi: d.bmi ?? null,
        }))
        .sort((a, b) => {
          const da = a.std_date ?? a.date;
          const db = b.std_date ?? b.date;
          return da !== db ? da.localeCompare(db) : String(a.std_time ?? '00:00').localeCompare(String(b.std_time ?? '00:00'));
        });
      return { month, days, weights };
    },

    // ---- 設定 ----

    get_settings() {
      return clone(store.settings);
    },
    // 渡した項目だけ更新する（移植元の updateSettings）。
    update_settings(input) {
      for (const k of SETTING_KEYS) {
        if (input[k] !== undefined) store.settings[k] = input[k];
      }
      return clone(store.settings);
    },

    // ---- 移行 ----

    // 一括投入: external_id upsert。日次は移行レコードとして丸ごと入れる
    // （部分保持と混ぜないため、既存があれば消してから入れる）。
    // 投入件数と、日別の actual 合計・体重件数を突合用に返す。
    import_records(payload) {
      const meals = payload.meals ?? [];
      const days = payload.days ?? [];
      for (const m of meals) this.upsert_meal(m);
      for (const d of days) {
        store.days.delete(d.external_id);
        const rec = pick(d, DAY_FIELDS);
        rec.tz = resolveTz(store, rec);
        validateDay(rec);
        store.days.set(rec.external_id, rec);
      }
      if (payload.settings) this.update_settings(payload.settings);
      const perDate = {};
      for (const m of store.meals.values()) {
        if (m.status !== 'actual') continue;
        perDate[m.date] = (perDate[m.date] ?? 0) + (m.kcal ?? 0);
      }
      return {
        meals: meals.length,
        days: days.length,
        actual_kcal_by_date: perDate,
        weight_days: [...store.days.values()].filter((d) => d.weight_kg != null).length,
      };
    },

    export_records() {
      return {
        meals: [...store.meals.values()].map(clone),
        days: [...store.days.values()].map(clone),
        settings: clone(store.settings),
      };
    },
  };
}
