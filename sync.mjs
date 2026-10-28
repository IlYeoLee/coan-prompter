// 웹 대본(film.html) → 휴대폰 대본 앱 자동 반영. 30초마다 film.html이 바뀌었는지 보고, 바뀌면
// 정지 페이지 대본을 뽑고 + 영상 페이지 시각을 실제 속도로 다시 재서(timing-rt.mjs, 약 2분) data.json·index.html을 만들고 GitHub에 올림
// 사용: node sync.mjs (한 번)   node sync.mjs --watch (계속 감시)
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFileSync } from 'node:fs';
const PROTO = '/private/tmp/claude-501/-Users-iil-yeo/20d535de-b5eb-4a64-aad5-93723b5e88bd/scratchpad/proto', HERE = fileURLToPath(new URL('.', import.meta.url));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function deck() {   // film.html의 PAGES(00~04 대본)
  const s = readFileSync(`${PROTO}/film.html`, 'utf8'), i = s.indexOf('const PAGES='); let d = 0, a = s.indexOf('{', i), b;
  for (let k = a; k < s.length; k++) { if (s[k] === '{') d++; if (s[k] === '}' && !--d) { b = k + 1; break } }
  const P = eval('(' + s.slice(a, b) + ')'), o = {};
  for (const k in P) o[k] = P[k].cues.map(c => Array.isArray(c) ? c[0] : c);
  return o;
}
// 영상 페이지 시각: 재생하지 않고 계산(film.html과 같은 말 속도). 문장 길이 = 말 + 0.9초, 화면 동작이 더 긴 문장은 잰 값(A)으로
// 10-28 실측: 대부분 말이 길어 화면이 기다림. 동작이 더 긴 곳만 A에 적음(장마다 문장 순서, 0 = 말이 더 김)
const A = { 1: [0, 0, 0, 0, 0, 0, 6.7], 2: [0, 0, 4.9, 0, 0, 0, 0, 5.6], 3: [0, 6.1, 0, 4.3, 0, 0, 0, 5.7] };
function sp(t) { const R = 5.6; return [...t].reduce((a, c) => a + (/[가-힣0-9]/.test(c) ? 1 / R : /[A-Za-z]/.test(c) ? .8 / R : c === ',' ? .18 : /[.?!]/.test(c) ? .3 : 0), 0) }
function videoTimes() {
  const s = readFileSync(`${PROTO}/film.html`, 'utf8'), out = {};
  const intros = [...s.matchAll(/intro:'([^']*)'/g)].map(m => m[1]), cues = [...s.matchAll(/cue\('([^']*)'/g)].map(m => m[1]);
  const counts = { 1: 6, 2: 7, 3: 7 }; let k = 0;
  for (const ch of ['1', '2', '3']) {
    const lines = [intros[+ch - 1], ...cues.slice(k, k + counts[ch])]; k += counts[ch];
    let t = 0; const c = lines.map((x, i) => { const at = t; t += Math.max(sp(x) + (i ? .9 : .3), A[ch][i] || 0); return [+at.toFixed(2), x] });
    out[ch] = { end: +(t + .6).toFixed(2), cues: c };
  }
  let t = .4; const p4 = deck().p4.map(x => { const at = t; t += sp(x) + .9; return [+at.toFixed(2), x] });
  out.p4 = { end: +(t + 1.2).toFixed(2), cues: p4 };
  return out;
}
let pushing = false;
function build() {
  const data = { stamp: Date.now(), static: deck(), video: videoTimes() };
  const old = (() => { try { return JSON.parse(readFileSync(`${HERE}data.json`, 'utf8')) } catch { return {} } })();
  if (JSON.stringify([old.static, old.video]) === JSON.stringify([data.static, data.video])) data.stamp = old.stamp;   // 대본 그대로면 앱이 다시 받지 않게
  let s = readFileSync(`${PROTO}/prompter/prompter.src.html`, 'utf8');
  data.build = createHash('md5').update(s).digest('hex').slice(0, 10);   // 화면 코드 버전(바뀌면 앱이 새로고침)
  writeFileSync(`${HERE}data.json`, JSON.stringify(data));
  const head = readFileSync(`${HERE}index.html`, 'utf8').match(/<title>[\s\S]*?(?=<link rel="stylesheet")/)[0];
  s = s.replace(/<title>[\s\S]*?(?=<link rel="stylesheet")/, head).replace('/*STATIC*/null', JSON.stringify(data.static)).replace('/*VIDEO*/null', JSON.stringify(data.video)).replace('/*STAMP*/0', data.stamp).replace('/*BUILD*/', data.build);
  writeFileSync(`${HERE}index.html`, s);
  const g = (...a) => execFileSync('git', ['-c', 'user.name=IlYeoLee', '-c', 'user.email=star1004da@gmail.com', ...a], { cwd: HERE, stdio: 'inherit' });
  g('add', '-A');
  if (execFileSync('git', ['status', '--porcelain'], { cwd: HERE }).toString().trim()) g('commit', '-qm', `대본 자동 반영 ${new Date().toTimeString().slice(0, 5)}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`);
  else if (!/ahead/.test(execFileSync('git', ['status', '-sb'], { cwd: HERE }).toString())) return console.log('바뀐 것 없음');
  // 푸시는 뒤에서(편집 페이지가 안 멈추게). 가끔 몇 분씩 멈춰서 60초 넘으면 끊음 → 다음 변경 때 다시 올림
  if (pushing) return; pushing = true;
  const p = spawn('git', ['push', '-q'], { cwd: HERE, stdio: 'ignore' }), kill = setTimeout(() => p.kill(), 60000);
  p.on('close', c => { clearTimeout(kill); pushing = false; console.log(c === 0 ? '올림' : '푸시 실패, 다음에 다시', new Date().toTimeString().slice(0, 8)) });
}
const mt = () => statSync(`${PROTO}/film.html`).mtimeMs + statSync(`${PROTO}/prompter/prompter.src.html`).mtimeMs;
if (!process.argv.includes('--watch')) build();
else {
  // 대본 편집 페이지: http://localhost:8803 — 문장을 고치고 칸을 벗어나면 film.html에 바로 저장(저장 전 백업 film-edit-backup.html)
  createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*');   // film.html(8802) 대본 모아 보기의 수정 버튼에서도 저장
    if (req.method === 'POST') { let b = ''; req.on('data', c => b += c); req.on('end', () => {
      try { const { from, to } = JSON.parse(b), f = `${PROTO}/film.html`, s = readFileSync(f, 'utf8'), clean = to.replace(/'/g, '’').replace(/\n/g, ' ').trim();
        const n = s.split(`'${from}'`).length - 1; if (n !== 1) throw new Error(n ? '같은 문장이 여러 곳에 있어요' : '원래 문장을 못 찾았어요(다른 곳에서 바뀜, 새로고침)');
        copyFileSync(f, `${PROTO}/film-edit-backup.html`); writeFileSync(f, s.replace(`'${from}'`, `'${clean}'`)); res.end(JSON.stringify({ ok: 1, text: clean }));
      } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ err: e.message })) } }); return }
    const d = deck(), v = videoTimes(), names = { p0: '00 AI 워크플로우', p1: '01 문제 정의', p2: '02 경쟁 서비스', p3: '03 코안 소개', p4: '04 비주얼 시스템 (영상)', 1: '05 결정 정리 (영상)', 2: '06 함께 정하기 (영상)', 3: '07 각자 확인 (영상)' };
    const secs = { ...Object.fromEntries(['p0', 'p1', 'p2', 'p3'].map(k => [k, d[k].reduce((a, t) => a + (sp(t) + .9) * 1.1, 0)])), p4: v.p4.end, 1: v[1].end, 2: v[2].end, 3: v[3].end };
    const tot = Object.values(secs).reduce((a, b) => a + b, 0), fmt = x => `${Math.floor(x / 60)}분 ${Math.round(x % 60)}초`, esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const blocks = ['p0', 'p1', 'p2', 'p3', 'p4', '1', '2', '3'].map(k => { const L = ['p0', 'p1', 'p2', 'p3', 'p4'].includes(k) ? d[k] : v[k].cues.map(c => c[1]);
      return `<section><h2>${names[k]} <small>약 ${Math.round(secs[k])}초</small></h2>${L.map(t => `<textarea data-from="${esc(t)}" rows="2">${esc(t)}</textarea>`).join('')}</section>` }).join('');
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8"><title>코안 대본 편집</title><style>body{font:16px/1.6 -apple-system,"Apple SD Gothic Neo",sans-serif;max-width:860px;margin:0 auto;padding:24px 20px 80px;background:#f6f7f9;color:#14171c}h1{font-size:22px}h1 small,h2 small{color:#7d8693;font-weight:500;font-size:14px}h2{font-size:17px;margin:28px 0 8px}textarea{display:block;width:100%;box-sizing:border-box;margin:6px 0;padding:10px 12px;border:1px solid #d7dbe1;border-radius:10px;font:inherit;resize:vertical;background:#fff}textarea.saved{border-color:#2fb36b}textarea.err{border-color:#e5484d}#st{position:fixed;bottom:16px;right:16px;background:#14171c;color:#fff;padding:8px 14px;border-radius:10px;font-size:14px}</style>
<h1>코안 대본 편집 <small>전체 약 ${fmt(tot)} · 칸을 벗어나면 저장, 휴대폰 앱엔 1분 안에 반영 · 영상 페이지 시간은 문장 길이로 계산</small></h1>${blocks}<div id="st">고칠 문장을 누르세요</div>
<script>document.querySelectorAll('textarea').forEach(t=>t.onchange=async()=>{const st=document.getElementById('st');st.textContent='저장 중';const r=await fetch('/',{method:'POST',body:JSON.stringify({from:t.dataset.from,to:t.value})});const j=await r.json();if(j.ok){t.dataset.from=j.text;t.value=j.text;t.className='saved';st.textContent='저장됨. 휴대폰 반영 대기 중'}else{t.className='err';st.textContent=j.err}})</script>`);
  }).listen(8803);
  for (let seen = 0; ; await sleep(5000)) { const m = mt(); if (m !== seen) { seen = m; try { build() } catch (e) { console.error('실패', e.message) } } }
}
