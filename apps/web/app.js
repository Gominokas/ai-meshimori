// AIメシモリ PWA — design follows mockup/aiseki-mockup.html; data comes live from /graphql.
// Data stores mirror the template's data block, filled from the API:
//   calendar(month) -> TOT / DAY_EMOJI / PLANNED, day(date) -> DAYS / MEAL_EMOJI, weightSeries -> WEIGHTS.
var TARGET = 1860;
var DAYS = {};
var TOT = {};
var DAY_EMOJI = {};
var MEAL_EMOJI = {};
var PLANNED = {};   // date -> { kcal, emoji } for planned-only cell markers
var WEIGHTS = [];   // [date, kg, fatPct]
var loadedMonths = {};
var selectedDate = null;
var calYM = null;

async function gql(q, v){
  const r = await fetch('/graphql', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ query:q, variables:v }) });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors[0].message);
  return j.data;
}
function mealEmoji(date, m){ return MEAL_EMOJI[date+'|'+m[0]] || ''; }

async function loadMonth(ym){
  if (loadedMonths[ym]) return;
  loadedMonths[ym] = true;
  const d = await gql('query($m:String!){ calendar(month:$m){ date total_kcal emoji planned_kcal planned_emoji } }', { m: ym });
  d.calendar.forEach(function(c){
    if (c.total_kcal) TOT[c.date] = Math.round(c.total_kcal);
    if (c.emoji) DAY_EMOJI[c.date] = c.emoji;
    if (c.planned_kcal) PLANNED[c.date] = { kcal: Math.round(c.planned_kcal), emoji: c.planned_emoji || '' };
  });
}
async function loadDay(date){
  if (DAYS[date]) return;
  const d = await gql('query($d:String!){ day(date:$d){ tz day{ weight_kg body_fat_pct bmi emoji } meals{ eaten_time meal_type tags menu kcal kcal_pm status note place emoji } } }', { d: date });
  let w = null, meals = [];
  d.day.forEach(function(s){
    if (s.day){
      if (s.day.weight_kg != null) w = '⚖️ ' + s.day.weight_kg + 'kg ・ 体脂肪 ' + (s.day.body_fat_pct ?? '-') + '% ・ BMI ' + (s.day.bmi ?? '-');
      if (s.day.emoji) DAY_EMOJI[date] = s.day.emoji;
    }
    s.meals.forEach(function(m){ meals.push(m); });
  });
  DAYS[date] = { w: w, meals: meals.map(function(m){
    const t = m.eaten_time || '--:--';
    if (m.emoji) MEAL_EMOJI[date+'|'+t] = m.emoji;
    return [t, m.meal_type, (m.tags || []).join('・'), m.menu || '', Math.round(m.kcal), Math.round(m.kcal_pm || 0),
            m.status === 'actual' ? 'a' : m.status === 'planned' ? 'p' : 's', m.note || '', m.place || ''];
  })};
}
async function loadWeights(){
  const w = await gql('query{ weightSeries(from:"2025-01-01", to:"2027-12-31"){ std_date date weight_kg body_fat_pct } }');
  WEIGHTS = w.weightSeries.map(function(p){ return [p.std_date || p.date, p.weight_kg, p.body_fat_pct]; });
  renderWeights('month');
}

