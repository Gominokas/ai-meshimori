import { db, rowToMeal, rowToDay } from './db.js';
import { validateMeal, validateDay, sortMeals } from '../../../../shared/validate.js';

export const typeDefs = /* GraphQL */ `
  type Item { name: String!, kcal: Int, kcal_pm: Int, value_source: String, protein_g: Float, protein_pm: Float, fat_g: Float, fat_pm: Float, carbs_g: Float, carbs_pm: Float, salt_g: Float, salt_pm: Float }
  input ItemInput { name: String!, kcal: Int, kcal_pm: Int, value_source: String, protein_g: Float, protein_pm: Float, fat_g: Float, fat_pm: Float, carbs_g: Float, carbs_pm: Float, salt_g: Float, salt_pm: Float }
  type Meal { external_id: String!, date: String!, tz: String, utc_offset: String, eaten_time: String, std_date: String, std_time: String, meal_type: String!, tags: [String!]!, status: String!, menu: String, kcal: Int!, kcal_pm: Int!, protein_g: Float, protein_pm: Float, fat_g: Float, fat_pm: Float, carbs_g: Float, carbs_pm: Float, salt_g: Float, salt_pm: Float, value_source: String, report_source: String!, items: [Item!], note: String, place: String, emoji: String }
  input MealInput { external_id: String!, date: String!, tz: String, utc_offset: String, eaten_time: String, std_date: String, std_time: String, meal_type: String!, tags: [String!], status: String!, menu: String, kcal: Int!, kcal_pm: Int!, protein_g: Float, protein_pm: Float, fat_g: Float, fat_pm: Float, carbs_g: Float, carbs_pm: Float, salt_g: Float, salt_pm: Float, value_source: String, report_source: String!, items: [ItemInput!], note: String, place: String, emoji: String }
  type Day { external_id: String!, date: String!, tz: String!, measured_time: String, std_date: String, std_time: String, weight_kg: Float, body_fat_pct: Float, bmi: Float, condition_note: String, emoji: String }
  input DayInput { external_id: String!, date: String!, tz: String, measured_time: String, std_date: String, std_time: String, weight_kg: Float, body_fat_pct: Float, bmi: Float, condition_note: String, emoji: String }
  type DaySection { date: String!, tz: String, day: Day, meals: [Meal!]! }
  type CalendarDay { date: String!, days: [Day!]!, total_kcal: Float!, total_pm: Float!, meal_count: Int!, representative_menu: String, emoji: String }
  type WeightPoint { date: String!, tz: String!, std_date: String, std_time: String, weight_kg: Float, body_fat_pct: Float, bmi: Float }
  type Tenant { id: String!, name: String, current_tz: String, week_start: Int, target_kcal: Int }
  type Query {
    calendar(month: String!): [CalendarDay!]!
    day(date: String!, tz: String): [DaySection!]!
    weightSeries(from: String!, to: String!): [WeightPoint!]!
    me: Tenant
  }
  type Mutation {
    upsertMeal(input: MealInput!): Meal!
    deleteMeal(externalId: String!): Boolean!
    upsertDay(input: DayInput!): Day!
    deleteDay(externalId: String!): Boolean!
    updateSettings(currentTz: String, weekStart: Int, targetKcal: Int): Tenant
  }
`;

const cols = ['date','tz','utc_offset','eaten_time','std_date','std_time','meal_type','tags','status','menu','kcal','kcal_pm','protein_g','protein_pm','fat_g','fat_pm','carbs_g','carbs_pm','salt_g','salt_pm','value_source','report_source','items','note','place','emoji'];
const dayCols = ['date','tz','measured_time','std_date','std_time','weight_kg','body_fat_pct','bmi','condition_note','emoji'];

