/* LegitShop API Console — trang tĩnh, gọi thẳng backend New API bằng key của khách. */
(function(){
'use strict';
const CFG = window.LS_CONFIG || {};
const API = String(CFG.API_BASE || '').replace(/\/+$/, '');
const QPC = CFG.QUOTA_PER_CREDIT || 100000;
const SETUP = String(CFG.SETUP_BASE || CFG.API_BASE || '').replace(/\/+$/, '');
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- định dạng số (kiểu Việt Nam) ---------- */
const nf = n => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const cr = q => (Number(q) || 0) / QPC;
function crfmt(v){
  v = Number(v) || 0;
  const a = Math.abs(v);
  if (a >= 100) return Math.round(v).toLocaleString('vi-VN');
  if (a >= 1) return v.toLocaleString('vi-VN', {maximumFractionDigits: 2});
  if (a === 0) return '0';
  return v.toLocaleString('vi-VN', {maximumSignificantDigits: 3});
}
function tk(n){
  n = Number(n) || 0;
  if (n >= 1e9) return (n/1e9).toLocaleString('vi-VN',{maximumFractionDigits:2}) + 'B';
  if (n >= 1e6) return (n/1e6).toLocaleString('vi-VN',{maximumFractionDigits:2}) + 'M';
  if (n >= 1e3) return (n/1e3).toLocaleString('vi-VN',{maximumFractionDigits:1}) + 'K';
  return String(Math.round(n));
}
function rel(ts){
  const s = Math.max(0, Math.floor(Date.now()/1000 - ts));
  if (s < 60) return s + 's trước';
  if (s < 3600) return Math.floor(s/60) + ' phút trước';
  if (s < 86400) return Math.floor(s/3600) + ' giờ trước';
  return Math.floor(s/86400) + ' ngày trước';
}
const pad = n => String(n).padStart(2, '0');
function toast(msg){ const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800); }
async function copy(text, label){
  try { await navigator.clipboard.writeText(text); toast('Đã chép ' + (label || '')); }
  catch(_) { toast('Không chép được, hãy chọn và chép tay'); }
}

/* ---------- họ model ---------- */
function fam(id){
  id = String(id || '').toLowerCase();
  if (id.includes('claude')) return 'claude';
  if (id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3') || id.includes('codex')) return 'gpt';
  if (id.includes('gemini')) return 'gemini';
  if (id.includes('glm')) return 'glm';
  if (id.includes('deepseek')) return 'deepseek';
  return 'other';
}
const FAM_COLOR = {claude:'var(--primary)', gpt:'#10a37f', gemini:'#8b5cf6', glm:'#e8590c', deepseek:'#3b82f6', other:'#7184ad'};

/* ---------- token thật của một dòng log ---------- */
function other(l){
  if (!l) return {};
  if (l._o) return l._o;
  let o = l.other;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch(_) { o = {}; } }
  return (l._o = o || {});
}
/* New API: với kiểu Anthropic, prompt_tokens CHƯA gồm cache nên cộng vào;
   kiểu OpenAI thì prompt_tokens đã gồm cache. */
function io(l){
  const o = other(l);
  const p = Math.max(0, Number(l.prompt_tokens) || 0);
  const cRead = Math.max(0, Number(o.cache_tokens) || 0);
  const cWrite = Math.max(0, Number(o.cache_creation_tokens) || 0);
  const anth = String(o.usage_semantic || '') === 'anthropic';
  const input = anth ? p + cRead + cWrite : p;
  return {input, cached: Math.min(input, cRead), output: Math.max(0, Number(l.completion_tokens) || 0)};
}
const isErr = l => l.type === 5 || (l.content && /error|fail|invalid|denied|unauthor/i.test(String(l.content)));

/* ---------- trạng thái ---------- */
let usage = null, logs = [], keyModels = null, pricing = null, statusData = null, feed = null;
let page = 0, pageSize = 50, timer = null, demo = false;

function setLive(state, txt){ const el = $('liveTag'); el.className = 'live ' + state; $('liveTxt').textContent = txt; }
function showErr(msg){ const e = $('err'); if (msg) { e.textContent = msg; e.hidden = false; } else e.hidden = true; }

/* ---------- gọi API ---------- */
function keyVal(){ return $('key').value.trim(); }
async function call(path, opt){
  const r = await fetch(API + path, Object.assign({cache: 'no-store', headers: {'Authorization': 'Bearer ' + keyVal()}}, opt || {}));
  if (r.status === 401) throw new Error('Key không hợp lệ hoặc đã bị vô hiệu hóa.');
  if (r.status === 429) throw new Error('Gọi quá nhanh, thử lại sau ít giây.');
  if (!r.ok) throw new Error('Máy chủ trả lỗi ' + r.status + '.');
  return r.json();
}
/* Dữ liệu công khai: đọc bản sao trong data/ do GitHub Actions tải (backend không bật CORS cho các file này);
   không có bản sao thì thử gọi thẳng. */
async function pub(remotePath, localFile){
  try { const r = await fetch('data/' + localFile + '?t=' + Math.floor(Date.now()/60000), {cache: 'no-store'}); if (r.ok) return await r.json(); } catch(_) {}
  try { const r = await fetch(API + remotePath, {cache: 'no-store'}); if (r.ok) return await r.json(); } catch(_) {}
  return null;
}

async function refresh(){
  if (demo) return;
  const k = keyVal();
  if (!k) return;
  if (!usage) setLive('loading', 'Đang tải...');
  try {
    showErr('');
    const [u, l, m] = await Promise.all([
      call('/api/usage/token/'),
      call('/api/log/token'),
      call('/v1/models').catch(() => null)
    ]);
    if (keyVal() !== k) return;
    usage = (u && u.data) || {};
    logs = (Array.isArray(l && l.data) ? l.data : []).slice().sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    keyModels = m && Array.isArray(m.data) ? m.data.map(x => x.id).filter(Boolean) : null;
    renderAll();
    setLive('on', 'Trực tuyến');
    $('updatedTxt').textContent = 'Cập nhật lúc ' + new Date().toLocaleTimeString('vi-VN');
  } catch (e) {
    setLive('off', 'Lỗi');
    showErr(e && e.message === 'Failed to fetch' ? 'Không kết nối được máy chủ API. Kiểm tra mạng rồi thử lại.' : (e.message || String(e)));
  }
}

function startKey(){
  demo = false;
  usage = null; logs = []; keyModels = null; page = 0;
  try { if ($('remember').checked) localStorage.setItem('ls-key', keyVal()); else localStorage.removeItem('ls-key'); } catch(_) {}
  clearInterval(timer);
  refresh();
  if (CFG.REFRESH_SEC) timer = setInterval(() => { if (!document.hidden) refresh(); }, CFG.REFRESH_SEC * 1000);
}

/* ---------- render ---------- */
function renderAll(){
  renderHero(); renderMinis(); renderSplit(); renderRecords(); renderAct(); renderDays(); renderLogs();
  renderStatus(); renderSetup(); renderPricing(); fillTestModels();
}

function renderHero(){
  const u = usage;
  const tag = $('heroTag'), bar = $('heroBar');
  if (!u) {
    $('heroBal').textContent = '—'; $('heroSub').textContent = 'Nhập key để xem số dư';
    $('heroLeft').textContent = '—'; $('heroTotal').textContent = '—'; tag.className = 'pill'; tag.textContent = '—';
    bar.style.width = '0'; $('expLeft').textContent = '—'; $('expAt').textContent = ''; return;
  }
  if (u.unlimited_quota) {
    $('heroBal').textContent = '∞'; $('heroSub').textContent = 'Key không giới hạn Credit';
    bar.style.width = '100%'; tag.className = 'pill ok'; tag.textContent = 'Không giới hạn';
    $('heroLeft').textContent = 'Đã dùng ' + crfmt(cr(u.total_used)) + ' Credit'; $('heroTotal').textContent = '';
  } else {
    const g = Number(u.total_granted) || 0, a = Number(u.total_available) || 0;
    const left = g > 0 ? Math.max(0, Math.min(100, a / g * 100)) : (a > 0 ? 100 : 0);
    const lv = left < 10 ? 'crit' : left < 25 ? 'warn' : 'ok';
    $('heroBal').textContent = crfmt(cr(a));
    $('heroSub').textContent = 'Credit còn lại';
    bar.style.width = Math.max(left > 0 ? 1.5 : 0, left).toFixed(1) + '%';
    bar.parentElement.className = 'bar' + (lv === 'ok' ? '' : ' ' + lv);
    tag.className = 'pill ' + lv; tag.textContent = lv === 'crit' ? 'Sắp hết' : lv === 'warn' ? 'Còn ít' : 'Đang hoạt động';
    $('heroLeft').textContent = 'Còn lại ' + crfmt(cr(a)) + ' Credit (' + left.toFixed(0) + '%)';
    $('heroTotal').textContent = 'Tổng ' + crfmt(cr(g)) + ' Credit';
  }
  const ex = Number(u.expires_at);
  if (!ex || ex <= 0) { $('expLeft').textContent = 'Không hết hạn'; $('expAt').textContent = ''; }
  else {
    const s = ex - Date.now()/1000, d = new Date(ex * 1000);
    $('expLeft').textContent = s <= 0 ? 'Đã hết hạn' : ('còn ' + Math.floor(s/86400) + ' ngày ' + Math.floor(s % 86400 / 3600) + ' giờ');
    $('expAt').textContent = '· Hết hạn ' + pad(d.getDate()) + '/' + pad(d.getMonth()+1) + '/' + d.getFullYear() + ' · ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (s <= 0) { tag.className = 'pill crit'; tag.textContent = 'Hết hạn'; }
  }
}

function sameDay(ts, ref){ const a = new Date(ts * 1000), b = ref || new Date(); return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function agg(arr){ return arr.reduce((s, l) => { const b = io(l); s.i += b.input; s.o += b.output; s.q += Number(l.quota) || 0; s.n++; return s; }, {i: 0, o: 0, q: 0, n: 0}); }

function renderMinis(){
  const t = agg(logs.filter(l => sameDay(l.created_at))), all = agg(logs);
  $('mTok').textContent = tk(t.i + t.o);
  $('mTokSub').textContent = t.n ? 'vào ' + tk(t.i) + ' / ra ' + tk(t.o) : (logs.length ? 'Lần cuối ' + rel(logs[0].created_at) : 'Chưa có request');
  $('mCr').innerHTML = esc(crfmt(cr(t.q))) + '<small>Cr</small>';
  $('mCrSub').textContent = 'Tổng: ' + crfmt(cr(all.q)) + ' Cr';
  $('mReq').textContent = nf(t.n);
  $('mReqSub').textContent = 'Tổng: ' + nf(all.n) + (logs.length >= 1000 ? '+' : '');
  const sp = logs.filter(l => Number(l.use_time) > 0 && Number(l.completion_tokens) > 0);
  const tps = sp.length ? sp.reduce((s, l) => s + Number(l.completion_tokens) / Number(l.use_time), 0) / sp.length : 0;
  const avgT = sp.length ? sp.reduce((s, l) => s + Number(l.use_time), 0) / sp.length : 0;
  $('mSpd').innerHTML = sp.length ? esc(tps.toLocaleString('vi-VN', {maximumFractionDigits: 1})) + '<small>tok/s</small>' : '—';
  $('mSpdSub').textContent = sp.length ? 'phản hồi TB ' + avgT.toLocaleString('vi-VN', {maximumFractionDigits: 1}) + 's' : ' ';
}

function byModel(){
  const m = {};
  logs.forEach(l => {
    const id = String(l.model_name || '—'), b = io(l);
    const r = m[id] || (m[id] = {id, n: 0, i: 0, o: 0, q: 0});
    r.n++; r.i += b.input; r.o += b.output; r.q += Number(l.quota) || 0;
  });
  return Object.values(m).sort((a, b) => (b.i + b.o) - (a.i + a.o));
}

function renderSplit(){
  const rows = byModel(), all = agg(logs);
  $('splitMeta').textContent = rows.length ? rows.length + ' model đã dùng' : '—';
  $('splitTotals').innerHTML = rows.length ? '<div><span>Tổng token</span><b>' + tk(all.i + all.o) + '</b></div><div><span>Request</span><b>' + nf(all.n) + '</b></div><div><span>Credit đã trừ</span><b>' + crfmt(cr(all.q)) + '</b></div>' : '';
  if (!rows.length) { $('splitBody').innerHTML = '<div class="empty">Phân bổ hiện khi có request</div>'; return; }
  const max = rows[0].i + rows[0].o || 1;
  $('splitBody').innerHTML = rows.slice(0, 8).map(r => {
    const f = fam(r.id);
    return '<div class="srow"><span class="nm"><i class="fam ' + f + '"></i>' + esc(r.id) + '</span>'
      + '<span class="vl">' + tk(r.i + r.o) + ' <small>token · ' + crfmt(cr(r.q)) + ' Cr</small></span>'
      + '<span class="tr"><i style="width:' + ((r.i + r.o) / max * 100).toFixed(1) + '%;background:' + FAM_COLOR[f] + '"></i></span>'
      + '<span class="sb"><span>request ' + nf(r.n) + '</span><span>vào ' + tk(r.i) + '</span><span>ra ' + tk(r.o) + '</span></span></div>';
  }).join('') + (rows.length > 8 ? '<p class="note">và ' + (rows.length - 8) + ' model khác</p>' : '');
}

function dayKey(ts){ const d = new Date(ts * 1000); return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }

function renderRecords(){
  const box = $('records');
  if (!logs.length) { box.innerHTML = '<div class="empty" style="grid-column:1/-1">Kỷ lục hiện khi có request</div>'; $('recMeta').textContent = '—'; return; }
  const days = {};
  logs.forEach(l => { const k = dayKey(l.created_at), b = io(l); const d = days[k] || (days[k] = {n: 0, t: 0}); d.n++; d.t += b.input + b.output; });
  const dk = Object.keys(days).sort();
  const best = dk.reduce((a, k) => days[k].n > (days[a] ? days[a].n : -1) ? k : a, dk[0]);
  let big = null, bigT = 0, fast = null, fastV = 0;
  logs.forEach(l => {
    const b = io(l), t = b.input + b.output;
    if (t > bigT) { bigT = t; big = l; }
    const ut = Number(l.use_time);
    if (ut > 0 && b.output > 50) { const v = b.output / ut; if (v > fastV) { fastV = v; fast = l; } }
  });
  // chuỗi ngày liên tiếp tính tới ngày gần nhất có dữ liệu
  let streak = 0; const set = new Set(dk);
  for (let d = new Date(dk[dk.length - 1] + 'T12:00:00'); set.has(dayKey(d.getTime()/1000)); d.setDate(d.getDate() - 1)) streak++;
  $('recMeta').textContent = dk.length + ' ngày có dữ liệu';
  const bd = best.split('-');
  box.innerHTML =
    rec('▲ Ngày sôi động nhất', nf(days[best].n) + ' req', bd[2] + '/' + bd[1] + ' · ' + tk(days[best].t) + ' tok') +
    rec('◆ Request lớn nhất', tk(bigT) + ' tok', big ? big.model_name : '') +
    rec('⚡ Tốc độ đỉnh cao', fast ? fastV.toLocaleString('vi-VN', {maximumFractionDigits: 1}) + ' tok/s' : '—', fast ? fast.model_name : '') +
    rec('○ Chuỗi ngày liên tiếp', streak + ' ngày', 'tổng ' + dk.length + ' ngày hoạt động');
  function rec(t, v, s){ return '<div class="rec"><span class="ic">' + esc(t) + '</span><b>' + esc(v) + '</b><small>' + esc(s) + '</small></div>'; }
}

function bars(el, vals, tips, peakIdx){
  const max = Math.max(1, ...vals);
  el.innerHTML = vals.map((v, i) => '<i class="b' + (v ? '' : ' zero') + (i === peakIdx && v ? ' peak' : '') + '" style="height:' + (v ? Math.max(4, v / max * 100) : 2) + '%" title="' + esc(tips[i]) + '"></i>').join('');
}

function renderAct(){
  const now = Date.now()/1000, n = Array(24).fill(0), t = Array(24).fill(0), hours = [];
  for (let i = 0; i < 24; i++) hours.push(new Date((now - (23 - i) * 3600) * 1000).getHours());
  logs.forEach(l => { const ago = Math.floor((now - l.created_at) / 3600); if (ago >= 0 && ago < 24) { const b = io(l); n[23 - ago]++; t[23 - ago] += b.input + b.output; } });
  const total = n.reduce((a, b) => a + b, 0), pk = n.indexOf(Math.max(...n));
  bars($('actBars'), n, n.map((v, i) => hours[i] + 'h · ' + v + ' request · ' + tk(t[i]) + ' token'), pk);
  $('actMeta').textContent = total + ' request / 24h';
  $('actNote').innerHTML = total ? 'Giờ cao điểm <b>' + hours[pk] + 'h</b> với <b>' + n[pk] + ' request</b> · tổng <b>' + tk(t.reduce((a, b) => a + b, 0)) + ' token</b> trong 24h' : 'Chưa có hoạt động trong 24 giờ qua';
}

function renderDays(){
  const days = [], today = new Date(); today.setHours(12, 0, 0, 0);
  for (let i = 13; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); days.push({k: dayKey(d.getTime()/1000), d, n: 0, q: 0}); }
  const idx = {}; days.forEach((x, i) => idx[x.k] = i);
  logs.forEach(l => { const i = idx[dayKey(l.created_at)]; if (i != null) { days[i].n++; days[i].q += Number(l.quota) || 0; } });
  const n = days.map(x => x.n), total = n.reduce((a, b) => a + b, 0), pk = n.indexOf(Math.max(...n));
  bars($('d14Bars'), n, days.map(x => pad(x.d.getDate()) + '/' + pad(x.d.getMonth()+1) + ' · ' + x.n + ' request · ' + crfmt(cr(x.q)) + ' Cr'), pk);
  $('d14Axis').innerHTML = days.map((x, i) => '<span>' + (i % 2 === 1 ? pad(x.d.getDate()) : '') + '</span>').join('');
  $('d14Meta').textContent = nf(total) + ' request';
  const used = days.filter(x => x.n), tdy = days[13], yst = days[12];
  const diff = yst.n ? Math.round((tdy.n - yst.n) / yst.n * 100) : null;
  const avg = used.length ? used.reduce((a, x) => a + x.q, 0) / used.length : 0;
  $('d14Stats').innerHTML =
    '<div><span>Hôm nay</span><b>' + nf(tdy.n) + ' req</b><small class="' + (diff == null ? '' : diff >= 0 ? 'up' : 'down') + '">' + (diff == null ? '&nbsp;' : (diff >= 0 ? '↑ ' : '↓ ') + Math.abs(diff) + '% so hôm qua') + '</small></div>' +
    '<div><span>TB mỗi ngày</span><b>' + crfmt(cr(avg)) + ' Cr</b><small>trên ' + used.length + ' ngày có dùng</small></div>' +
    '<div><span>Số ngày dùng</span><b>' + used.length + ' ngày</b><small>' + (total ? 'cao nhất ' + pad(days[pk].d.getDate()) + '/' + pad(days[pk].d.getMonth()+1) : '&nbsp;') + '</small></div>';
}

function renderLogs(){
  const body = $('logBody'), total = logs.length, pages = Math.max(1, Math.ceil(total / pageSize));
  page = Math.min(page, pages - 1);
  const from = page * pageSize, rows = logs.slice(from, from + pageSize);
  $('logMeta').textContent = total ? 'Mới nhất ' + rel(logs[0].created_at) : '—';
  if (!rows.length) body.innerHTML = '<tr><td colspan="7"><div class="empty"><b>Chưa có request nào</b>Gọi API bằng key này rồi quay lại xem.</div></td></tr>';
  else {
    let last = '';
    body.innerHTML = rows.map(l => {
      const d = new Date(l.created_at * 1000), k = d.toDateString(), b = io(l), er = isErr(l), ut = Number(l.use_time) || 0;
      const sep = k !== last ? '<tr class="daysep"><td colspan="7">' + esc(d.toLocaleDateString('vi-VN', {weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric'})) + ' · ' + rel(l.created_at) + '</td></tr>' : '';
      last = k;
      return sep + '<tr' + (er ? ' class="err"' : '') + '>'
        + '<td class="num" style="text-align:left">' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '</td>'
        + '<td class="mdl"><i class="fam ' + fam(l.model_name) + '"></i>' + esc(l.model_name || '—') + (ut ? '<span class="sub">' + ut + 's' + (l.is_stream ? ' · stream' : '') + '</span>' : '') + '</td>'
        + '<td class="num">' + nf(b.input) + '</td>'
        + '<td class="num' + (b.cached ? '' : ' dim') + '">' + (b.cached ? nf(b.cached) : '—') + '</td>'
        + '<td class="num">' + nf(b.output) + '</td>'
        + '<td class="num"><b>' + crfmt(cr(l.quota)) + '</b></td>'
        + '<td><span class="st' + (er ? ' bad' : '') + '">' + (er ? 'Lỗi' : 'Thành công') + '</span></td></tr>';
    }).join('');
  }
  $('pgInfo').textContent = total ? 'Dòng ' + nf(from + 1) + '–' + nf(from + rows.length) + ' trên ' + nf(total) + (total >= 1000 ? ' (máy chủ trả tối đa 1.000 dòng gần nhất)' : '') : 'Chưa có dòng nào';
  $('pgPos').textContent = (page + 1) + ' / ' + pages;
  $('pgFirst').disabled = $('pgPrev').disabled = page <= 0;
  $('pgNext').disabled = $('pgLast').disabled = page >= pages - 1;
}

/* ---------- trạng thái model (status.json) ---------- */
const VENDOR_NAME = {anthropic: 'Anthropic Claude', gpt: 'OpenAI GPT', gemini: 'Google Gemini', china: 'GLM & DeepSeek'};
function renderStatus(){
  const s = statusData;
  if (!s || !Array.isArray(s.models)) { $('stMeta').textContent = 'Chưa có dữ liệu'; $('stGroups').innerHTML = '<div class="empty">Không tải được trạng thái model</div>'; return; }
  let models = s.models.slice();
  if (keyModels) { const allow = new Set(keyModels.map(x => x.replace(/\[1m\]$/, ''))); const f = models.filter(m => allow.has(m.id)); if (f.length) models = f; }
  const st = m => m.state === 'operational' ? 'ok' : (m.state === 'degraded' || m.state === 'slow') ? 'slow' : 'bad';
  const c = {ok: 0, slow: 0, bad: 0}; models.forEach(m => c[st(m)]++);
  $('stMeta').textContent = models.length + ' model' + (s.updated ? ' · cập nhật ' + rel(s.updated) : '');
  $('stSum').innerHTML = '<span class="st">● ' + c.ok + ' Hoạt động</span><span class="st slow">▲ ' + c.slow + ' Chậm</span><span class="st bad">■ ' + c.bad + ' Lỗi</span>';
  const groups = {};
  models.forEach(m => (groups[m.group || 'other'] = groups[m.group || 'other'] || []).push(m));
  const has1m = id => keyModels && keyModels.includes(id + '[1m]');
  $('stGroups').innerHTML = Object.keys(groups).map(g => '<div class="vgroup"><h3>' + esc(VENDOR_NAME[g] || g) + '<small>' + groups[g].length + ' model</small></h3><div class="mgrid">' + groups[g].map(m => {
    const k = st(m), av = Number(m.availability_24h != null ? m.availability_24h : m.availability) || 0;
    const ms = Number(m.dialog_ms) || 0, hist = (m.history || []).slice(-24);
    return '<button type="button" class="mcard" data-id="' + esc(m.id) + '"><span class="mt"><span class="id">' + esc(m.id) + '</span>' + (has1m(m.id) ? '<span class="badge1m">1M</span>' : '') + '</span>'
      + '<span class="spark">' + hist.map(h => '<i class="s' + (h.c === 2 ? 2 : h.c === 1 ? 1 : 0) + '" style="height:' + (h.c === 2 ? 100 : h.c === 1 ? 60 : 35) + '%"></i>').join('') + '</span>'
      + '<span class="ms"><span class="st' + (k === 'ok' ? '' : ' ' + k) + '">' + (k === 'ok' ? '● Hoạt động' : k === 'slow' ? '▲ Chậm' : '■ Lỗi') + '</span>'
      + '<span>' + av.toLocaleString('vi-VN', {maximumFractionDigits: 1}) + '% ổn định</span><span>' + (ms >= 1000 ? (ms/1000).toLocaleString('vi-VN', {maximumFractionDigits: 1}) + 's' : ms + 'ms') + '</span></span></button>';
  }).join('') + '</div></div>').join('');
}

/* ---------- cài đặt ---------- */
function modelList(){
  if (keyModels && keyModels.length) return keyModels.slice();
  if (statusData && statusData.models) return statusData.models.map(m => m.id);
  return [];
}
function pick(ids, re){ return ids.filter(id => re.test(id) && !/thinking|\[1m\]/.test(id)).sort(verSort)[0]; }
function verSort(a, b){ const v = s => (String(s).match(/(\d+(?:\.\d+)?)/g) || ['0']).map(Number); const x = v(a), y = v(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (y[i] || 0) - (x[i] || 0); if (d) return d; } return a.localeCompare(b); }
function hl(json){
  return esc(json).replace(/&quot;([^&]+?)&quot;(\s*:)/g, '<span class="k">&quot;$1&quot;</span>$2')
    .replace(/:\s*&quot;([^&]*?)&quot;/g, ': <span class="s">&quot;$1&quot;</span>')
    .replace(/:\s*(true|false)/g, ': <span class="y">$1</span>');
}
const raw = {};
function renderSetup(){
  const k = keyVal(), ids = modelList();
  const opus = pick(ids, /opus/), sonnet = pick(ids, /sonnet/), haiku = pick(ids, /haiku/), any = ids[0] || 'TEN_MODEL';
  const fO = opus || sonnet || haiku || any, fS = sonnet || opus || haiku || any, fH = haiku || sonnet || opus || any;
  const with1m = id => ids.includes(id + '[1m]') ? id + '[1m]' : id;
  const cfg = {env: {
      ANTHROPIC_AUTH_TOKEN: k || 'YOUR_TOKEN', ANTHROPIC_BASE_URL: SETUP,
      ANTHROPIC_DEFAULT_OPUS_MODEL: with1m(fO), ANTHROPIC_DEFAULT_SONNET_MODEL: with1m(fS), ANTHROPIC_DEFAULT_HAIKU_MODEL: fH,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_MAX_OUTPUT_TOKENS: '32000'},
    model: opus ? 'opus' : sonnet ? 'sonnet' : haiku ? 'haiku' : any};
  raw.cfgClaude = JSON.stringify(cfg, null, 2);
  const pv = JSON.parse(raw.cfgClaude); if (k) pv.env.ANTHROPIC_AUTH_TOKEN = 'sk-••••••••';
  $('cfgClaude').innerHTML = hl(JSON.stringify(pv, null, 2));
  const cx = pick(ids, /^gpt-/) || pick(ids, /codex/) || fO;
  raw.cfgCodex = ['model = "' + cx + '"', 'model_provider = "' + CFG.CODEX_PROVIDER + '"', '', '[model_providers.' + CFG.CODEX_PROVIDER + ']', 'name = "LegitShop API"', 'base_url = "' + SETUP + '/v1"', 'env_key = "' + CFG.CODEX_ENV_KEY + '"', 'wire_api = "responses"'].join('\n');
  $('cfgCodex').textContent = raw.cfgCodex;
  $('codexEnv').textContent = CFG.CODEX_ENV_KEY + '=' + (k ? 'sk-••••••••' : 'YOUR_TOKEN');
  const curl = m => 'curl ' + SETUP + '/v1/chat/completions \\\n  -H "Authorization: Bearer ' + m + '" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"' + fS + '","messages":[{"role":"user","content":"Xin chào"}]}\'';
  raw.cfgCurl = curl(k || 'YOUR_TOKEN');
  $('cfgCurl').textContent = curl(k ? 'sk-••••••••' : 'YOUR_TOKEN');
}

function keyGroup(){ return (usage && usage.group) || (logs[0] && logs[0].group) || 'default'; }
function renderPricing(){
  const body = $('priceBody');
  if (!pricing || !Array.isArray(pricing.data)) { body.innerHTML = '<tr><td colspan="4"><div class="empty">Chưa tải được bảng giá</div></td></tr>'; $('priceMeta').textContent = '—'; return; }
  const g = keyGroup(), gr = (pricing.group_ratio || {})[g];
  const ratio = typeof gr === 'number' ? gr : (pricing.group_ratio || {})['default'] || 1;
  let rows = pricing.data.filter(r => r.quota_type === 0 && typeof r.model_ratio === 'number');
  if (keyModels) { const s = new Set(keyModels); const f = rows.filter(r => s.has(r.model_name)); if (f.length) rows = f; }
  else rows = rows.filter(r => !r.enable_groups || r.enable_groups.includes(g));
  rows.sort((a, b) => fam(a.model_name).localeCompare(fam(b.model_name)) || verSort(a.model_name, b.model_name));
  const bal = usage && !usage.unlimited_quota ? Number(usage.total_available) || 0 : 0;
  $('priceMeta').textContent = 'Nhóm key: ' + g + ' · hệ số ' + ratio;
  body.innerHTML = rows.map(r => {
    const inC = r.model_ratio * ratio * 1e6 / QPC, outC = inC * (r.completion_ratio || 1);
    const tokens = bal && r.model_ratio ? bal / (r.model_ratio * ratio) : 0;
    return '<tr><td class="mdl"><i class="fam ' + fam(r.model_name) + '"></i>' + esc(r.model_name) + '</td><td class="num">' + crfmt(inC) + '</td><td class="num">' + crfmt(outC) + '</td><td class="num">' + (tokens ? '~' + tk(tokens) + ' vào' : '<span class="dim">—</span>') + '</td></tr>';
  }).join('') || '<tr><td colspan="4"><div class="empty">Không có model nào</div></td></tr>';
}

/* ---------- thử key ---------- */
function fillTestModels(){
  const sel = $('testModel'), cur = sel.value, ids = (keyModels || []).slice().sort((a, b) => fam(a).localeCompare(fam(b)) || verSort(a, b));
  if (!ids.length) { sel.innerHTML = '<option value="">' + (keyVal() ? 'Không tải được danh sách model' : 'Nhập key để tải danh sách model') + '</option>'; return; }
  sel.innerHTML = ids.map(id => '<option' + (id === cur ? ' selected' : '') + '>' + esc(id) + '</option>').join('');
}
async function runTest(e){
  e.preventDefault();
  const model = $('testModel').value, msg = $('testMsg').value.trim();
  if (!keyVal()) { showErr('Nhập API key trước khi thử.'); return; }
  if (!model) { showErr('Chưa có model nào để thử.'); return; }
  const btn = $('testBtn'); btn.disabled = true; btn.textContent = 'Đang gửi...';
  $('testOut').hidden = false; $('testMeta').innerHTML = ''; $('testText').textContent = '...';
  const t0 = performance.now();
  try {
    const r = await fetch(API + '/v1/chat/completions', {method: 'POST', headers: {'Authorization': 'Bearer ' + keyVal(), 'Content-Type': 'application/json'}, body: JSON.stringify({model, messages: [{role: 'user', content: msg || 'ping'}], max_tokens: 300, stream: false})});
    const ms = Math.round(performance.now() - t0);
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      $('testMeta').innerHTML = '<span class="st bad">Lỗi ' + r.status + '</span><span class="st slow">' + ms + ' ms</span>';
      $('testText').textContent = (j && j.error && (j.error.message || JSON.stringify(j.error))) || (j && j.message) || 'Máy chủ trả lỗi ' + r.status;
    } else {
      const u = (j && j.usage) || {};
      $('testMeta').innerHTML = '<span class="st">Thành công</span><span class="st slow">' + (ms/1000).toLocaleString('vi-VN', {maximumFractionDigits: 1}) + 's</span><span class="pill">vào ' + nf(u.prompt_tokens) + ' · ra ' + nf(u.completion_tokens) + '</span>';
      $('testText').textContent = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || JSON.stringify(j, null, 2);
      setTimeout(refresh, 1500);
    }
  } catch (err) {
    $('testMeta').innerHTML = '<span class="st bad">Không kết nối được</span>';
    $('testText').textContent = String(err.message || err);
  }
  btn.disabled = false; btn.textContent = 'Gửi thử';
}

/* ---------- khuyến mãi, toàn cầu ---------- */
function renderPromo(p){
  const el = $('promo');
  if (!p || !p.enabled || (p.expires_at && Date.parse(p.expires_at) < Date.now())) { el.hidden = true; return; }
  el.innerHTML = (p.icon_left ? '<span>' + esc(p.icon_left) + '</span>' : '') + '<b>' + esc(p.highlight_vi || '') + '</b><span>' + esc(p.mid_vi || '') + '</span>'
    + (p.token_vi ? '<b>' + esc(p.token_vi) + '</b>' : '') + '<span>' + esc(p.tail_vi || '') + '</span>'
    + (p.group_badge ? '<span class="grp">' + esc(p.group_badge) + '</span>' : '') + (p.icon_right ? '<span>' + esc(p.icon_right) + '</span>' : '');
  el.hidden = false;
}
function renderWorld(){
  const f = feed;
  if (!f || !f.stats) { $('wCty').innerHTML = $('wEvents').innerHTML = '<div class="empty">Chưa có dữ liệu</div>'; return; }
  const s = f.stats;
  $('wRpm').textContent = nf(s.req_per_min); $('wRpmSub').textContent = nf(s.req_window) + ' request / ' + s.window_min + ' phút';
  $('wReq').textContent = nf(s.req_today); $('wReqSub').textContent = 'Tổng ' + tk(s.req_total);
  $('wTok').textContent = tk(s.tokens_today); $('wTokSub').textContent = 'Tổng ' + tk(s.tokens_total);
  $('wHot').textContent = s.hot_model || '—'; $('wHotSub').textContent = nf(s.active_countries) + ' quốc gia đang hoạt động';
  const cs = f.top_countries || [], mx = Math.max(1, ...cs.map(c => c.count));
  $('wCtyMeta').textContent = cs.length + ' quốc gia';
  $('wCty').innerHTML = cs.map(c => '<div class="srow"><span class="nm" style="font-family:var(--f-sans)">' + esc(c.flag || '') + ' ' + esc(c.country || c.cc) + '</span><span class="vl">' + nf(c.count) + ' <small>req</small></span><span class="tr"><i style="width:' + (c.count / mx * 100).toFixed(1) + '%;background:var(--primary)"></i></span></div>').join('') || '<div class="empty">Chưa có dữ liệu</div>';
  const ev = (f.events || []).slice(0, 40);
  $('wEvMeta').textContent = f.updated ? 'cập nhật ' + rel(f.updated) : '—';
  $('wEvents').innerHTML = ev.map(e => '<div class="ev"><span class="f">' + esc(e.flag || '🌐') + '</span><span class="m"><i class="fam ' + fam(e.model) + '"></i>' + esc(e.model) + '<small>' + esc(e.country || e.cc) + ' · ' + rel(e.ts) + '</small></span><span class="t">' + tk(e.tokens) + ' tok<small>' + (Number(e.status) === 200 ? (e.use_time || 0) + 's' : 'lỗi ' + esc(e.status)) + '</small></span></div>').join('') || '<div class="empty">Chưa có dữ liệu</div>';
}

/* ---------- lỗi thường gặp ---------- */
const FAQ = [
  ['401', 'Invalid token / Key không hợp lệ', ['Key gõ sai, thiếu ký tự hoặc có khoảng trắng thừa. Chép lại nguyên key bắt đầu bằng <code>sk-</code>.', 'Key đã hết hạn hoặc bị tắt. Kiểm tra mục "Hạn dùng" ở tab Số dư.']],
  ['403', 'Model không được phép với key này', ['Mỗi key thuộc một nhóm, chỉ gọi được các model của nhóm đó. Danh sách đúng nằm ở tab "Cài đặt API Key" sau khi nhập key.', 'Đổi tên model trong cấu hình cho khớp đúng chữ, kể cả hậu tố như <code>[1m]</code>.']],
  ['402', 'Hết Credit (insufficient quota)', ['Số dư về 0 thì mọi request bị từ chối. Liên hệ LegitShop để nạp thêm Credit.']],
  ['429', 'Too many requests', ['Gửi quá nhiều request cùng lúc. Giảm số luồng song song hoặc chờ vài giây rồi thử lại.']],
  ['404', 'Model not found / sai đường dẫn', ['Claude Code dùng Base URL không có <code>/v1</code>; Codex và các client kiểu OpenAI dùng Base URL có <code>/v1</code>.', 'Kiểm tra lại tên model trong tab "Model khả dụng".']],
  ['500', 'Lỗi máy chủ / model đang lỗi', ['Model có thể đang gặp sự cố phía nhà cung cấp. Xem trạng thái ở mục "Model khả dụng", chọn tạm model khác đang "Hoạt động".']],
  ['Claude Code', 'Claude Code vẫn bắt đăng nhập', ['Đảm bảo file <code>~/.claude/settings.json</code> có đủ <code>ANTHROPIC_AUTH_TOKEN</code> và <code>ANTHROPIC_BASE_URL</code>, rồi mở lại terminal.', 'Nếu đã từng đăng nhập tài khoản Claude, chạy <code>/logout</code> trong Claude Code trước.']],
  ['Credit', 'Credit bị trừ khác với bảng giá', ['Credit tính theo token vào, token ra và token cache, nhân hệ số nhóm của key. Request có ngữ cảnh dài (đọc nhiều file) sẽ tốn nhiều token vào hơn bạn nghĩ.']]
];
function renderFaq(){
  $('faqList').innerHTML = '<div class="chead"><h2>Lỗi thường gặp</h2></div>' + FAQ.map(f => '<details><summary><code>' + esc(f[0]) + '</code><span>' + esc(f[1]) + '</span></summary><div class="ans">' + f[2].map(p => '<p>' + p + '</p>').join('') + '</div></details>').join('');
}

/* ---------- dữ liệu mẫu ---------- */
function loadDemo(){
  demo = true; clearInterval(timer);
  const now = Math.floor(Date.now()/1000), ms = ['claude-sonnet-4.6', 'claude-opus-5.5', 'gemini-4-argon', 'gemini-3.8-flash', 'gpt-6.1-sol', 'glm-5.3'], w = [6, 2, 1, 1, 1, .5];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pickM = () => { let r = rnd() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < ms.length; i++) { r -= w[i]; if (r <= 0) return ms[i]; } return ms[0]; };
  logs = [];
  for (let t = now - 20; t > now - 14 * 86400; t -= Math.floor(200 + rnd() * 1600)) {
    const h = new Date(t * 1000).getHours(); if ((h < 8 || h > 23) && rnd() < .8) continue;
    const m = pickM(), p = Math.floor(1000 + rnd() * 30000), c = Math.floor(200 + rnd() * 3000), ut = Math.max(1, Math.round(c / (60 + rnd() * 100)));
    logs.push({created_at: t, model_name: m, prompt_tokens: p, completion_tokens: c, quota: Math.floor((p + c * 4) * (m.includes('opus') ? 2 : .6) * 4), use_time: ut, is_stream: true, type: rnd() < .02 ? 5 : 2, group: 'default'});
  }
  const used = logs.reduce((a, l) => a + l.quota, 0);
  usage = {total_granted: 5000 * QPC, total_used: used, total_available: Math.max(0, 5000 * QPC - used), expires_at: now + 41 * 86400 + 3 * 3600};
  keyModels = statusData && statusData.models ? statusData.models.map(m => m.id) : ms;
  page = 0; renderAll();
  setLive('on', 'Dữ liệu mẫu'); showErr('');
  $('updatedTxt').textContent = 'Đang xem dữ liệu mẫu, không phải key thật';
}

/* ---------- sự kiện ---------- */
function selectTab(name){
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.panel').forEach(p => p.hidden = p.id !== 'p-' + name);
  try { localStorage.setItem('ls-tab', name); } catch(_) {}
}
function setTheme(dark){
  document.documentElement.classList.toggle('dark', dark);
  $('themeTxt').textContent = dark ? 'Sáng' : 'Tối';
  try { localStorage.setItem('ls-theme', dark ? 'dark' : 'light'); } catch(_) {}
}

function init(){
  $('yr').textContent = new Date().getFullYear();
  $('baseUrl').textContent = SETUP; $('oaiUrl').textContent = SETUP + '/v1';
  setTheme(document.documentElement.classList.contains('dark'));
  $('themeBtn').onclick = () => setTheme(!document.documentElement.classList.contains('dark'));
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => selectTab(b.dataset.tab));
  let tab = 'overview'; try { tab = localStorage.getItem('ls-tab') || tab; } catch(_) {}
  selectTab($('p-' + tab) ? tab : 'overview');
  $('keyForm').onsubmit = e => { e.preventDefault(); if (!keyVal()) { showErr('Hãy dán API key vào ô trên.'); return; } startKey(); };
  $('clearBtn').onclick = () => { $('key').value = ''; demo = false; usage = null; logs = []; keyModels = null; clearInterval(timer); try { localStorage.removeItem('ls-key'); } catch(_) {} $('remember').checked = false; setLive('', 'Chưa kết nối'); showErr(''); $('updatedTxt').textContent = ''; renderAll(); $('key').focus(); };
  $('eyeBtn').onclick = () => { const k = $('key'); k.type = k.type === 'password' ? 'text' : 'password'; };
  $('demoBtn').onclick = loadDemo;
  $('pgSize').onchange = e => { pageSize = Number(e.target.value); page = 0; renderLogs(); };
  $('pgFirst').onclick = () => { page = 0; renderLogs(); };
  $('pgPrev').onclick = () => { page--; renderLogs(); };
  $('pgNext').onclick = () => { page++; renderLogs(); };
  $('pgLast').onclick = () => { page = 1e9; renderLogs(); };
  $('stGroups').onclick = e => { const c = e.target.closest('.mcard'); if (c) copy(c.dataset.id, c.dataset.id); };
  document.querySelectorAll('code.copy').forEach(c => c.onclick = () => copy(c.textContent, 'địa chỉ'));
  document.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(raw[b.dataset.copy] || $(b.dataset.copy).textContent, 'cấu hình'));
  $('testForm').onsubmit = runTest;
  renderFaq(); renderAll();

  const loadPublic = () => Promise.all([pub('/key/status.json', 'status.json'), pub('/api/pricing', 'pricing.json'), pub('/key/promo-config.json', 'promo-config.json'), pub('/key/feed.json', 'feed.json')])
    .then(([s, p, pr, f]) => {
      // Lần tải lỗi thì giữ dữ liệu cũ, không xóa trắng bảng.
      statusData = s || statusData; pricing = p || pricing; feed = f || feed;
      if (pr) renderPromo(pr);
      renderStatus(); renderPricing(); renderSetup(); renderWorld();
    });
  loadPublic();
  if (CFG.PUBLIC_REFRESH_SEC) setInterval(() => { if (!document.hidden) loadPublic(); }, CFG.PUBLIC_REFRESH_SEC * 1000);
  // Quay lại tab sau khi để ẩn lâu thì tải lại ngay.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadPublic(); if (!demo && keyVal() && usage) refresh(); } });

  const qk = new URLSearchParams(location.hash.slice(1)).get('key');
  let saved = ''; try { saved = localStorage.getItem('ls-key') || ''; } catch(_) {}
  if (qk) { $('key').value = qk; history.replaceState(null, '', location.pathname); startKey(); }
  else if (saved) { $('key').value = saved; $('remember').checked = true; startKey(); }
}
init();
})();
