// 휴대폰 대본용 시각표(실제 속도): 장을 그대로 재생하며 대사(#sctx)가 바뀐 시각을 기록. 0초 = 첫 대사가 뜬 순간
import { spawn } from 'node:child_process';
import { rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
const ch = process.argv[2], port = 9400 + process.pid % 90, TMP = `/tmp/tr-${process.pid}`, sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, '--window-size=1920,1080', '--no-first-run', `--user-data-dir=${TMP}`, 'about:blank'], { stdio: 'ignore' });
try {
  let tgt; for (let k = 0; k < 75 && !tgt; k++) { await sleep(200); try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page') } catch {} }
  const ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {}; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id] } };
  const send = (method, params = {}) => new Promise(r => { const k = ++id; pend[k] = r; ws.send(JSON.stringify({ id: k, method, params })) });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.value;
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://localhost:8802/film.html?ch=${ch}` });
  let t0 = 0; const cues = [];
  for (;;) {
    const [end, x] = await ev(`[$('#again').classList.contains('on')||String((window.LOG||[]).at(-1)||'').includes('] 끝 '),$('#sctx').textContent]`) || [];   // 장=다시 보기, 덱 페이지=LOG 끝
    const t = Date.now();
    if (x && !t0) t0 = t;
    if (x && x !== cues.at(-1)?.[1]) cues.push([+((t - t0) / 1000).toFixed(2), x]);
    if (end || (t0 && t - t0 > 400000)) { const out = existsSync('cues.json') ? JSON.parse(readFileSync('cues.json', 'utf8')) : {}; out[ch] = { end: +((t - t0) / 1000).toFixed(2), cues }; writeFileSync('cues.json', JSON.stringify(out, null, 1)); console.log(ch, out[ch].end + 's', cues.length + '문장'); break }
    await sleep(50);
  }
} finally { chrome.kill(); await sleep(1500); rmSync(TMP, { recursive: true, force: true }) }
