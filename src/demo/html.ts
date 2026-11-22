import type { Artifact, DecisionPoint, Spec, Tag } from '../types';

export interface DemoArtifactInput {
  prompt: string;
  tag: Tag;
  title: string;
  spec: Spec;
  decisions: DecisionPoint[];
  round: number;
  version: number;
  includeMissing: boolean;
  reworkOrder?: string;
}

function esc(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function accentFor(decisions: DecisionPoint[], reworkOrder?: string): string {
  if (reworkOrder && /亮|明快|鲜艳|暖/.test(reworkOrder)) return '#FFB800';
  if (reworkOrder && /暗|深色|低饱和/.test(reworkOrder)) return '#7DD3FC';
  const first = decisions[0]?.chosen;
  const second = decisions[1]?.chosen;
  if (first === 'B') return '#FF5C8A';
  if (second === 'B') return '#7DF9FF';
  return '#FFB800';
}

function pathLabel(decisions: DecisionPoint[]): string {
  const chosen = decisions.filter((d) => d.chosen);
  if (!chosen.length) return '默认稳路径';
  return chosen
    .map((d) => `${d.chosen}·${(d.chosen === 'A' ? d.optionA : d.optionB).label}`)
    .join(' / ');
}

const BASE_CSS = `
:root{--a:ACCENT;--ink:#0f141c;--card:#19212d;--line:#2b3648;--text:#f5f7fb;--muted:#9aa8bc}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:radial-gradient(120% 80% at 50% 0%,rgba(255,184,0,.14),transparent 60%),var(--ink);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
body{padding:18px;display:flex;justify-content:center}
.wrap{width:100%;max-width:430px}
.top{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--muted);letter-spacing:.08em}
.badge{border:1px solid var(--a);color:var(--a);border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700}
h1{font-size:26px;line-height:1.25;margin:12px 0 6px;letter-spacing:-.01em}
.sub{color:var(--muted);font-size:13px;line-height:1.65;margin:0 0 16px}
.card{background:linear-gradient(160deg,rgba(255,255,255,.06),rgba(255,255,255,.015));border:1px solid var(--line);border-radius:18px;padding:16px;margin-bottom:12px}
button{font-family:inherit;font-size:14px;border:0;border-radius:12px;padding:12px 16px;min-height:44px;cursor:pointer;transition:transform .12s ease,opacity .12s ease}
button:active{transform:scale(.97)}
.primary{background:var(--a);color:#161200;font-weight:800;width:100%}
.ghost{background:transparent;color:var(--text);border:1px solid var(--line);font-weight:600}
.row{display:flex;gap:8px;flex-wrap:wrap}
.muted{color:var(--muted);font-size:12px}
input,textarea{width:100%;background:#0d131b;border:1px solid var(--line);border-radius:12px;color:var(--text);padding:12px;font-family:inherit;font-size:14px;outline:none}
input:focus,textarea:focus{border-color:var(--a)}
.footer{margin-top:18px;border-top:1px dashed var(--line);padding-top:12px;font-size:11px;color:var(--muted);line-height:1.7}
.pill{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:3px 9px;font-size:11px;color:var(--muted);margin:0 6px 6px 0}
`;

function shell(opts: {
  title: string;
  accent: string;
  badge: string;
  body: string;
  script: string;
  prompt: string;
  features: string[];
}): string {
  const css = BASE_CSS.replace('ACCENT', opts.accent);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(opts.title)}</title>
<style>${css}</style>
</head>
<body>
<div class="wrap">
  <div class="top"><span class="badge">${esc(opts.badge)}</span><span>施工队出品</span></div>
  ${opts.body}
  <div class="footer">
    <div style="margin-bottom:6px">${opts.features.map((f) => `<span class="pill">${esc(f)}</span>`).join('')}</div>
    <div>来自你的脑洞：${esc(opts.prompt.slice(0, 72))}</div>
  </div>
</div>
<script>${opts.script}</script>
</body>
</html>`;
}

function gameBody(opts: {
  prompt: string;
  spec: Spec;
  decisions: DecisionPoint[];
  full: boolean;
  accent: string;
}): { body: string; script: string } {
  const { spec, full, decisions } = opts;
  const bold = decisions[0]?.chosen === 'B';
  const body = `
  <h1>${esc(spec.goal)}</h1>
  <p class="sub" data-acceptance="A1">${esc(spec.acceptance[0])}</p>
  <div class="card" style="display:flex;gap:12px">
    <div style="flex:1"><div style="font-size:32px;font-weight:900;color:var(--a)" id="score">0</div><div class="muted">得分</div></div>
    <div style="flex:1"><div style="font-size:32px;font-weight:900" id="combo">x1</div><div class="muted">连击</div></div>
    <div style="flex:1"><div style="font-size:32px;font-weight:900" id="time">60</div><div class="muted">剩余秒</div></div>
  </div>
  <div class="card" id="stage" style="position:relative;height:210px;overflow:hidden;display:flex;align-items:center;justify-content:center">
    <button type="button" id="target" aria-label="点击得分" style="position:absolute;left:40%;top:40%;background:var(--a);color:#181200;font-weight:900;border-radius:999px;width:74px;height:74px;padding:0">点我</button>
    <span class="muted" id="hint">点「开始」后，60 秒内尽量多点中</span>
  </div>
  <button type="button" class="primary" id="start" style="margin-top:16px">开始 60 秒</button>
  ${full ? `<div class="row" style="margin-top:14px"><button type="button" class="ghost" id="restart" data-acceptance="A2">重开一局</button><span class="muted" style="align-self:center">空格键也能开始 / 暂停</span></div>
  <div style="height:0;overflow:hidden" data-acceptance="A3">键盘空格支持</div>` : ''}
  <div class="card" style="margin-top:12px;font-size:12px;color:var(--muted);line-height:1.7">
    <div data-acceptance="A4">倒计时归零会自动结算，最高分保存在本机。</div>
    ${bold ? '<div style="margin-top:6px">连击命中：每连续 3 次 +1 倍率，失误会扣 2 秒。</div>' : ''}
  </div>`;

  const script = `
(function(){
  function readBest(){try{return Number(localStorage.getItem('nd_best')||0)||0;}catch(e){return 0;}}
  function writeBest(v){try{localStorage.setItem('nd_best',String(v));}catch(e){}}
  var score=0,combo=1,time=60,running=false,left=0,timer=null,best=readBest();
  var scoreEl=document.getElementById('score'),timeEl=document.getElementById('time'),comboEl=document.getElementById('combo'),target=document.getElementById('target'),start=document.getElementById('start'),hint=document.getElementById('hint');
  var bold=${bold ? 'true' : 'false'};
  function paint(){scoreEl.textContent=score;timeEl.textContent=Math.ceil(time);comboEl.textContent='x'+combo;}
  function move(){var w=target.parentElement.clientWidth-84,h=target.parentElement.clientHeight-84;target.style.left=Math.max(6,Math.random()*w)+'px';target.style.top=Math.max(6,Math.random()*h)+'px';}
  function stop(){running=false;clearInterval(timer);start.textContent='再来 60 秒';hint.textContent='本局得分 '+score+(score>best?' · 新纪录！':' · 最高 '+Math.max(best,score));if(score>best){best=score;writeBest(best);}}
  function tick(){time-=0.1;if(time<=0){time=0;paint();stop();return;}paint();}
  function begin(){if(running){running=false;clearInterval(timer);start.textContent='继续';return;}running=true;start.textContent='暂停';clearInterval(timer);timer=setInterval(tick,100);}
  target.addEventListener('click',function(){
    if(!running)return;
    score+=10*combo;left+=1;
    if(bold&&left%3===0){combo=Math.min(5,combo+1);}
    if(bold&&Math.random()<0.12){time=Math.max(0,time-2);combo=1;}
    paint();move();
  });
  start.addEventListener('click',begin);
  ${full ? "document.getElementById('restart').addEventListener('click',function(){clearInterval(timer);score=0;combo=1;time=60;running=false;start.textContent='开始 60 秒';paint();hint.textContent='点「开始」后，60 秒内尽量多点中';});\n  document.addEventListener('keydown',function(e){if(e.code==='Space'){e.preventDefault();begin();}});" : ''}
  paint();
})();`;

  return { body, script };
}

function toolBody(opts: {
  spec: Spec;
  full: boolean;
  decisions: DecisionPoint[];
}): { body: string; script: string } {
  const { spec, full, decisions } = opts;
  const pro = decisions[0]?.chosen === 'B';
  const body = `
  <h1>${esc(spec.goal)}</h1>
  <p class="sub" data-acceptance="A1">${esc(spec.acceptance[0])}</p>
  <div class="card" style="text-align:center">
    <div id="clock" style="font-size:52px;font-weight:900;letter-spacing:-.03em;font-variant-numeric:tabular-nums">25:00</div>
    <div class="row" style="justify-content:center;margin-top:10px">
      <button type="button" class="primary" id="toggle" style="width:auto;flex:1">开始专注</button>
      ${full ? '<button type="button" class="ghost" id="reset" data-acceptance="A2">重置</button>' : ''}
    </div>
  </div>
  ${pro ? `<div class="card" style="display:flex;gap:10px"><div style="flex:1"><b id="done">0</b><div class="muted">已完成</div></div><div style="flex:1"><b>25</b><div class="muted">分钟/轮</div></div><div style="flex:1"><b id="streak">0</b><div class="muted">连续天数</div></div></div>` : ''}
  <div class="card">
    <div class="muted" style="margin-bottom:8px">本轮要完成的事</div>
    <div class="row" style="margin-bottom:10px"><input id="taskInput" placeholder="写下一件小事，回车添加" /><button type="button" class="ghost" id="add">添加</button></div>
    <div id="list"></div>
    <div id="empty" class="muted">清单还是空的，先写一件 25 分钟内能做完的小事。</div>
    ${full ? '<button type="button" class="ghost" id="clearDone" data-acceptance="A3" style="margin-top:10px">清除已完成</button>' : ''}
    <div style="height:0;overflow:hidden" data-acceptance="A4">localStorage 持久化</div>
  </div>`;

  const script = `
(function(){
  var total=25*60,left=total,running=false,timer=null;
  var clock=document.getElementById('clock'),toggle=document.getElementById('toggle'),input=document.getElementById('taskInput'),list=document.getElementById('list'),empty=document.getElementById('empty'),done=document.getElementById('done');
  var tasks=readTasks();
  function fmt(s){var m=Math.floor(s/60),ss=s%60;return (m<10?'0':'')+m+':'+(ss<10?'0':'')+ss;}
  function paint(){clock.textContent=fmt(left);}
  function readTasks(){try{var raw=localStorage.getItem('nd_tasks');var parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed:[];}catch(e){return [];}}
  function save(){try{localStorage.setItem('nd_tasks',JSON.stringify(tasks));}catch(e){}}
  function render(){
    list.innerHTML='';
    tasks.forEach(function(t,i){
      var row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px dashed #2b3648';
      var box=document.createElement('input');box.type='checkbox';box.checked=!!t.done;box.style.width='18px';box.style.height='18px';box.style.accentColor=getComputedStyle(document.documentElement).getPropertyValue('--a');
      box.addEventListener('change',function(){tasks[i].done=box.checked;save();render();});
      var span=document.createElement('span');span.textContent=t.text;span.style.cssText='flex:1;font-size:14px;'+(t.done?'text-decoration:line-through;opacity:.5':'');
      row.appendChild(box);row.appendChild(span);list.appendChild(row);
    });
    empty.style.display=tasks.length?'none':'block';
    if(done){done.textContent=tasks.filter(function(t){return t.done;}).length;}
  }
  function add(){
    var v=input.value.trim();if(!v)return;
    tasks.push({text:v,done:false});input.value='';save();render();
  }
  document.getElementById('add').addEventListener('click',add);
  input.addEventListener('keydown',function(e){if(e.key==='Enter')add();});
  toggle.addEventListener('click',function(){
    if(running){running=false;clearInterval(timer);toggle.textContent='继续专注';return;}
    running=true;toggle.textContent='暂停';timer=setInterval(function(){left-=1;paint();if(left<=0){clearInterval(timer);running=false;left=total;toggle.textContent='开始专注';clock.textContent='完成一轮';}},1000);
  });
  ${full ? "var r=document.getElementById('reset');r.addEventListener('click',function(){clearInterval(timer);running=false;left=total;paint();toggle.textContent='开始专注';});\n  document.getElementById('clearDone').addEventListener('click',function(){tasks=tasks.filter(function(t){return !t.done;});save();render();});" : ''}
  render();paint();
})();`;
  return { body, script };
}

function pageBody(opts: { spec: Spec; prompt: string; full: boolean }): { body: string; script: string } {
  const { spec, full } = opts;
  const body = `
  <h1 data-acceptance="A1" style="font-size:34px;line-height:1.18;margin-top:18px">${esc(spec.goal)}</h1>
  <p class="sub">${esc(spec.summary)}</p>
  <div class="card" style="padding:20px">
    <div style="font-size:13px;color:var(--muted);margin-bottom:10px">今天的脑洞，今天落地</div>
    <button type="button" class="primary" ${full ? 'data-acceptance="A2" id="cta"' : 'id="cta"'}>看看它能做什么 →</button>
  </div>
  <div id="features" style="display:grid;gap:10px;margin-top:14px">
    <div class="card"><b>01 · 说人话</b><div class="muted" style="margin-top:6px">不用写需求文档，一句原话就开工。</div></div>
    <div class="card"><b>02 · 真试错</b><div class="muted" style="margin-top:6px">开发、审查、返工，每一轮都留痕。</div></div>
    <div class="card"><b>03 · 你拍板</b><div class="muted" style="margin-top:6px">只在关键分叉停下来，其余交给施工队。</div></div>
  </div>
  <div class="card" data-acceptance="A3" style="font-size:12px;color:var(--muted);line-height:1.7">移动端单栏排版，375px 宽度不横向滚动。</div>
  <div class="footer" data-acceptance="A4">
    <a href="#" style="color:var(--a)">回到顶部</a> · <a href="https://example.com" style="color:var(--muted)">了解更多</a>
  </div>`;

  const script = `document.getElementById('cta').addEventListener('click',function(){document.getElementById('features').scrollIntoView({behavior:'smooth'});});`;
  return { body, script };
}

function automationBody(opts: { spec: Spec; full: boolean }): { body: string; script: string } {
  const { spec, full } = opts;
  const body = `
  <h1>${esc(spec.goal)}</h1>
  <p class="sub" data-acceptance="A1">${esc(spec.acceptance[0])}</p>
  <div class="card">
    <textarea id="input" rows="7" placeholder="把原始文案粘进来，比如会议纪要、日报草稿…"></textarea>
    <div class="row" style="margin-top:10px">
      <button type="button" class="primary" id="run" style="flex:2">一键整理</button>
      <button type="button" class="ghost" id="sample" style="flex:1">载入示例</button>
    </div>
  </div>
  <div class="card">
    <div class="muted" style="margin-bottom:8px">整理结果</div>
    <pre id="out" style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.7;margin:0;color:#dbe4f0">等待执行…</pre>
    <div class="row" style="margin-top:10px">
      ${full ? '<button type="button" class="ghost" id="copy" data-acceptance="A2">复制结果</button><button type="button" class="ghost" id="clear" data-acceptance="A3">清空</button>' : ''}
    </div>
  </div>
  <div class="muted" data-acceptance="A4">整理规则：去空行、按句切分、自动编号。所有处理都在本机完成。</div>`;

  const script = `
(function(){
  var input=document.getElementById('input'),out=document.getElementById('out'),run=document.getElementById('run');
  function tidy(text){
    var lines=text.split(/[\\n。；;]/).map(function(s){return s.trim();}).filter(Boolean);
    return lines.map(function(line,i){return (i+1)+'. '+line;}).join('\\n');
  }
  run.addEventListener('click',function(){
    var v=input.value.trim();
    out.textContent=v?tidy(v):'先粘一段文字，再点「一键整理」。';
  });
  document.getElementById('sample').addEventListener('click',function(){
    input.value='今天把脑洞施工队的验收台改完了\\n用户只需要在两个方案里做选择\\n返工单会自动回退到最近决策点';
  });
  ${full ? "document.getElementById('copy').addEventListener('click',function(){var t=out.textContent||'';try{if(navigator.clipboard){navigator.clipboard.writeText(t).catch(function(){});}}catch(e){}out.textContent=t+'\\n\\n（已复制）';});\n  document.getElementById('clear').addEventListener('click',function(){input.value='';out.textContent='等待执行…';input.focus();});" : ''}
})();`;
  return { body, script };
}

function boardBody(opts: { spec: Spec; full: boolean }): { body: string; script: string } {
  const { spec, full } = opts;
  const body = `
  <h1>${esc(spec.goal)}</h1>
  <p class="sub" data-acceptance="A1">${esc(spec.acceptance[0])}</p>
  <div class="card">
    <div class="row"><input id="ideaInput" placeholder="往看板上钉一个新脑洞…" /><button type="button" class="ghost" id="add">钉上</button></div>
  </div>
  <div id="board" style="display:grid;gap:10px"></div>
  <div id="empty" class="card muted" data-acceptance="A4">看板是空的。先钉一个脑洞，施工队才有活干。</div>`;

  const script = `
(function(){
  var ideas=${full ? "readIdeas()" : '[]'};
  var board=document.getElementById('board'),empty=document.getElementById('empty'),input=document.getElementById('ideaInput');
  function readIdeas(){try{var raw=localStorage.getItem('nd_board');var parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed:[];}catch(e){return [];}}
  function save(){${full ? "try{localStorage.setItem('nd_board',JSON.stringify(ideas));}catch(e){}" : ''}}
  function render(){
    board.innerHTML='';
    ideas.forEach(function(text,i){
      var card=document.createElement('div');card.className='card';
      card.style.cssText='display:flex;align-items:center;gap:10px;margin:0';
      var span=document.createElement('span');span.textContent=text;span.style.cssText='flex:1;font-size:14px';
      card.appendChild(span);
      ${full ? "var del=document.createElement('button');del.type='button';del.className='ghost';del.setAttribute('data-acceptance','A2');del.textContent='删除';del.style.padding='6px 10px';del.addEventListener('click',function(){ideas.splice(i,1);save();render();});card.appendChild(del);" : ''}
      board.appendChild(card);
    });
    empty.style.display=ideas.length?'none':'block';
  }
  function add(){var v=input.value.trim();if(!v)return;ideas.push(v);input.value='';save();render();}
  document.getElementById('add').addEventListener('click',add);
  input.addEventListener('keydown',function(e){if(e.key==='Enter')add();});
  ${full ? "var marker=document.createElement('div');marker.style.display='none';marker.setAttribute('data-acceptance','A3');marker.textContent='刷新后卡片仍在';document.body.appendChild(marker);" : ''}
  render();
})();`;
  return { body, script };
}

export function buildDemoHtml(input: DemoArtifactInput): Artifact {
  const { prompt, tag, title, spec, decisions, round, version, includeMissing, reworkOrder } = input;
  const accent = accentFor(decisions, reworkOrder);
  const full = !includeMissing;

  let parts: { body: string; script: string };
  let badge = '施工成品';
  switch (tag) {
    case '小游戏':
      parts = gameBody({ prompt, spec, decisions, full, accent });
      badge = '小游戏 · 60 秒';
      break;
    case '工具':
      parts = toolBody({ spec, full, decisions });
      badge = '效率工具';
      break;
    case '页面':
      parts = pageBody({ spec, prompt, full });
      badge = '单页 · 落地页';
      break;
    case '自动化':
      parts = automationBody({ spec, full });
      badge = '自动化 · 本地执行';
      break;
    default:
      parts = boardBody({ spec, full });
      badge = '脑洞看板';
  }

  const reworkLine = reworkOrder
    ? `<div class="card" style="border-color:var(--a);font-size:12px;line-height:1.7">按你的返工单调整过：${esc(reworkOrder.slice(0, 60))}</div>`
    : '';

  const features = [
    ...spec.acceptance.slice(0, 3),
    tag === '小游戏' ? '60 秒一局，随时重开' : '单文件运行，不依赖外部服务',
    reworkOrder ? '已按返工单换路径' : pathLabel(decisions),
  ];

  const html = shell({
    title: `${title} · ${badge}`,
    accent,
    badge,
    body: `${parts.body}\n${reworkLine}`,
    script: parts.script,
    prompt,
    features,
  });

  return {
    round,
    version,
    title,
    html,
    features,
    pathNote: pathLabel(decisions),
    createdAt: Date.now(),
  };
}
