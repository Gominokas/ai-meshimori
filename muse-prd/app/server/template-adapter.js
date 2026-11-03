// AIメシモリ Muse版 — テンプレート流し込みアダプタ
//
// 共有部テンプレート（shared/mockup/aiseki-mockup.html）の流し込み契約変数
// （DAYS / TARGET / TOT / SHORT / WEIGHTS / MEAL_EMOJI / DAY_EMOJI / selectedDate）を
// アクション層の出力から組み立てる。テンプレート側の契約を変える場合は、
// このファイルとテンプレートを同時に直すこと。
//
// 使い方:
//   const data = buildTemplateData(actions, { selectedDate: '2026-11-04' });
//   // data = { DAYS, TARGET, TOT, SHORT, WEIGHTS, MEAL_EMOJI, DAY_EMOJI, selectedDate }
//
// 変換規則:
// - DAYS[date].meals の各行は [時刻, 区分, タグ, メニュー, kcal, ±, 状態, メモ, 場所]。
//   本実装のレコードにはタグが無いためタグは常に ''、メモは record.note があればそれ。
//   状態は actual='a' / planned='p' / skipped='s'。
// - 複数 tz の同日は、get_day の節順（現在 tz → std 昇順）のまま1日に畳む。
//   体重文字列 w は「現在 tz の日次レコード」を優先し、無ければ最初に体重のある節を使う。
// - TOT / SHORT は actual がある日だけ立てる（テンプレートのセル判定がそれを前提にする）。
// - DAY_EMOJI は get_month が解決したスタンプ（日次 > 代表メニューの食事 > 🍽️）をそのまま入れる。
// - WEIGHTS は体重のある全日次レコード（複数 tz は同日に複数行）。

const STATUS_LETTER = { actual: 'a', planned: 'p', skipped: 's' };

function weightText(rec) {
  if (!rec || rec.weight_kg == null) return null;
  const fat = rec.body_fat_pct != null ? rec.body_fat_pct : '-';
  const bmi = rec.bmi != null ? rec.bmi : '-';
  return `⚖️ ${rec.weight_kg}kg ・ 体脂肪 ${fat}% ・ BMI ${bmi}`;
}

export function buildTemplateData(actions, options = {}) {
  const settings = actions.get_settings();
  const { meals, days } = actions.export_records();

  const dates = [...new Set([...meals.map((m) => m.date), ...days.map((d) => d.date)])].sort();
  const DAYS = {};
  const TOT = {};
  const SHORT = {};
  const DAY_EMOJI = {};
  const MEAL_EMOJI = {};

  // 月ビュー（セル単位の集計・代表・スタンプ解決済み）を月ごとに引いておく
  const cells = {};
  for (const month of [...new Set(dates.map((d) => d.slice(0, 7)))]) {
    for (const cell of actions.get_month(month).days) cells[cell.date] = cell;
  }

  for (const date of dates) {
    const view = actions.get_day(date);
    const rows = [];
    let actualCount = 0;
    for (const section of view.sections) {
      for (const m of section.meals) {
        const time = m.eaten_time ?? '--:--';
        rows.push([
          time,
          m.meal_type,
          '',
          m.menu ?? '',
          m.kcal,
          m.kcal_pm,
          STATUS_LETTER[m.status],
          m.note ?? '',
          m.place ?? '',
        ]);
        if (m.status === 'actual') actualCount += 1;
        if (m.emoji) MEAL_EMOJI[`${date}|${time}`] = m.emoji;
      }
    }
    // 体重文字列は現在 tz の節を優先する
    const preferred = view.sections.find((s) => s.tz === settings.current_tz) ?? view.sections[0];
    const wSection = view.sections.find((s) => s.tz === settings.current_tz && s.day && s.day.weight_kg != null)
      ?? view.sections.find((s) => s.day && s.day.weight_kg != null)
      ?? preferred;
    DAYS[date] = { w: wSection && wSection.day ? weightText(wSection.day) : null, meals: rows };
    const cell = cells[date];
    if (cell && cell.stamp) DAY_EMOJI[date] = cell.stamp;
    if (cell && actualCount > 0) {
      TOT[date] = cell.actual_kcal;
      if (cell.representative_menu) SHORT[date] = cell.representative_menu;
    }
  }

  const WEIGHTS = days
    .filter((d) => d.weight_kg != null)
    .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : (x.tz === settings.current_tz ? -1 : 1)))
    .map((d) => [d.date, d.weight_kg, d.body_fat_pct ?? null]);

  return {
    DAYS,
    TARGET: settings.target_kcal,
    TOT,
    SHORT,
    WEIGHTS,
    MEAL_EMOJI,
    DAY_EMOJI,
    selectedDate: options.selectedDate ?? dates[dates.length - 1] ?? null,
  };
}
