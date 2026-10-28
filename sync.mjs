// 웹 대본(film.html) → 휴대폰 대본 앱 자동 반영. 30초마다 film.html이 바뀌었는지 보고, 바뀌면
// 정지 페이지 대본을 뽑고 + 영상 페이지 시각을 실제 속도로 다시 재서(timing-rt.mjs, 약 2분) data.json·index.html을 만들고 GitHub에 올림
// 사용: node sync.mjs (한 번)   node sync.mjs --watch (계속 감시)
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  // 푸시가 가끔 몇 분씩 멈춰서, 60초 넘으면 끊고 다시(최대 3번)
  for (let k = 0; k < 3; k++) try { execFileSync('git', ['push', '-q'], { cwd: HERE, stdio: 'inherit', timeout: 60000 }); break } catch (e) { console.error('푸시 재시도', k + 1) }
  console.log('올림', new Date().toTimeString().slice(0, 8));
}
const mt = () => statSync(`${PROTO}/film.html`).mtimeMs + statSync(`${PROTO}/prompter/prompter.src.html`).mtimeMs;
if (!process.argv.includes('--watch')) build();
else for (let seen = 0; ; await sleep(30000)) { const m = mt(); if (m !== seen) { seen = m; try { build() } catch (e) { console.error('실패', e.message) } } }
