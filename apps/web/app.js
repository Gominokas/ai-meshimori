const $=s=>document.querySelector(s);
let cursor=new Date(2026,9,1); // mock starts at Oct 2026 (real data month)
async function gql(q,v){ const r=await fetch('/graphql',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:q,variables:v})}); const j=await r.json(); if(j.errors) throw new Error(j.errors[0].message); return j.data; }
function ymStr(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function tzShort(tz){ if(!tz) return ''; if(tz.includes('Tokyo')) return '東京'; if(tz.includes('Los_Angeles')) return 'LA'; if(tz.includes('New_York')) return 'NY'; return tz.split('/').pop(); }
function range(kcal,pm){ return pm? `${kcal-pm}〜${kcal+pm}` : `${kcal}`; }

document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  ['cal','weight','keys'].forEach(t=>{ document.querySelector('#view-'+t).hidden = t!==b.dataset.tab; });
});

async function render(){
  const ym=ymStr(cursor); $('#ym').textContent=cursor.getFullYear()+'年 '+(cursor.getMonth()+1)+'月';
  const data=await gql(`query($m:String!){calendar(month:$m){date total_kcal total_pm meal_count representative_menu emoji days{tz weight_kg}}}`,{m:ym});
  const me=await gql(`query{me{target_kcal}}`); const TARGET=me.me?.target_kcal||1860;
  const map=Object.fromEntries(data.calendar.map(d=>[d.date,d]));
  const first=new Date(cursor.getFullYear(),cursor.getMonth(),1);
  let startDay=(first.getDay()+6)%7;
  const daysInMonth=new Date(cursor.getFullYear(),cursor.getMonth()+1,0).getDate();
  let html='<div class="grid">'+['月','火','水','木','金','土','日'].map(d=>`<div class="dow">${d}</div>`).join('');
  for(let i=0;i<startDay;i++) html+='<div class="cell empty"></div>';
  for(let d=1;d<=daysInMonth;d++){
    const date=ym+'-'+String(d).padStart(2,'0'); const c=map[date];
    const weights=c? c.days.filter(x=>x.weight_kg!=null).map(x=>`${tzShort(x.tz)} ${x.weight_kg}`).join('<br>'):'';
    html+=`<button class="cell" data-date="${date}"><b>${d}</b>${weights?`<span class="w">${weights}</span>`:''}${c&&c.total_kcal?`<span class="k">${c.total_kcal} kcal</span>`:''}${c&&c.total_kcal>TARGET?`<span class="w" style="color:#d33;font-weight:700">▲ +${c.total_kcal-TARGET} over</span>`:''}${c&&c.representative_menu?`<span class="w">${c.representative_menu.slice(0,10)}</span>`:''}${c&&c.emoji?`<span class="w" style="font-size:15px">${c.emoji}</span>`:''}</button>`;
  }
  html+='</div>'; $('#cal').innerHTML=html;
  document.querySelectorAll('.cell[data-date]').forEach(el=>el.onclick=()=>showDay(el.dataset.date));
  await renderWeight();
  if(map[ym+'-29']) showDay(ym+'-29'); // richest day as default detail in mock
}
async function renderWeight(){
  const w=await gql(`query{weightSeries(from:"2026-01-01",to:"2027-12-31"){std_date date tz weight_kg body_fat_pct}}`);
  const pts=w.weightSeries;
  $('#wlist').innerHTML=pts.map(p=>`<div class="wrow"><span>${p.std_date||p.date}（${tzShort(p.tz)}）</span><b>${p.weight_kg} kg</b><span>${p.body_fat_pct??''}%</span></div>`).join('')||'<p class="hint">まだ体重データなし</p>';
  if(pts.length>1){
    const vals=pts.map(p=>p.weight_kg); const min=Math.min(...vals,99.5), max=Math.max(...vals,103);
    const W=640,H=180,pad=28;
    const X=i=>pad+i*(W-2*pad)/(pts.length-1), Y=v=>H-pad-(v-min)*(H-2*pad)/(max-min);
    const line=pts.map((p,i)=>`${X(i)},${Y(p.weight_kg)}`).join(' ');
    $('#wchart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" class="chart"><line x1="${pad}" y1="${Y(100)}" x2="${W-pad}" y2="${Y(100)}" stroke="#e05252" stroke-dasharray="5 4"/><text x="${W-pad-70}" y="${Y(100)-6}" fill="#e05252" font-size="12">目標 100kg</text><polyline points="${line}" fill="none" stroke="#3aa655" stroke-width="2.5"/>${pts.map((p,i)=>`<circle cx="${X(i)}" cy="${Y(p.weight_kg)}" r="4" fill="#3aa655"/><text x="${X(i)-14}" y="${Y(p.weight_kg)-9}" font-size="11">${p.weight_kg}</text>`).join('')}</svg>`;
  }
}
async function showDay(date){
  const data=await gql(`query($d:String!){day(date:$d){tz day{weight_kg body_fat_pct bmi condition_note emoji} meals{eaten_time meal_type menu kcal kcal_pm status note tags emoji}}}`,{d:date});
  const emo=(data.day.find(s=>s.day&&s.day.emoji)||{}).day?.emoji; let html=`<h2>${date}${emo?` <span style="font-size:26px;vertical-align:-3px">${emo}</span>`:''}</h2>`;
  for(const s of data.day){
    html+=`<h3>${tzShort(s.tz)||s.tz||''}${s.day&&s.day.weight_kg!=null?` ⚖️ ${s.day.weight_kg}kg ・ 体脂肪 ${s.day.body_fat_pct??'-'}% ・ BMI ${s.day.bmi??'-'}`:''}</h3>`;
    if(!s.meals.length) html+='<p class="hint">記録なし</p>';
    let tot=0,pm=0;
    for(const m of s.meals){ if(m.status==='actual'){tot+=m.kcal;pm+=m.kcal_pm;} html+=`<div class="meal s-${m.status}"><span class="time">${m.eaten_time||'--:--'}</span> <b>${m.meal_type}</b>${m.emoji?` ${m.emoji}`:''}${m.tags&&m.tags.length?` <span class="tag">${m.tags.join('・')}</span>`:''} ${m.menu||''} <span class="kcal">${range(m.kcal,m.kcal_pm)} kcal</span> <span class="st">${m.status}</span>${m.note?`<div class="note">${m.note}</div>`:''}</div>`; }
    if(s.meals.length) html+=`<p class="total">合計（actual）: <b>${tot} kcal</b>（${tot-pm}〜${tot+pm}）</p>`;
  }
  $('#detail').innerHTML=html;
}
$('#prev').onclick=()=>{cursor.setMonth(cursor.getMonth()-1);render()};
$('#next').onclick=()=>{cursor.setMonth(cursor.getMonth()+1);render()};
render().catch(e=>{$('#cal').textContent='読み込み失敗: '+e.message});
