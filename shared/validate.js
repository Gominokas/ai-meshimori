export const MEAL_TYPES = ["朝食","昼食","夕食","おやつ","夜食","その他"];
export const MEAL_ORDER = Object.fromEntries(MEAL_TYPES.map((t,i)=>[t,i]));
export const SLUGS = { "朝食":"asa","昼食":"hiru","夕食":"yuu","おやつ":"oyatsu","夜食":"yashoku","その他":"other" };
export const STATUSES = ["planned","actual","skipped"];

export function validateMeal(m){
  if(!m.external_id) throw new Error("external_id required");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(m.date||"")) throw new Error("date must be YYYY-MM-DD");
  if(m.eaten_time != null && !/^\d{2}:[0-5]\d$/.test(m.eaten_time)) throw new Error("eaten_time must match ^\\d{2}:[0-5]\\d$ (00:00-99:59)");
  if(m.std_time != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(m.std_time)) throw new Error("std_time must be 00:00-23:59");
  if(!MEAL_TYPES.includes(m.meal_type)) throw new Error("invalid meal_type: "+m.meal_type);
  if(!STATUSES.includes(m.status)) throw new Error("invalid status: "+m.status);
  if(m.kcal == null || m.kcal_pm == null) throw new Error("kcal and kcal_pm required");
  if(m.status==="skipped" && Number(m.kcal)!==0) throw new Error("skipped meal must have kcal=0");
  if(m.status!=="skipped" && !m.menu && !(m.items && m.items.length)) throw new Error("menu or items required (except skipped)");
  if(!m.report_source) throw new Error("report_source required");
  assertSingleEmoji(m.emoji, 'emoji');
  return m;
}
const graphemeSegmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
export function assertSingleEmoji(v, field){
  if (v == null || v === '') return;
  const n = [...graphemeSegmenter.segment(String(v))].length;
  if (n !== 1) throw new Error(field + " must be a single emoji (one grapheme cluster)");
}
export function validateDay(d){
  if(!d.external_id) throw new Error("external_id required");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date||"")) throw new Error("date must be YYYY-MM-DD");
  if(!d.tz) throw new Error("tz required on save (resolve omitted tz from current stay tz before save)");
  if(d.std_time != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.std_time)) throw new Error("std_time must be 00:00-23:59");
  assertSingleEmoji(d.emoji, 'emoji');
  return d;
}
export function sortMeals(meals){
  return [...meals].sort((a,b)=>{
    if(a.eaten_time && b.eaten_time) return a.eaten_time.localeCompare(b.eaten_time);
    if(a.eaten_time && !b.eaten_time) return -1;
    if(!a.eaten_time && b.eaten_time) return 1;
    return (MEAL_ORDER[a.meal_type]??9)-(MEAL_ORDER[b.meal_type]??9);
  });
}