export const resolvers = {
  Query: {
    calendar: (_, { month }) => {
      const meals = db.prepare(`SELECT * FROM meals WHERE substr(date,1,7)=?`).all(month).map(rowToMeal);
      const days = db.prepare(`SELECT * FROM days WHERE substr(date,1,7)=?`).all(month).map(rowToDay);
      const byDate = new Map();
      const ensure = (date) => { if (!byDate.has(date)) byDate.set(date, { date, days: [], total_kcal: 0, total_pm: 0, meal_count: 0 }); return byDate.get(date); };
      for (const d of days) { const c = ensure(d.date); c.days.push(d); if (d.emoji) c.emoji = d.emoji; }
      for (const m of meals) { const c = ensure(m.date); c.meal_count++; if (m.status === 'actual') { c.total_kcal += m.kcal; c.total_pm += m.kcal_pm; } }
      for (const c of byDate.values()) {
        const ms = meals.filter(m => m.date === c.date);
        const actuals = ms.filter(m => m.status === 'actual' && m.menu);
        if (actuals.length) c.representative_menu = actuals.reduce((a,b)=> (b.kcal > a.kcal ? b : a)).menu;
        else { const planned = sortMeals(ms.filter(m => m.status === 'planned' && m.menu)); c.representative_menu = planned.length ? planned[0].menu : null; }
      }
      return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
    },
    day: (_, { date, tz }) => {
      const mealsAll = db.prepare(`SELECT * FROM meals WHERE date=?`).all(date).map(rowToMeal);
      const daysAll = db.prepare(`SELECT * FROM days WHERE date=?`).all(date).map(rowToDay);
      const tzSet = new Set([...mealsAll.map(m=>m.tz||null), ...daysAll.map(d=>d.tz)]);
      let tzs = [...tzSet];
      if (tz) tzs = tzs.filter(t=>t===tz);
      if (!tzs.length) tzs = [tz||null];
      return tzs.map(t => ({
        date, tz: t,
        day: daysAll.find(d=>d.tz===t) || null,
        meals: sortMeals(mealsAll.filter(m=>(m.tz||null)===t)),
      }));
    },
    weightSeries: (_, { from, to }) => {
      return db.prepare(`SELECT * FROM days WHERE COALESCE(std_date,date) BETWEEN ? AND ? AND weight_kg IS NOT NULL ORDER BY COALESCE(std_date,date), COALESCE(std_time,'00:00')`).all(from,to)
        .map(d=>({ date:d.date, tz:d.tz, std_date:d.std_date, std_time:d.std_time, weight_kg:d.weight_kg, body_fat_pct:d.body_fat_pct, bmi:d.bmi }));
    },
    me: () => db.prepare(`SELECT * FROM tenants WHERE id='default'`).get(),
  },
  Mutation: {
    upsertMeal: (_, { input }) => {
      if (!input.tz) { const t = db.prepare(`SELECT current_tz FROM tenants WHERE id='default'`).get(); input.tz = t?.current_tz || 'Asia/Tokyo'; }
      if (input.items && input.items.length) {
        const vs = [...new Set(input.items.map(i => i.value_source).filter(Boolean))];
        if (vs.length === 1) input.value_source = vs[0];
        else if (vs.length > 1) input.value_source = '混在';
      }
      validateMeal(input);
      const existing = db.prepare(`SELECT * FROM meals WHERE external_id=?`).get(input.external_id);
      if (existing && input.tz && existing.tz && existing.tz !== input.tz) throw new Error(`tz mismatch for ${input.external_id}: existing ${existing.tz} vs new ${input.tz} (refusing silent overwrite)`);
      const vals = cols.map(c => c==='tags' ? JSON.stringify(input.tags||[]) : c==='items' ? (input.items?JSON.stringify(input.items):null) : (input[c] ?? null));
      db.prepare(`INSERT INTO meals(external_id,${cols.join(',')}) VALUES (?,${cols.map(()=>'?').join(',')})
        ON CONFLICT(external_id) DO UPDATE SET ${cols.map(c=>c+'=excluded.'+c).join(',')}, updated_at=datetime('now')`).run(input.external_id, ...vals);
      return rowToMeal(db.prepare(`SELECT * FROM meals WHERE external_id=?`).get(input.external_id));
    },
    deleteMeal: (_, { externalId }) => { db.prepare(`DELETE FROM meals WHERE external_id=?`).run(externalId); return true; },
    upsertDay: (_, { input }) => {
      if (!input.tz) { const t = db.prepare(`SELECT current_tz FROM tenants WHERE id='default'`).get(); input.tz = t?.current_tz || 'Asia/Tokyo'; }
      validateDay(input);
      const vals = dayCols.map(c => input[c] ?? null);
      db.prepare(`INSERT INTO days(external_id,${dayCols.join(',')}) VALUES (?,${dayCols.map(()=>'?').join(',')})
        ON CONFLICT(external_id) DO UPDATE SET ${dayCols.map(c=>c+'=excluded.'+c).join(',')}, updated_at=datetime('now')`).run(input.external_id, ...vals);
      return rowToDay(db.prepare(`SELECT * FROM days WHERE external_id=?`).get(input.external_id));
    },
    deleteDay: (_, { externalId }) => { db.prepare(`DELETE FROM days WHERE external_id=?`).run(externalId); return true; },
    updateSettings: (_, { currentTz, weekStart, targetKcal }) => {
      if (currentTz != null) db.prepare(`UPDATE tenants SET current_tz=? WHERE id='default'`).run(currentTz);
      if (weekStart != null) db.prepare(`UPDATE tenants SET week_start=? WHERE id='default'`).run(weekStart);
      if (targetKcal != null) db.prepare(`UPDATE tenants SET target_kcal=? WHERE id='default'`).run(targetKcal);
      return db.prepare(`SELECT * FROM tenants WHERE id='default'`).get();
    },
  }
};
