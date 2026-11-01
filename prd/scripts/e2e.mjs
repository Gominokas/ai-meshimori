// E2E isolated to 2027-02 test data (seed/mock data in 2026-10 must not affect asserts)
const base = process.env.BASE || 'http://localhost:8787';
async function gql(q,v){ const r=await fetch(base+'/graphql',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:q,variables:v})}); return r.json(); }
function assert(c,msg){ if(!c){ console.error('FAIL',msg); process.exitCode=1; } else console.log('OK',msg); }
const h = await (await fetch(base+'/healthz')).json(); assert(h.ok,'healthz');
let r = await gql(`mutation($i:MealInput!){upsertMeal(input:$i){external_id eaten_time kcal}}`,{i:{external_id:'meal-20270210-yashoku-01',date:'2027-02-10',tz:'Asia/Tokyo',eaten_time:'24:41',std_date:'2027-02-11',std_time:'00:41',meal_type:'夜食',tags:['ブースト'],status:'actual',menu:'テスト夜食',kcal:850,kcal_pm:80,report_source:'レシート'}});
assert(r.data?.upsertMeal?.eaten_time==='24:41','upsert meal 24:41 accepted: '+JSON.stringify(r));
r = await gql(`mutation($i:DayInput!){upsertDay(input:$i){external_id weight_kg}}`,{i:{external_id:'daily-20270210-tokyo',tz:'Asia/Tokyo',date:'2027-02-10',weight_kg:99.5,body_fat_pct:30.0,bmi:29.0}});
assert(r.data?.upsertDay?.weight_kg===99.5,'upsert day');
r = await gql(`query{calendar(month:"2027-02"){date total_kcal meal_count days{weight_kg}}}`);
const c = r.data.calendar.find(d=>d.date==='2027-02-10'); assert(c?.total_kcal===850 && c?.days[0]?.weight_kg===99.5,'calendar total+weight: '+JSON.stringify(c));
r = await gql(`query{day(date:"2027-02-10"){meals{menu eaten_time}}}`);
assert(r.data.day[0].meals.some(m=>m.eaten_time==='24:41'),'day query returns night meal');
r = await gql(`mutation($i:MealInput!){upsertMeal(input:$i){external_id}}`,{i:{external_id:'meal-20270210-yashoku-01',date:'2027-02-10',tz:'America/Los_Angeles',eaten_time:'24:41',meal_type:'夜食',status:'actual',menu:'x',kcal:1,kcal_pm:0,report_source:'申告'}});
assert(!!r.errors && /tz mismatch/.test(r.errors[0].message),'tz mismatch rejected: '+(r.errors?.[0]?.message||JSON.stringify(r)));
r = await gql(`mutation($i:MealInput!){upsertMeal(input:$i){external_id}}`,{i:{external_id:'meal-20270210-yashoku-99',date:'2027-02-10',tz:'Asia/Tokyo',eaten_time:'24:99',meal_type:'夜食',status:'actual',menu:'x',kcal:1,kcal_pm:0,report_source:'申告'}});
assert(!!r.errors,'invalid eaten_time rejected');
r = await gql(`mutation($i:MealInput!){upsertMeal(input:$i){external_id}}`,{i:{external_id:'meal-20270210-hiru-01',date:'2027-02-10',tz:'Asia/Tokyo',meal_type:'昼食',status:'skipped',menu:'なし',kcal:100,kcal_pm:0,report_source:'申告'}});
assert(!!r.errors,'skipped kcal!=0 rejected');

// --- regression: diet-window user check 2026-10-31 ---
// 1) tz omitted -> resolved from tenant current_tz and baked in
r = await gql(`mutation($i:MealInput!){upsertMeal(input:$i){external_id tz}}`,{i:{external_id:'meal-20270211-asa-01',date:'2027-02-11',eaten_time:'08:00',meal_type:'朝食',status:'actual',menu:'tz省略テスト',kcal:100,kcal_pm:0,report_source:'申告'}});
assert(r.data?.upsertMeal?.tz==='Asia/Tokyo','tz omitted resolved to Asia/Tokyo: '+JSON.stringify(r.data));
// 2) skipped without menu accepted
r = await gql(`mutation($i:MealInput!){upsertMeal(input:$i){external_id status}}`,{i:{external_id:'meal-20270211-hiru-01',date:'2027-02-11',tz:'Asia/Tokyo',meal_type:'昼食',status:'skipped',kcal:0,kcal_pm:0,report_source:'申告'}});
assert(r.data?.upsertMeal?.status==='skipped','skipped without menu accepted: '+JSON.stringify(r));
// 3) value_source auto from items (mixed -> 混在, all official -> 公式値)
r = await gql(`mutation($i:MealInput!){upsertMeal(input:$i){external_id value_source}}`,{i:{external_id:'meal-20270211-yuu-01',date:'2027-02-11',tz:'Asia/Tokyo',meal_type:'夕食',status:'actual',menu:'混在テスト',kcal:500,kcal_pm:0,report_source:'申告',items:[{name:'公式品',kcal:300,kcal_pm:0,value_source:'公式値'},{name:'推定品',kcal:200,kcal_pm:50,value_source:'推定'}]}});
assert(r.data?.upsertMeal?.value_source==='混在','value_source auto mixed: '+JSON.stringify(r.data));
r = await gql(`mutation($i:MealInput!){upsertMeal(input:$i){external_id value_source}}`,{i:{external_id:'meal-20270211-yashoku-01',date:'2027-02-11',tz:'Asia/Tokyo',meal_type:'夜食',status:'actual',menu:'公式テスト',kcal:300,kcal_pm:0,report_source:'申告',items:[{name:'公式品',kcal:300,kcal_pm:0,value_source:'公式値'}]}});
assert(r.data?.upsertMeal?.value_source==='公式値','value_source auto official: '+JSON.stringify(r.data));
// 4) representative menu rule: max-kcal actual
r = await gql(`query{calendar(month:"2027-02"){date representative_menu}}`);
const rep = r.data.calendar.find(d=>d.date==='2027-02-11');
assert(rep?.representative_menu==='混在テスト','representative menu = max kcal actual: '+JSON.stringify(rep));

console.log(process.exitCode? 'E2E FAILED':'E2E ALL PASS');
