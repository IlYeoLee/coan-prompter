// 웹 대본(film.html) → 휴대폰 대본 앱 자동 반영. 30초마다 film.html이 바뀌었는지 보고, 바뀌면
// 정지 페이지 대본을 뽑고 + 영상 페이지 시각을 실제 속도로 다시 재서(timing-rt.mjs, 약 2분) data.json·index.html을 만들고 GitHub에 올림
// 사용: node sync.mjs (한 번)   node sync.mjs --watch (계속 감시)
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, statSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
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
// 영상 페이지 문장별 화면 설명(카메라: 전체·확대·탭, 무엇을 강조하는지). 편집 페이지와 휴대폰 앱에 같이 씀
const HINT = {
  p4: ['전체: 코안 마크와 이름(반반 화면)', '전체: 열린 C가 닫힌 O로 바뀌는 마크', '펼침: 상태 12가지 마크가 차례로 움직임', '펼침: 컴포넌트, 결정 카드 테두리와 근거 밑줄', '전체: 디자인 시스템 토큰과 플레이그라운드'],
  1: ['장 표지: 결정 정리 제목과 요약', '확대: 회의 전 홈, 안건별로 찾아 붙인 자료 카드', '전체로 빠짐 → 회의 시작 탭 → 회의 화면 열림', '전체: 왼쪽 실시간 대화, 오른쪽 결정 목록이 함께 차오름', '확대: 오른쪽 결정 목록, 제안이 한 줄로 서고 우려·근거 칩이 붙음', '확대: 갈림 지도, A안과 B안 각자의 발언', '전체로 빠짐: 정함·확인할 것·정할 것으로 나뉜 결정 목록'],
  2: ['장 표지: 함께 정하기(진행자 노트북)', '확대: 진행자 노트북의 "회의가 5분 남았어요" 알림', 'TV에 띄우기 탭 → 회의실 사진 전체, TV에 화면이 뜸', '확대: TV 속 두 안 비교 카드, 코안이 결과물 생성', '확대 유지: A안, 팀 Figma 어드민 화면에 적용한 미리보기', '확대 유지: B안, 바뀔 코드와 일정(아래로 스크롤)', '전체로 빠짐 → B안 선택 탭 → 확대: 맡은 사람의 할 일 줄', '전체(천천히 빠짐): 남은 결정 없이 정리된 목록'],
  3: ['장 표지: 각자 확인(담당자 태호 노트북)', '확대: 오른쪽 "확인할 일이 하나 있어요" 카드 → 열기 탭', '확대: 왼쪽 근거, 회의에서 본인이 한 말 인용', '확인 탭 → 확대: 오른쪽 확정 표시', '확대: Figma 브랜치·변경 로그·개발 티켓 초안(천천히 스크롤)', '전체: 회의 기록 화면으로 전환', '근거 보기 탭: 그때 한 말 원문', '전체(천천히 빠짐): 결정과 담당이 남은 기록'],
};
let pushing = false;
function build() {
  const data = { stamp: Date.now(), static: deck(), video: videoTimes(), hint: HINT };
  const old = (() => { try { return JSON.parse(readFileSync(`${HERE}data.json`, 'utf8')) } catch { return {} } })();
  if (JSON.stringify([old.static, old.video]) === JSON.stringify([data.static, data.video])) data.stamp = old.stamp;   // 대본 그대로면 앱이 다시 받지 않게
  let s = readFileSync(`${PROTO}/prompter/prompter.src.html`, 'utf8');
  data.build = createHash('md5').update(s).digest('hex').slice(0, 10);   // 화면 코드 버전(바뀌면 앱이 새로고침)
  writeFileSync(`${HERE}data.json`, JSON.stringify(data));
  const head = readFileSync(`${HERE}index.html`, 'utf8').match(/<title>[\s\S]*?(?=<link rel="stylesheet")/)[0];
  s = s.replace(/<title>[\s\S]*?(?=<link rel="stylesheet")/, head).replace('/*STATIC*/null', JSON.stringify(data.static)).replace('/*VIDEO*/null', JSON.stringify(data.video)).replace('/*STAMP*/0', data.stamp).replace('/*HINT*/null', JSON.stringify(HINT)).replace('/*BUILD*/', data.build);
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
  // 대본 편집 페이지 http://localhost:8803 — 고친 뒤 [저장]을 눌러야 film.html에 반영. 저장 직전 버전을 히스토리에 쌓아 [되돌리기]로 하나씩 복원
  const F = `${PROTO}/film.html`, HIST = `${PROTO}/film-edit-history`; mkdirSync(HIST, { recursive: true });
  function applyEdit(s, from, to) {
    const clean = to.replace(/'/g, '’').replace(/\n/g, ' ').trim();
    if (!clean) {   // 빈칸 = 그 줄 삭제(덱 페이지 00~04만. 영상 장 문장은 화면 동작이 묶여 있어 못 지움)
      const k = s.indexOf(`['${from}'`); if (k < 0 || s.split(`['${from}'`).length !== 2) throw new Error(`덱 페이지(00~04) 문장만 지울 수 있어요: ${from.slice(0, 20)}…`);
      let e = s.indexOf(']', k + from.length + 2) + 1, b = k;
      if (s[e] === ',') e++; else b = s.lastIndexOf(',', k);
      while (b > 0 && /\s/.test(s[b - 1]) && s[b] !== ',') b--;
      return s.slice(0, b) + s.slice(e);
    }
    const n = s.split(`'${from}'`).length - 1; if (n !== 1) throw new Error(n ? `같은 문장이 여러 곳에 있어요: ${from.slice(0, 20)}…` : `원래 문장을 못 찾았어요(새로고침): ${from.slice(0, 20)}…`);
    return s.replace(`'${from}'`, `'${clean}'`);
  }
  createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    const send = (o, code = 200) => { res.statusCode = code; res.end(JSON.stringify(o)) };
    if (req.method === 'POST') { let body = ''; req.on('data', c => body += c); req.on('end', () => {
      try {
        const q = JSON.parse(body || '{}'), cur = readFileSync(F, 'utf8'), hist = readdirSync(HIST).sort();
        if (q.undo) { if (!hist.length) throw new Error('되돌릴 버전이 없어요'); const last = `${HIST}/${hist.at(-1)}`; writeFileSync(F, readFileSync(last)); rmSync(last); return send({ ok: 1, left: hist.length - 1 }) }
        const edits = q.edits || (q.from != null ? [{ from: q.from, to: q.to }] : []); if (!edits.length) throw new Error('바뀐 문장이 없어요');
        let s = cur; for (const e of edits) s = applyEdit(s, e.from, e.to);
        writeFileSync(`${HIST}/${Date.now()}.html`, cur); writeFileSync(F, s);
        send({ ok: 1, n: edits.length, left: hist.length + 1, text: edits.length === 1 ? edits[0].to.replace(/'/g, '’').trim() : undefined, deleted: edits.length === 1 && !edits[0].to.trim() ? 1 : undefined });
      } catch (e) { send({ err: e.message }, 400) } }); return }
    const d = deck(), v = videoTimes(), names = { p0: '00 AI 워크플로우', p1: '01 문제 정의', p2: '02 경쟁 서비스', p3: '03 코안 소개', p4: '04 비주얼 시스템 (영상)', 1: '05 결정 정리 (영상)', 2: '06 함께 정하기 (영상)', 3: '07 각자 확인 (영상)' };
    const secs = { ...Object.fromEntries(['p0', 'p1', 'p2', 'p3'].map(k => [k, d[k].reduce((a, t) => a + (sp(t) + .9) * 1.1, 0)])), p4: v.p4.end, 1: v[1].end, 2: v[2].end, 3: v[3].end };
    const tot = Object.values(secs).reduce((a, b) => a + b, 0), fmt = x => `${Math.floor(x / 60)}분 ${Math.round(x % 60)}초`, esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const deckKeys = ['p0', 'p1', 'p2', 'p3', 'p4'], nh = readdirSync(HIST).length;
    const blocks = ['p0', 'p1', 'p2', 'p3', 'p4', '1', '2', '3'].map(k => { const L = deckKeys.includes(k) ? d[k] : v[k].cues.map(c => c[1]);
      return `<section><h2>${names[k]} <small>약 ${Math.round(secs[k])}초</small></h2>${L.map((t, i) => `${HINT[k]?.[i] ? `<div class="hint">화면 · ${esc(HINT[k][i])}</div>` : ''}<div class="row"><textarea data-from="${esc(t)}" rows="2">${esc(t)}</textarea>${deckKeys.includes(k) ? '<button class="del" type="button">삭제</button>' : ''}</div>`).join('')}</section>` }).join('');
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8"><title>코안 대본 편집</title><style>
body{font:16px/1.6 -apple-system,"Apple SD Gothic Neo",sans-serif;max-width:900px;margin:0 auto;padding:0 20px 80px;background:#f6f7f9;color:#14171c}
header{position:sticky;top:0;z-index:5;background:#f6f7f9;padding:16px 0 12px;border-bottom:1px solid #e3e6ea;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
h1{font-size:20px;margin:0;flex:1;min-width:240px}h1 small,h2 small{color:#7d8693;font-weight:500;font-size:14px}
header button{border:0;border-radius:10px;padding:10px 16px;font:700 15px inherit;cursor:pointer}
#save{background:#3d8bff;color:#fff}#save:disabled{background:#c9d3e0;cursor:default}#undo{background:#fff;border:1px solid #d7dbe1;color:#14171c}#undo:disabled{color:#b0b6bf}
#st{width:100%;font-size:14px;color:#4a525d;min-height:20px}
h2{font-size:17px;margin:28px 0 8px}.row{display:flex;gap:8px;align-items:flex-start;margin:6px 0}
textarea{flex:1;box-sizing:border-box;padding:10px 12px;border:1px solid #d7dbe1;border-radius:10px;font:inherit;resize:vertical;background:#fff}
textarea.changed{border-color:#3d8bff;background:#f3f8ff}.row.gone textarea{text-decoration:line-through;color:#b0b6bf;background:#f1f2f4}
.hint{font-size:13px;color:#3d6fbf;margin:12px 0 -2px 4px}
.del{border:1px solid #d7dbe1;background:#fff;border-radius:10px;padding:8px 12px;font:500 14px inherit;color:#c2373b;cursor:pointer}.row.gone .del{color:#14171c}
</style><header><h1>코안 대본 편집 <small>전체 약 ${fmt(tot)}</small></h1><button id="undo" type="button" ${nh ? '' : 'disabled'}>되돌리기${nh ? ' (' + nh + ')' : ''}</button><button id="save" type="button" disabled>저장</button><div id="st">고친 문장은 파란색, 지울 문장은 줄이 그어져요. [저장]을 눌러야 반영돼요.</div></header>${blocks}
<script>
const st=document.getElementById('st'),save=document.getElementById('save'),undo=document.getElementById('undo');
const pend=()=>[...document.querySelectorAll('.row')].filter(r=>r.classList.contains('gone')||r.querySelector('textarea').value.trim()!==r.querySelector('textarea').dataset.from);
const upd=()=>{const n=pend().length;save.disabled=!n;save.textContent=n?'저장 ('+n+')':'저장'};
document.querySelectorAll('textarea').forEach(t=>t.oninput=()=>{t.classList.toggle('changed',t.value.trim()!==t.dataset.from);upd()});
document.querySelectorAll('.del').forEach(b=>b.onclick=()=>{const r=b.parentElement;r.classList.toggle('gone');b.textContent=r.classList.contains('gone')?'취소':'삭제';upd()});
save.onclick=async()=>{const edits=pend().map(r=>{const t=r.querySelector('textarea');return{from:t.dataset.from,to:r.classList.contains('gone')?'':t.value}});
 st.textContent='저장 중';const j=await(await fetch('/',{method:'POST',body:JSON.stringify({edits})})).json();
 if(j.err){st.textContent='저장 못 했어요: '+j.err;return}st.textContent=j.n+'개 저장했어요. 휴대폰 앱엔 1분 안에 반영돼요';setTimeout(()=>location.reload(),900)};
undo.onclick=async()=>{const j=await(await fetch('/',{method:'POST',body:JSON.stringify({undo:1})})).json();if(j.err){st.textContent=j.err;return}st.textContent='직전 저장을 되돌렸어요';setTimeout(()=>location.reload(),700)};
addEventListener('beforeunload',e=>{if(pend().length){e.preventDefault();e.returnValue=''}});
</script>`);
  }).listen(8803);
  for (let seen = 0; ; await sleep(5000)) { const m = mt(); if (m !== seen) { seen = m; try { build() } catch (e) { console.error('실패', e.message) } } }
}