/* ---- rendering (ported from the template) ---- */
function dayStatus(total){
  if (!total) return null;
  var r = total / TARGET, bg;
  if (r > 1){ var t = Math.min(1, (r - 1) / 0.45); bg = 'hsl(5,80%,' + Math.round(88 - 24*t) + '%)'; }
  else if (r >= 0.65){ var t2 = (r - 0.65) / 0.35; bg = 'hsl(145,50%,' + Math.round(90 - 16*t2) + '%)'; }
  else { var t3 = Math.min(1, (0.65 - r) / 0.65); bg = 'hsl(210,75%,' + Math.round(90 - 22*t3) + '%)'; }
  return { bg: bg };
}
function plannedEmoji(date){
  var info = DAYS[date];
  if (info){
    var ps = info.meals.filter(function(m){ return m[6]==='p'; });
    if (!ps.length) return '';
    var rep = ps.reduce(function(a,b){ return b[4]>a[4]?b:a; });
    return mealEmoji(date, rep) || '🗓️';
  }
  var p = PLANNED[date];
  if (p && p.kcal > 0) return p.emoji || '🗓️';
  return '';
}
function panelRows(date, info){
  return info.meals.map(function(m){
    var st = m[6]==='a' ? '' : (m[6]==='p' ? '（予定）' : '（なし）');
    var em2 = mealEmoji(date, m);
    return '<div class="pmrow"><span class="pt">'+m[0]+'</span><span class="pm">'+(em2? em2+' ':'')+m[1]+' '+m[3]+st+'</span><span class="pk">'+(m[6]==='s'? '' : m[4]+' kcal')+'</span></div>';
  }).join('');
}
async function selectDay(date){
  selectedDate = date;
  if (date.slice(0,7) !== calYM){ calYM = date.slice(0,7); await loadMonth(calYM); renderCalendar(); }
  document.querySelectorAll('#grid .cell').forEach(function(c){
    c.classList.toggle('sel', c.getAttribute('data-selday') === date);
  });
  await loadDay(date);
  var panel = document.getElementById('dayPanel');
  var info = DAYS[date], total = TOT[date];
  var head = '<div class="phead">' + date + (DAY_EMOJI[date] ? ' ' + DAY_EMOJI[date] : '') + (info && info.w ? '　' + info.w : '') + '</div>';
  var btn = '<button class="confirmbtn" data-goday="' + date + '">内容を確認（日詳細へ）</button>';
  var hasMeals = info && info.meals.length;
  if (!hasMeals){
    panel.innerHTML = head + '<p class="hint">この日は記録なし</p>' + btn;
  } else if (!total){
    var ps = info.meals.filter(function(m){ return m[6]==='p'; });
    if (ps.length){
      var pk = ps.reduce(function(s,m){ return s+m[4]; }, 0);
      var ppm = ps.reduce(function(s,m){ return s+(m[5]||0); }, 0);
      panel.innerHTML = head
        + '<p class="total">📅 予定あり（実績はまだなし）<br>予定合計: <b>' + pk + ' kcal</b>' + (ppm ? '（' + (pk-ppm) + '〜' + (pk+ppm) + '）' : '') + ' ／ 標準 ' + TARGET + ' kcal</p>'
        + panelRows(date, info) + btn;
    } else {
      panel.innerHTML = head + '<p class="hint">この日は記録なし</p>' + btn;
    }
  } else {
    panel.innerHTML = head + gaugeBlock(info, date) + panelRows(date, info) + btn;
  }
  var b = panel.querySelector('[data-goday]');
  if (b) b.addEventListener('click', function(){ navigate('day', date); });
}
function fmtYM(ym){ var a = ym.split('-'); return a[0]+'年 '+Number(a[1])+'月'; }
function shiftYM(ym, delta){ var a = ym.split('-'); var d = new Date(Number(a[0]), Number(a[1])-1+delta, 1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function renderCalendar(){
  var g = document.getElementById('grid');
  var a = calYM.split('-'), y = Number(a[0]), m = Number(a[1]);
  var lead = (new Date(y, m-1, 1).getDay()+6)%7;
  var days = new Date(y, m, 0).getDate();
  var html = ["月","火","水","木","金","土","日"].map(function(d){ return '<div class="dow">'+d+'</div>'; }).join('');
  for (var i=0;i<lead;i++) html += '<div class="cell empty"></div>';
  for (var d=1; d<=days; d++){
    var date = calYM + "-" + String(d).padStart(2,'0');
    var st = dayStatus(TOT[date]);
    if (st) html += '<button class="cell" data-selday="'+date+'" style="background:'+st.bg+'"><b>'+d+'</b><span class="emo">'+(DAY_EMOJI[date]||'🍽️')+'</span></button>';
    else {
      var pe = plannedEmoji(date);
      if (pe) html += '<button class="cell plan" data-selday="'+date+'"><b>'+d+'</b><span class="emo faint">'+pe+'</span></button>';
      else html += '<button class="cell none" data-selday="'+date+'"><b>'+d+'</b></button>';
    }
  }
  g.innerHTML = html;
  g.querySelectorAll('[data-selday]').forEach(function(b){
    b.addEventListener('click', function(){ selectDay(b.getAttribute('data-selday')); });
    if (b.getAttribute('data-selday') === selectedDate) b.classList.add('sel');
  });
  if (lastPage !== 'day') document.getElementById('ymLabel').textContent = fmtYM(calYM);
}
function gaugeBlock(info, date, compact){
  var tot=0, pm=0;
  info.meals.forEach(function(m){ if (m[6]==='a'){ tot+=m[4]; pm+=m[5]; } });
  var actuals = info.meals.filter(function(m){ return m[6]==='a'; });
  var scale = Math.max(tot, TARGET);
  var GREENS = ['#3aa655','#63b475','#2f8f4e','#7fc48f','#278046','#8fca9f'];
  var REDS = ['#e05252','#c93f3f','#d94a4a'];
  var gauge = '<div class="gauge">';
  var cum = 0, gi = 0, ri = 0, legend = '';
  actuals.forEach(function(m){
    var k = m[4], type = m[1];
    var from = cum / scale * 100, to = (cum + k) / scale * 100;
    var tPct = TARGET / scale * 100;
    function seg(a2, b2, color){
      if (b2 - a2 <= 0) return '';
      var lbl = (b2 - a2) >= 12 ? type + ' ' + k : '';
      return '<div class="seg" style="left:'+a2+'%;width:'+(b2-a2)+'%;background:'+color+'">'+lbl+'</div>';
    }
    var dotColor;
    if (to <= tPct){ var c = GREENS[gi++ % GREENS.length]; gauge += seg(from, to, c); dotColor = c; }
    else if (from >= tPct){ var c2 = REDS[ri++ % REDS.length]; gauge += seg(from, to, c2); dotColor = c2; }
    else { var cg = GREENS[gi++ % GREENS.length]; var cr = REDS[ri++ % REDS.length];
           gauge += seg(from, tPct, cg) + seg(tPct, to, cr); dotColor = cg; }
    var em = mealEmoji(date, m); legend += '<span><span class="dot" style="background:'+dotColor+'"></span>'+(em? em+' ':'')+type+' '+k+'</span>';
    cum += k;
  });
  if (tot > TARGET){
    gauge += '<div class="tick" style="left:'+(TARGET/scale*100)+'%"><span>標準 '+TARGET+'</span></div>';
  } else if (tot > 0){
    gauge += '<div class="marginfill" style="left:'+(tot/scale*100)+'%;width:'+((TARGET-tot)/scale*100)+'%"></div>';
    gauge += '<div class="glabel dark" style="left:'+(tot/scale*100)+'%">あと '+(TARGET-tot)+'</div>';
  }
  gauge += '</div>';
  if (legend) gauge += '<div class="legend">'+legend+'</div>';
  if (compact) return gauge;
  gauge += '<p class="total">合計（actual）: <b>'+tot+' kcal</b>（'+(tot-pm)+'〜'+(tot+pm)+'） ／ 標準 '+TARGET+' kcal '
    + (tot>TARGET ? '<span class="over">+'+(tot-TARGET)+' over</span>' : '<span class="under">あと '+(TARGET-tot)+' kcal 余裕</span>') + '</p>';
  if (actuals.length){
    var mx = actuals.reduce(function(a,b){ return b[4]>a[4]?b:a; });
    var ins = '';
    if (tot > TARGET){
      if (mx[4] >= (tot-TARGET) && mx[4] >= 500) ins = 'でかいのが効いてる型 — 最大の「'+mx[3]+'」'+mx[4]+'kcal が超過分 '+(tot-TARGET)+'kcal をほぼ説明してる';
      else ins = 'ちっちゃいのが積み上がった型 — 最大でも '+mx[4]+'kcal、数が積もって +'+(tot-TARGET)+'kcal over';
    } else ins = '標準以内 — あと '+(TARGET-tot)+'kcal の余裕、最大は「'+mx[3]+'」'+mx[4]+'kcal';
    gauge += '<div class="insight">'+ins+'</div>';
  }
  return gauge;
}
function renderDay(date){
  var info = DAYS[date];
  var el = document.getElementById('dayBody');
  if (!info || !info.meals.length){ el.innerHTML = '<h2>'+date+'</h2><p class="hint">記録なし</p>'; return; }
  var out = '<h2>'+date+(DAY_EMOJI[date] ? '<span class="dayemoji">'+DAY_EMOJI[date]+'</span>' : '')+'</h2>' + (info.w ? '<div class="dayhead">'+info.w+'</div>' : '<div class="dayhead">体重記録なし（欠損を許す）</div>');
  out += gaugeBlock(info, date);
  info.meals.forEach(function(m){
    var time=m[0], type=m[1], tag=m[2], menu=m[3], kcal=m[4], p=m[5], st=m[6], note=m[7], place=m[8];
    var kc = p ? (kcal-p)+'〜'+(kcal+p) : ''+kcal;
    var stLabel = st==='a'?'actual':(st==='p'?'planned':'skipped');
    var mem = mealEmoji(date, m); out += '<div class="meal '+st+'"><span class="tm">'+time+'</span> <b>'+type+'</b> '+(mem? mem+' ':'')+(tag?'<span class="tag">'+tag+'</span> ':'')
      + '<span class="kc">'+kc+' kcal</span><div>'+menu+' <span class="st">'+stLabel+'</span></div>'
      + (place?'<div class="pl">📍 '+place+'</div>':'') + (note?'<div class="nt">'+note+'</div>':'') + '</div>';
  });
  el.innerHTML = out;
}
function renderWeights(mode){
  var listEl = document.getElementById('wlist');
  var noteEl = document.getElementById('wnote');
  var chartEl = document.getElementById('wchart');
  if (!WEIGHTS.length){ listEl.innerHTML = '<p class="hint">まだ体重データなし</p>'; chartEl.innerHTML=''; return; }
  var vals = WEIGHTS.map(function(r){ return r[1]; });
  var min = Math.min.apply(null, vals.concat([99.5])), max = Math.max.apply(null, vals.concat([103]));
  var W=640, H=190, pad=28;
  var X = function(i){ return WEIGHTS.length===1 ? W/2 : pad + i*(W-2*pad)/(WEIGHTS.length-1); };
  var Y = function(v){ return H-pad - (v-min)*(H-2*pad)/(max-min); };
  var line = WEIGHTS.map(function(r,i){ return X(i)+','+Y(r[1]); }).join(' ');
  chartEl.innerHTML = '<svg class="chart" viewBox="0 0 '+W+' '+H+'">'
    + '<line x1="'+pad+'" y1="'+Y(100)+'" x2="'+(W-pad)+'" y2="'+Y(100)+'" stroke="#e05252" stroke-dasharray="5 4"/>'
    + '<text x="'+(W-pad-96)+'" y="'+(Y(100)-8)+'" fill="#e05252" font-size="12">目標 100kg</text>'
    + '<polyline points="'+line+'" fill="none" stroke="#3aa655" stroke-width="2.5"/>'
    + WEIGHTS.map(function(r,i){ return '<circle cx="'+X(i)+'" cy="'+Y(r[1])+'" r="4" fill="#3aa655"/><text x="'+Math.max(2,X(i)-16)+'" y="'+(Y(r[1])-9)+'" font-size="11">'+r[1]+'</text>'; }).join('')
    + '</svg>';
  if (mode === 'year'){
    var byMonth = {};
    WEIGHTS.forEach(function(r){ var ym = r[0].slice(0,7); (byMonth[ym] = byMonth[ym] || []).push(r[1]); });
    listEl.innerHTML = Object.keys(byMonth).sort().map(function(ym){
      var avg = byMonth[ym].reduce(function(s,v){ return s+v; }, 0) / byMonth[ym].length;
      return '<div class="wrow"><span>'+ym.replace('-','年')+'月（月平均）</span><b>'+avg.toFixed(1)+' kg</b><span>'+byMonth[ym].length+'日分</span></div>';
    }).join('') + '<p class="hint">年表示は月平均のみ。日別は月表示で見る。</p>';
    noteEl.textContent = '年表示: 月ごとの平均で集計';
  } else if (mode === 'week'){
    listEl.innerHTML = WEIGHTS.slice(-7).map(function(r){
      return '<div class="wrow"><span>'+r[0]+'（東京）</span><b>'+r[1]+' kg</b><span>'+(r[2]??'')+'%</span></div>';
    }).join('');
    noteEl.textContent = '週表示: 直近7件の日別ポイント';
  } else {
    listEl.innerHTML = WEIGHTS.map(function(r){
      return '<div class="wrow"><span>'+r[0]+'（東京）</span><b>'+r[1]+' kg</b><span>'+(r[2]??'')+'%</span></div>';
    }).join('');
    noteEl.textContent = '月表示: 日別の実測ポイント';
  }
}

/* ---- hash router (same as template) ---- */
var lastPage = 'calendar';
function applyRoute(name, arg){
  var page = (name==='day') ? 'day' : (name || 'calendar');
  if (!document.getElementById('page-'+page)) page = 'calendar';
  if (page==='day' && arg){ loadDay(arg).then(function(){ renderDay(arg); }); }
  document.querySelectorAll('.page').forEach(function(s){
    var on = s.id === 'page-'+page;
    s.classList.toggle('on', on);
    s.classList.toggle('back', on && page==='calendar');
  });
  document.querySelectorAll('nav.tabs a').forEach(function(a){
    a.classList.toggle('on', a.getAttribute('data-nav') === (page==='day' ? 'calendar' : page));
  });
  document.getElementById('ymLabel').textContent = (page==='day' && arg) ? arg : fmtYM(calYM);
  lastPage = page;
  window.scrollTo(0,0);
}
function route(){
  var parts = (location.hash || '#/calendar').replace('#/','').split('/');
  applyRoute(parts[0] || 'calendar', parts[1]);
}
function navigate(name, arg){
  try { var h = '#/' + name + (arg ? '/' + arg : ''); if (location.hash !== h) location.hash = h; } catch(e) {}
  applyRoute(name, arg);
}
window.addEventListener('hashchange', route);
document.querySelectorAll('nav.tabs a').forEach(function(a){
  a.addEventListener('click', function(e){ e.preventDefault(); navigate(a.getAttribute('data-nav')); });
});
document.getElementById('backToCal').addEventListener('click', function(){ navigate('calendar'); });
document.getElementById('prevM').addEventListener('click', async function(){ calYM = shiftYM(calYM, -1); await loadMonth(calYM); renderCalendar(); });
document.getElementById('nextM').addEventListener('click', async function(){ calYM = shiftYM(calYM, 1); await loadMonth(calYM); renderCalendar(); });
document.querySelectorAll('#wseg button').forEach(function(b){
  b.addEventListener('click', function(){
    document.querySelectorAll('#wseg button').forEach(function(x){ x.classList.remove('on'); });
    b.classList.add('on');
    renderWeights(b.getAttribute('data-w'));
  });
});

/* ---- init ---- */
(async function init(){
  try {
    const me = await gql('query{ me{ target_kcal current_tz } }');
    let tz = 'Asia/Tokyo';
    if (me.me){ if (me.me.target_kcal) TARGET = me.me.target_kcal; if (me.me.current_tz) tz = me.me.current_tz; }
    selectedDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    calYM = selectedDate.slice(0,7);
    await loadMonth(calYM);
    renderCalendar();
    route();
    await selectDay(selectedDate);
    loadWeights().catch(function(){});
  } catch(e) {
    document.getElementById('grid').innerHTML = '<p class="hint">読み込み失敗: ' + e.message + '</p>';
  }
})();
