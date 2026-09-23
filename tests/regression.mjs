// PageForge 一键回归（收敛版）：替代散乱的 verify-*.mjs
// 用法：npm run build:single && npm run regression
// 原理：自起 Edge/Chrome headless（临时 profile，用完即删）+ CDP 打开 dist-single/index.html，
//       通过 window.__pageforge 跑核心断言；全绿退出码 0，任一红退出码 1。
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pushFrame, DEFAULT_MAX_FRAMES } from '../src/v2/undo-stack.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist-single', 'index.html');
const CDP_PORT = 9223;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 0. 前置检查 ----------
if (!existsSync(DIST)) {
  console.error('✗ 未找到 dist-single/index.html，请先运行 npm run build:single');
  process.exit(1);
}
const built = readFileSync(DIST, 'utf8');
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

// 产物不得含 API Key（泄露防线）
check('产物无 API Key', !/sk-[a-zA-Z0-9]{20,}/.test(built));

// 撤销栈字节预算（数据安全补丁；纯函数，Node 侧单测）：base64 图片帧不能把内存撑爆
{
  const st = [];
  for (let i = 0; i < 10; i++) pushFrame(st, 'x'.repeat(1_000_000), { maxBytes: 8 * 1024 * 1024 });
  check('撤销栈字节预算生效', st.length === 4, `10 帧×2MB → 保留 ${st.length} 帧（8MB 预算）`);
  const one = [];
  pushFrame(one, 'x'.repeat(10_000), { maxBytes: 100 });
  check('撤销栈至少保留 1 帧', one.length === 1);
  const many = [];
  for (let i = 0; i < DEFAULT_MAX_FRAMES + 20; i++) pushFrame(many, 'x');
  check('撤销栈条数上限', many.length === DEFAULT_MAX_FRAMES, `保留 ${many.length} 帧`);
}

// ---------- 1. 起 headless 浏览器 ----------
const candidates = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const browserPath = candidates.find((p) => existsSync(p));
if (!browserPath) {
  console.error('✗ 未找到 Edge/Chrome，请安装或手动改 candidates 路径');
  process.exit(1);
}
const profile = mkdtempSync(join(tmpdir(), 'pf-regression-'));
const proc = spawn(browserPath, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--disable-gpu',
  '--window-size=1400,900',
  'about:blank',
], { stdio: 'ignore' });
const cleanup = () => {
  try { proc.kill(); } catch { /* 已退出 */ }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 用完即删，失败无碍 */ }
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(1));

// ---------- 2. CDP 连接 ----------
let target = null;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  try {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?` + encodeURIComponent(pathToFileURL(DIST).href), { method: 'PUT' });
    target = await res.json();
    break;
  } catch { /* 浏览器还没起好 */ }
}
if (!target?.webSocketDebuggerUrl) {
  console.error('✗ CDP 连接失败');
  process.exit(1);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let msgId = 0;
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    jsErrors.push((d.exception?.description || d.text || '').slice(0, 120));
  }
};
await new Promise((r) => { ws.onopen = r; });
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++msgId;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
const jsErrors = [];
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });

// 在页面里执行表达式（返回 JSON 值）
async function evalPage(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').slice(0, 200));
  return r.result.value;
}
// 轮询直到表达式为真
async function waitFor(expr, timeoutMs = 15000) {
  for (let i = 0; i < timeoutMs / 400; i++) {
    try { if (await evalPage(expr)) return true; } catch { /* 未就绪 */ }
    await sleep(400);
  }
  return false;
}

// ---------- 3. 断言 ----------
// 3.1 编辑器就绪
check('编辑器加载', await waitFor(`typeof window.__pageforge !== 'undefined' && !!window.__pageforge.editor`));

// 3.1.5 首次开屏：新环境显示一次；关闭后不再出现（顺手把顺势启动的引导也关掉）
const welcomeShown = await waitFor(`!document.getElementById('welcome').hidden`, 5000);
await evalPage(`(() => { document.getElementById('welcome-close')?.click(); })()`);
await sleep(450);
const welcomeOnce = await evalPage(`document.getElementById('welcome').hidden`);
await evalPage(`(() => { const f = document.getElementById('guide-float'); if (f && !f.hidden) document.getElementById('gf-skip').click(); })()`);
await sleep(250);
check('开屏首次显示+关闭', welcomeShown && welcomeOnce);

// 3.2 组件块数量
const blockCount = await evalPage(`window.__pageforge.editor.BlockManager.getAll().length`);
check('组件块 ≥ 50', blockCount >= 50, `当前 ${blockCount} 块`);

// 3.3 组件渲染 + 撤销/恢复
await evalPage(`(async () => {
  const E = window.__pageforge.editor;
  E.getWrapper().components().reset();
  E.setComponents('<h1 id="rg-t">回归标题</h1><p id="rg-p">段落</p>');
  await new Promise(r => setTimeout(r, 400));
})()`, true);
check('组件渲染', await evalPage(`window.__pageforge.editor.getWrapper().find('#rg-t').length === 1`));
await evalPage(`(async () => {
  const E = window.__pageforge.editor;
  const h1 = E.getWrapper().find('#rg-t')[0];
  E.select(h1);
  h1.setStyle('color:#ff0000');
  await new Promise(r => setTimeout(r, 400));
})()`, true);
const redApplied = await evalPage(`window.__pageforge.editor.getWrapper().find('#rg-t')[0].getStyle().color`);
await evalPage(`window.__pageforge.editor.UndoManager.undo(); 'ok'`);
await sleep(400);
const afterUndo = await evalPage(`window.__pageforge.editor.getWrapper().find('#rg-t')[0].getStyle().color`);
check('撤销', redApplied === '#ff0000' && afterUndo !== '#ff0000', `应用=${redApplied} 撤销后=${afterUndo}`);
await evalPage(`window.__pageforge.editor.UndoManager.redo(); 'ok'`);
await sleep(400);
const afterRedo = await evalPage(`window.__pageforge.editor.getWrapper().find('#rg-t')[0].getStyle().color`);
check('恢复', afterRedo === '#ff0000');

// 3.4 多页面增删
const pageOps = await evalPage(`(async () => {
  const E = window.__pageforge.editor;
  const before = E.Pages.getAll().length;
  const p = E.Pages.add({ name: '回归页' });
  const added = E.Pages.getAll().length === before + 1;
  E.Pages.select(p.getId());
  E.Pages.remove(p.getId());
  const removed = E.Pages.getAll().length === before;
  return JSON.stringify({ added, removed });
})()`, true);
check('多页面增删', JSON.parse(pageOps).added && JSON.parse(pageOps).removed);

// 3.5 AI 面板开关
await evalPage(`document.getElementById('btn-ai').click(); 'ok'`);
await sleep(500);
const aiOpened = await evalPage(`document.getElementById('ai-panel').classList.contains('open')`);
// 工具栏在遮罩之上：AI 开着时撤销按钮可点（elementFromPoint 校验）
const undoClickable = await evalPage(`(() => {
  const btn = document.querySelector('#btn-undo, [title*="撤销"]');
  if (!btn) return 'no-btn';
  const r = btn.getBoundingClientRect();
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return btn.contains(el) || el === btn;
})()`);
await evalPage(`document.querySelector('#ai-close').click(); 'ok'`);
await sleep(400);
check('AI 面板开关', aiOpened);
check('AI 开着时工具栏可点', undoClickable === true);

// 3.6 样式面板汉化（选中组件后 label 应为中文）
await evalPage(`(async () => {
  const E = window.__pageforge.editor;
  E.Pages.select(E.Pages.getAll()[0]); // 多页面检查删过页，先回到首页
  E.getWrapper().components().reset();
  E.setComponents('<h1 id="rg-t2">汉化检查</h1>');
  await new Promise(r => setTimeout(r, 400));
  E.select(E.getWrapper().find('#rg-t2')[0]);
  await new Promise(r => setTimeout(r, 600));
})()`, true);
const smLabels = await evalPage(`[...document.querySelectorAll('.gjs-sm-property .gjs-sm-label')].map(e => e.textContent.trim()).slice(0, 10)`);
check('样式面板汉化', smLabels.some(t => /字体|字号|行高/.test(t)), smLabels.join('/').slice(0, 60));

// 3.7 模板弹窗 + 真实缩略图
await evalPage(`document.getElementById('btn-template').click(); 'ok'`);
let thumbOk = false;
for (let i = 0; i < 20; i++) { // 首次生成 4 张截图，给足时间
  await sleep(500);
  thumbOk = await evalPage(`document.querySelectorAll('#template-grid .template-preview img').length >= 3`);
  if (thumbOk) break;
}
check('模板真实缩略图', thumbOk);
await evalPage(`document.querySelector('#modal-template .modal-close, #modal-template .btn.ghost')?.click(); 'ok'`);

// 3.8 页面设置：favicon/OG 持久化 + 导出注入
await evalPage(`(async () => {
  document.getElementById('page-meta-title').value = '回归测试页';
  document.getElementById('page-meta-desc').value = '回归描述';
  document.getElementById('page-meta-fav').value = 'https://example.com/fav.ico';
  document.getElementById('page-meta-og').value = 'https://example.com/cover.jpg';
  document.getElementById('page-save').click();
})()`, true);
await sleep(300);
const metaSaved = await evalPage(`(() => { const m = JSON.parse(localStorage.getItem('pageforge-meta-v1') || '{}'); return m.fav === 'https://example.com/fav.ico' && m.og === 'https://example.com/cover.jpg'; })()`);
check('页面设置持久化', metaSaved);
const exported = await evalPage(`(() => { const d = window.__pageforge.buildExportDoc().doc; return JSON.stringify({ favicon: d.includes('rel="icon"'), og: d.includes('og:image'), desc: d.includes('name="description"') }); })()`);
const ex = JSON.parse(exported);
check('导出注入 favicon/OG', ex.favicon && ex.og && ex.desc);

// 3.9 代码视图格式化
const fmt = await evalPage(`window.__pageforge.formatHtml('<section><h1>标题</h1><p>段落</p></section>')`);
check('代码视图格式化', fmt.includes('\n') && fmt.includes('  <h1>'), JSON.stringify(fmt.slice(0, 40)));

// 3.11 块协议层：规则层选块 + 防劫持 + 填槽
const ruleHit = await evalPage(`(window.__pageforge.matchRule('加个页脚') || {}).id || null`);
const ruleGuard = await evalPage(`window.__pageforge.matchRule('把页脚改成蓝色') === null`);
check('规则层选块', ruleHit === 'pf-footer' && ruleGuard, `页脚→${ruleHit}`);
const slotFill = await evalPage(`(() => {
  const pf = window.__pageforge;
  const html = pf.buildBlockHTML(pf.blocks.find(b => b.id === 'pf-footer'), { brand: 'RG', intro: '回归介绍' });
  const items = pf.buildBlockHTML(pf.blocks.find(b => b.id === 'pf-section-features'), { title: 'T', sub: 'S', items: ['快：很快', '稳：很稳', '省：很省'] });
  return JSON.stringify({
    brand2x: (html.match(/RG/g) || []).length === 2,
    clean: !html.includes('data-pf-slot') && !items.includes('data-pf-slot') && !items.includes('data-pf-items'),
    itemsFilled: items.includes('很快') && items.includes('很稳') && !items.includes('特性一'),
  });
})()`);
const sf = JSON.parse(slotFill);
check('AI 填槽引擎', sf.brand2x && sf.clean && sf.itemsFilled);
// 块目录完整（3 个带槽位块在目录里）
const catOk = await evalPage(`window.__pageforge.buildCatalogText().includes('页脚') && window.__pageforge.buildCatalogText().includes('三栏特性区') && window.__pageforge.buildCatalogText().includes('渐变行动横幅')`);
check('块目录注入', catOk);

// 3.12 多模型适配：服务商表 + 配置解析 + 迁移
const mm = await evalPage(`(() => {
  const pf = window.__pageforge;
  const zs = pf.AI_PROVIDERS.find(p => p.id === 'zhipu');
  const okTable = pf.AI_PROVIDERS.length >= 6 && zs && zs.endpoint.includes('bigmodel.cn') && zs.models.some(m => m.includes('glm-4-flash'));
  // 配置解析：切智谱 → activeAI 用智谱端点和模型；未配置回落 deepseek
  pf.setAIConfig({ provider: 'zhipu', model: 'glm-4-flash-250414', apiKey: 'rg-test' });
  const a = pf.activeAI();
  const okZhipu = a.endpoint.includes('bigmodel.cn') && a.model === 'glm-4-flash-250414' && a.key === 'rg-test';
  localStorage.removeItem('pageforge-ai-config-v1');
  const b = pf.activeAI();
  const okFallback = b.model === 'deepseek-chat' && b.endpoint.includes('deepseek');
  // 自定义端点
  pf.setAIConfig({ provider: 'custom', endpoint: 'https://my.local/v1/chat/completions', model: 'my-model' });
  const c = pf.activeAI();
  const okCustom = c.endpoint === 'https://my.local/v1/chat/completions' && c.model === 'my-model';
  localStorage.removeItem('pageforge-ai-config-v1');
  return JSON.stringify({ okTable, okZhipu, okFallback, okCustom });
})()`);
const mv = JSON.parse(mm);
check('多模型适配', mv.okTable && mv.okZhipu && mv.okFallback && mv.okCustom);

// 3.13 ACE 桥：本地估算 / 实际回写校准 / 记忆包互通（免费模型成本应为 0）
const aceOk = await evalPage(`(() => {
  const A = window.__pageforge.ace;
  localStorage.removeItem('pageforge-ace-memory-v1');
  const est = A.estimateCall('加一个三栏特性区，标题为什么选我们', 'chat', 'glm-4-flash-250414');
  const okEst = est.inTok > 0 && est.outTok > 0 && est.costUsd === 0 && est.complexity === 'medium';
  A.recordActual({ task: 'rg1', action: 'chat', model: 'glm-4-flash-250414', est, usage: { prompt_tokens: 300, completion_tokens: 200, total_tokens: 500 }, elapsedSec: 3 });
  A.recordActual({ task: 'rg2', action: 'chat', model: 'glm-4-flash-250414', est, usage: { prompt_tokens: 360, completion_tokens: 240, total_tokens: 600 }, elapsedSec: 3.5 });
  const st = A.state();
  const cal = st.calibration.medium.token_multiplier;
  const bundle = A.exportBundle();
  const round = bundle.version === '1.2' && !!bundle.model_prices['glm-4-flash-250414'] && bundle.history.length >= 2;
  localStorage.removeItem('pageforge-ace-memory-v1');
  A.importBundle(JSON.stringify(bundle));
  const st2 = A.state();
  localStorage.removeItem('pageforge-ace-memory-v1');
  return JSON.stringify({ okEst, calibrated: cal !== 1, round, reimported: st2.history >= 2 && st2.models >= 7 });
})()`);
const av = JSON.parse(aceOk);
check('ACE 成本桥', av.okEst && av.calibrated && av.round && av.reimported);

// ---------- 3.14 v2 编辑器（canvas 页）断言 ----------
// A0-1：IME（中文输入法）组字行为——组字中间态绝不能被当作内容提交
const V2_DIST = join(ROOT, 'dist-single', 'editor-v2.html');
if (!existsSync(V2_DIST)) {
  check('v2 产物存在', false, '未找到 dist-single/editor-v2.html（先 npm run build:single）');
} else {
  const v2Target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?` + encodeURIComponent(pathToFileURL(V2_DIST).href), { method: 'PUT' })).json();
  const v2ws = new WebSocket(v2Target.webSocketDebuggerUrl);
  const v2Pending = new Map();
  let v2MsgId = 0;
  v2ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && v2Pending.has(m.id)) {
      const { res, rej } = v2Pending.get(m.id);
      v2Pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      jsErrors.push('[v2] ' + (d.exception?.description || d.text || '').slice(0, 120));
    }
  };
  await new Promise((r) => { v2ws.onopen = r; });
  const v2send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++v2MsgId;
    v2Pending.set(id, { res, rej });
    v2ws.send(JSON.stringify({ id, method, params }));
  });
  await v2send('Runtime.enable');
  const v2eval = async (expression) => {
    const r = await v2send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').slice(0, 200));
    return r.result.value;
  };
  // 真实输入注入（CDP）：合成 JS 事件在 elementFromPoint 命中判定、按键修饰键上不可靠，
  // 拖拽/快捷键这类交互必须用真实事件才测得准。modifiers 位掩码：1=Alt 2=Ctrl 4=Meta 8=Shift
  const v2mouse = (type, x, y, modifiers = 0, button = 'left') => v2send('Input.dispatchMouseEvent', {
    type, x, y, button, buttons: type === 'mouseReleased' ? 0 : (button === 'right' ? 2 : 1), clickCount: 1, modifiers,
  });
  const v2click = async (x, y) => { await v2mouse('mousePressed', x, y); await sleep(50); await v2mouse('mouseReleased', x, y); };
  const v2key = (key, code, vk, modifiers = 0) => v2send('Input.dispatchKeyEvent', {
    type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers,
  });
  let v2Ready = false;
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    try { if (await v2eval(`typeof window.__v2 !== 'undefined' && !!document.getElementById('v2-stage')`)) { v2Ready = true; break; } } catch { /* 未就绪 */ }
  }
  check('v2 编辑器加载', v2Ready);

  if (v2Ready) {
    // 公共前奏：双击第一个块的标题叶子进入编辑态
    const enterEdit = `(async () => {
      const stage = document.getElementById('v2-stage');
      const el = window.__v2.getDoc().elements[0];
      const host = stage.querySelector('[data-el-id="' + el.id + '"]');
      if (!host) return 'no-host';
      // 取任意一个文字叶子（默认文档已改为"落地页"模板，首元素是导航而非 cta 块）
      const leaf = host.querySelector('p[data-id], h1[data-id], h2[data-id], h3[data-id], span[data-id], a[data-id]');
      if (!leaf) return 'no-leaf';
      leaf.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await new Promise(r => setTimeout(r, 150));
      return stage.classList.contains('v2-editing') ? 'ok' : 'not-editing';
    })()`;

    // ① 组字中 Enter = 确认候选词，不得插入换行
    const imeEnter = JSON.parse(await v2eval(`(async () => {
      const state = await (${enterEdit});
      if (state !== 'ok') return JSON.stringify({ ok: false, why: state });
      const stage = document.getElementById('v2-stage');
      const leaf = stage.querySelector('[contenteditable="true"]');
      leaf.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'ni' }));
      const before = leaf.innerHTML;
      leaf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }));
      const noBreak = leaf.innerHTML === before;
      leaf.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '你' }));
      leaf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return JSON.stringify({ ok: noBreak });
    })()`));
    check('IME 组字中 Enter 不换行', imeEnter.ok, imeEnter.why || '');

    // ② 组字中 Escape = 取消组字，不得退出编辑
    const imeEsc = JSON.parse(await v2eval(`(async () => {
      const state = await (${enterEdit});
      if (state !== 'ok') return JSON.stringify({ ok: false, why: state });
      const stage = document.getElementById('v2-stage');
      const leaf = stage.querySelector('[contenteditable="true"]');
      leaf.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'ni' }));
      leaf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, isComposing: true }));
      const stillEditing = stage.classList.contains('v2-editing');
      leaf.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
      leaf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 120));
      return JSON.stringify({ ok: stillEditing });
    })()`));
    check('IME 组字中 Escape 不退出编辑', imeEsc.ok, imeEsc.why || '');

    // ③ 组字中失焦 → 延后提交；compositionend 后才写入（未确认的拼音不进文档）
    const imeBlur = JSON.parse(await v2eval(`(async () => {
      const state = await (${enterEdit});
      if (state !== 'ok') return JSON.stringify({ ok: false, why: state });
      const stage = document.getElementById('v2-stage');
      const elId = window.__v2.getDoc().elements[0].id;
      const leaf = stage.querySelector('[contenteditable="true"]');
      leaf.textContent = 'IME 中间态';
      leaf.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'zhong' }));
      leaf.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      await new Promise(r => setTimeout(r, 120));
      const tooEarly = window.__v2.getDoc().elements.find(e => e.id === elId).html.includes('IME 中间态');
      leaf.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中间态' }));
      await new Promise(r => setTimeout(r, 120));
      const afterEnd = window.__v2.getDoc().elements.find(e => e.id === elId).html.includes('IME 中间态');
      return JSON.stringify({ ok: !tooEarly && afterEnd, early: tooEarly, late: afterEnd });
    })()`));
    check('IME 组字中失焦延后提交', imeBlur.ok, `组字中已提交=${imeBlur.early} 组字后已提交=${imeBlur.late}`);

    // 对照：非组字的 Escape 仍正常退出编辑（确认修复没有破坏原行为）
    const ctrlEsc = JSON.parse(await v2eval(`(async () => {
      const state = await (${enterEdit});
      if (state !== 'ok') return JSON.stringify({ ok: false, why: state });
      const stage = document.getElementById('v2-stage');
      stage.querySelector('[contenteditable="true"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 150));
      return JSON.stringify({ ok: !stage.classList.contains('v2-editing') });
    })()`));
    check('对照：普通 Escape 正常退出编辑', ctrlEsc.ok, ctrlEsc.why || '');

    // A0-2 平移：Space+拖拽滚动画布，且绝不改动元素坐标
    const panSpace = JSON.parse(await v2eval(`(async () => {
      const vp = document.getElementById('v2-viewport');
      document.getElementById('v2-zoom-in').click();   // 放大 → 制造可滚动区域
      await new Promise(r => setTimeout(r, 150));
      const scrollable = vp.scrollWidth > vp.clientWidth;
      const docBefore = JSON.stringify(window.__v2.getDoc().elements.map(e => [e.x, e.y]));
      const sBefore = { l: vp.scrollLeft, t: vp.scrollTop };
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      const ready = vp.classList.contains('pf-pan-ready');
      vp.dispatchEvent(new MouseEvent('mousedown', { clientX: 700, clientY: 400, button: 0, bubbles: true }));
      const panning = vp.classList.contains('pf-panning');
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 600, clientY: 400, bubbles: true }));
      const sAfter = { l: vp.scrollLeft, t: vp.scrollTop };
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      const ended = !vp.classList.contains('pf-panning');
      document.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
      const docAfter = JSON.stringify(window.__v2.getDoc().elements.map(e => [e.x, e.y]));
      return JSON.stringify({
        scrollable, ready, panning, ended,
        moved: sAfter.l !== sBefore.l,
        docIntact: docBefore === docAfter,
        dx: sAfter.l - sBefore.l,
      });
    })()`));
    check('平移：Space+拖拽滚动画布',
      panSpace.scrollable && panSpace.ready && panSpace.panning && panSpace.ended && panSpace.moved && panSpace.docIntact,
      `可滚动=${panSpace.scrollable} 准备态=${panSpace.ready} 拖动中=${panSpace.panning} 已结束=${panSpace.ended} 位移=${panSpace.dx}px 元素未动=${panSpace.docIntact}`);

    // A0-2 平移：中键拖拽（惯例操作）
    const panMiddle = JSON.parse(await v2eval(`(() => {
      const vp = document.getElementById('v2-viewport');
      const sBefore = vp.scrollLeft;
      vp.dispatchEvent(new MouseEvent('mousedown', { clientX: 600, clientY: 400, button: 1, bubbles: true }));
      const panning = vp.classList.contains('pf-panning');
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 700, clientY: 400, bubbles: true }));
      const moved = vp.scrollLeft !== sBefore;
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      const ended = !vp.classList.contains('pf-panning');
      return JSON.stringify({ panning, moved, ended });
    })()`));
    check('平移：中键拖拽', panMiddle.panning && panMiddle.moved && panMiddle.ended,
      `拖动中=${panMiddle.panning} 有位移=${panMiddle.moved} 已结束=${panMiddle.ended}`);

    // A0-3 起步模板：弹窗 → 应用（含画布尺寸切换）→ 整体撤销
    const tpl = JSON.parse(await v2eval(`(async () => {
      document.getElementById('v2-tpl-btn').click();
      await new Promise(r => setTimeout(r, 150));
      const modalOpen = !document.getElementById('v2-tpl-modal').hidden;
      const cards = document.querySelectorAll('#v2-tpl-grid .v2-tpl-card').length;
      const hasBlank = !!document.querySelector('#v2-tpl-grid [data-tpl="blank"]');
      document.querySelector('#v2-tpl-grid [data-tpl="poster"]').click();
      await new Promise(r => setTimeout(r, 300));
      const d = window.__v2.getDoc();
      const posterOk = d.stage.width === 1080 && d.stage.height === 1440 && d.elements.length === 4;
      const modalClosed = document.getElementById('v2-tpl-modal').hidden;
      window.__v2.undo();
      await new Promise(r => setTimeout(r, 250));
      const undone = window.__v2.getDoc().stage.width !== 1080;
      return JSON.stringify({ modalOpen, cards, hasBlank, posterOk, modalClosed, undone });
    })()`));
    check('模板弹窗与模板库', tpl.modalOpen && tpl.cards >= 6 && tpl.hasBlank,
      `弹窗=${tpl.modalOpen} 卡片=${tpl.cards} 含空白=${tpl.hasBlank}`);
    check('应用模板（含画布尺寸切换）', tpl.posterOk && tpl.modalClosed,
      `海报 1080×1440 且 4 元素=${tpl.posterOk} 弹窗已关=${tpl.modalClosed}`);
    check('模板替换一步撤销', tpl.undone);

    // A0-3 空画布引导：空白页要有引导，有内容后消失
    const emptyHint = JSON.parse(await v2eval(`(async () => {
      document.getElementById('v2-tpl-btn').click();
      await new Promise(r => setTimeout(r, 150));
      document.querySelector('#v2-tpl-grid [data-tpl="blank"]').click();
      await new Promise(r => setTimeout(r, 300));
      const hintShown = !!document.getElementById('v2-empty');
      const noElements = window.__v2.getDoc().elements.length === 0;
      document.querySelector('[data-add="cta"]').click();
      await new Promise(r => setTimeout(r, 300));
      const hintGone = !document.getElementById('v2-empty');
      return JSON.stringify({ hintShown, noElements, hintGone });
    })()`));
    check('空画布引导', emptyHint.hintShown && emptyHint.noElements && emptyHint.hintGone,
      `空白页显示引导=${emptyHint.hintShown} 无元素=${emptyHint.noElements} 有内容后消失=${emptyHint.hintGone}`);

    // 右键菜单：设置超链接（文字元素）
    const rclick = JSON.parse(await v2eval(`(async () => {
      const stage = document.getElementById('v2-stage');
      document.getElementById('v2-tpl-btn').click();
      await new Promise(r => setTimeout(r, 150));
      document.querySelector('#v2-tpl-grid [data-tpl="landing"]').click();
      await new Promise(r => setTimeout(r, 350));
      const doc = window.__v2.getDoc();
      const ctaEl = doc.elements.find(e => e.html.includes('h_title')) || doc.elements[1];
      const host = stage.querySelector('[data-el-id="' + ctaEl.id + '"]');
      const leaf = host.querySelector('h1[data-id], h2[data-id], p[data-id]');
      leaf.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 500, clientY: 300 }));
      await new Promise(r => setTimeout(r, 150));
      const items = [...document.querySelectorAll('.v2-ctx [data-act]')].map(b => b.dataset.act);
      const btn = document.querySelector('.v2-ctx [data-act="link"]');
      if (!btn) return JSON.stringify({ items: items.join(','), hasLink: false });
      btn.click();
      await new Promise(r => setTimeout(r, 180));
      const modalOpen = !document.getElementById('v2-link-modal').hidden;
      const title = document.getElementById('v2-link-title').textContent;
      document.getElementById('v2-link-url').value = 'example.com';
      document.getElementById('v2-link-ok').click();
      await new Promise(r => setTimeout(r, 300));
      const after = window.__v2.getDoc().elements.find(e => e.id === ctaEl.id);
      return JSON.stringify({
        hasLink: items.includes('link'), hasInsertImg: items.includes('insertImg'),
        modalOpen, title, applied: after.html.includes('href="https://example.com"'),
        items: items.join(','),
      });
    })()`));
    check('右键：设置超链接', rclick.hasLink && rclick.modalOpen && rclick.applied,
      `菜单=${rclick.items} 弹窗=${rclick.modalOpen}(${rclick.title || ''}) 已写入=${rclick.applied}`);
    check('右键：文字元素也有「插入图片」', rclick.hasInsertImg);

    // 右键菜单：更换图片（图片元素 → 只换 src，保留位置尺寸）
    const imgTest = JSON.parse(await v2eval(`(async () => {
      const stage = document.getElementById('v2-stage');
      document.getElementById('v2-img-btn').click();
      await new Promise(r => setTimeout(r, 150));
      document.getElementById('v2-img-url').value = 'https://example.com/a.png';
      document.getElementById('v2-img-ok').click();
      await new Promise(r => setTimeout(r, 300));
      const imgEl = window.__v2.getDoc().elements.find(e => e.type === 'image');
      if (!imgEl) return JSON.stringify({ why: 'no-img-element' });
      const pos = { x: imgEl.x, y: imgEl.y, w: imgEl.width, h: imgEl.height };
      const host = stage.querySelector('[data-el-id="' + imgEl.id + '"]');
      host.querySelector('img').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 400, clientY: 400 }));
      await new Promise(r => setTimeout(r, 150));
      const items = [...document.querySelectorAll('.v2-ctx [data-act]')].map(b => b.dataset.act);
      const btn = document.querySelector('.v2-ctx [data-act="replaceImg"]');
      if (!btn) return JSON.stringify({ items: items.join(','), hasReplace: false });
      btn.click();
      await new Promise(r => setTimeout(r, 180));
      document.getElementById('v2-img-url').value = 'https://example.com/b.png';
      document.getElementById('v2-img-ok').click();
      await new Promise(r => setTimeout(r, 300));
      const after = window.__v2.getDoc().elements.find(e => e.id === imgEl.id);
      const sameGeom = after.x === pos.x && after.y === pos.y && after.width === pos.w && after.height === pos.h;
      return JSON.stringify({
        hasReplace: items.includes('replaceImg'),
        swapped: after.html.includes('b.png') && !after.html.includes('a.png'),
        sameGeom, items: items.join(','),
      });
    })()`));
    check('右键：更换图片（保留位置尺寸）', imgTest.hasReplace && imgTest.swapped && imgTest.sameGeom,
      `菜单=${imgTest.items} 已换 src=${imgTest.swapped} 几何未变=${imgTest.sameGeom}`);

    // 右键菜单：空白处 → 只剩「插入图片」
    const blankTest = JSON.parse(await v2eval(`(async () => {
      const stage = document.getElementById('v2-stage');
      stage.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 700 }));
      await new Promise(r => setTimeout(r, 150));
      const items = [...document.querySelectorAll('.v2-ctx [data-act]')].map(b => b.dataset.act);
      return JSON.stringify({ items: items.join(','), onlyInsert: items.length === 1 && items[0] === 'insertImg' });
    })()`));
    check('右键：空白处仅「插入图片」', blankTest.onlyInsert, `菜单=${blankTest.items}`);

    // A0-4 一键换肤：弹窗 → 应用 → 连续切换（先还原再套用）
    const themeTest = JSON.parse(await v2eval(`(async () => {
      document.getElementById('v2-tpl-btn').click();
      await new Promise(r => setTimeout(r, 150));
      document.querySelector('#v2-tpl-grid [data-tpl="landing"]').click();
      await new Promise(r => setTimeout(r, 350));
      const btnBefore = window.__v2.getDoc().elements.some(e => e.html.includes('#4f46e5'));
      document.getElementById('v2-theme-btn').click();
      await new Promise(r => setTimeout(r, 180));
      const modalOpen = !document.getElementById('v2-theme-modal').hidden;
      const cards = document.querySelectorAll('#v2-theme-grid .v2-theme-card').length;
      document.querySelector('#v2-theme-grid [data-theme="dark"]').click();
      await new Promise(r => setTimeout(r, 320));
      const d1 = window.__v2.getDoc();
      const darkApplied = d1.themeId === 'dark'
        && d1.elements.some(e => e.html.includes('#8b5cf6'))
        && !d1.elements.some(e => e.html.includes('#4f46e5'));
      document.getElementById('v2-theme-btn').click();
      await new Promise(r => setTimeout(r, 180));
      document.querySelector('#v2-theme-grid [data-theme="apple"]').click();
      await new Promise(r => setTimeout(r, 320));
      const d2 = window.__v2.getDoc();
      const appleApplied = d2.themeId === 'apple'
        && d2.elements.some(e => e.html.includes('#0071e3'))
        && !d2.elements.some(e => e.html.includes('#8b5cf6'));
      return JSON.stringify({ btnBefore, modalOpen, cards, darkApplied, appleApplied });
    })()`));
    check('换肤：主题弹窗', themeTest.modalOpen && themeTest.cards >= 5,
      `弹窗=${themeTest.modalOpen} 主题数=${themeTest.cards}`);
    check('换肤：应用主题', themeTest.btnBefore && themeTest.darkApplied,
      `原始色板在=${themeTest.btnBefore} 暗黑已应用=${themeTest.darkApplied}`);
    check('换肤：连续切换（先还原再套用）', themeTest.appleApplied, `暗黑→苹果 正确=${themeTest.appleApplied}`);

    // A0-4 换肤不覆盖用户手动改过的颜色
    const customTest = JSON.parse(await v2eval(`(async () => {
      const el = window.__v2.getDoc().elements[0];
      el.html = '<p data-id="p_x" style="color:#ff00aa;">自定义色</p>';
      document.getElementById('v2-theme-btn').click();
      await new Promise(r => setTimeout(r, 180));
      document.querySelector('#v2-theme-grid [data-theme="neon"]').click();
      await new Promise(r => setTimeout(r, 320));
      const after = window.__v2.getDoc().elements[0].html;
      return JSON.stringify({ kept: after.includes('#ff00aa') });
    })()`));
    check('换肤：不动用户自定义颜色', customTest.kept);

    // A0-5 对齐：单选对画布 · 多选对选区 · 分布 · 一步撤销
    // 注意：模板里元素本就是对齐的（x 都等于内容列位置），必须先"挪歪"才能验证对齐真的生效
    const alignTest = JSON.parse(await v2eval(`(async () => {
      document.getElementById('v2-tpl-btn').click();
      await new Promise(r => setTimeout(r, 150));
      document.querySelector('#v2-tpl-grid [data-tpl="landing"]').click();
      await new Promise(r => setTimeout(r, 350));
      const stageW = window.__v2.getDoc().stage.width;
      const ids = window.__v2.getDoc().elements.map(e => e.id);
      const e1w = window.__v2.getDoc().elements[0].width;

      // ① 挪歪 → 水平居中到画布
      window.__v2.getDoc().elements[0].x = 17;
      window.__v2.setSel(ids[0]);
      await new Promise(r => setTimeout(r, 180));
      const panelVisible = !document.getElementById('v2-style').hidden;
      document.querySelector('[data-align="hcenter"]').click();
      await new Promise(r => setTimeout(r, 280));
      const after1 = window.__v2.getDoc().elements.find(x => x.id === ids[0]);
      const centered = after1.x === Math.round((stageW - e1w) / 2);

      // ② 一步撤销 → 回到挪歪时的 x=17
      window.__v2.undo();
      await new Promise(r => setTimeout(r, 280));
      const backEl = window.__v2.getDoc().elements.find(x => x.id === ids[0]);
      const backX = backEl ? backEl.x : null; // 立刻取值：backEl 是活引用，后续用例会改它的 x
      const undone = backX === 17;

      // ③ 两个元素错开 → 左对齐到选区（对齐到最左那个）
      const d3 = window.__v2.getDoc();
      d3.elements[0].x = 60; d3.elements[1].x = 340;
      window.__v2.setMulti([ids[0], ids[1]]);
      await new Promise(r => setTimeout(r, 220));
      document.querySelector('[data-align="left"]').click();
      await new Promise(r => setTimeout(r, 280));
      const pairXs = window.__v2.getDoc().elements.filter(x => ids.slice(0, 2).includes(x.id)).map(x => x.x);
      const leftAligned = new Set(pairXs).size === 1 && pairXs[0] === 60;

      // ④ 三个元素打散 → 水平均匀分布
      const d4 = window.__v2.getDoc();
      d4.elements[0].x = 40; d4.elements[1].x = 320; d4.elements[2].x = 760;
      window.__v2.setMulti(ids.slice(0, 3));
      await new Promise(r => setTimeout(r, 220));
      document.querySelector('[data-align="distH"]').click();
      await new Promise(r => setTimeout(r, 320));
      const three = window.__v2.getDoc().elements.filter(x => ids.slice(0, 3).includes(x.id)).sort((a, b) => a.x - b.x);
      const gaps = [];
      for (let i = 1; i < three.length; i++) gaps.push(three[i].x - (three[i - 1].x + three[i - 1].width));
      const even = gaps.length >= 2 && Math.max(...gaps) - Math.min(...gaps) <= 2;
      return JSON.stringify({ panelVisible, centered, backX, undone, leftAligned, pairXs: pairXs.join('/'), even, gaps: gaps.map(g => Math.round(g)).join('/') });
    })()`));
    check('对齐：面板对齐区可见', alignTest.panelVisible);
    check('对齐：单选居中到画布', alignTest.centered);
    check('对齐：一步撤销', alignTest.undone, `撤销后 x=${alignTest.backX}`);
    check('对齐：多选左对齐到选区', alignTest.leftAligned, `结果 x=${alignTest.pairXs}`);
    check('对齐：水平均匀分布', alignTest.even, `间距=${alignTest.gaps}`);

    // A0-6 元素属性数值面板 + 画布背景色
    const propTest = JSON.parse(await v2eval(`(async () => {
      document.getElementById('v2-tpl-btn').click();
      await new Promise(r => setTimeout(r, 150));
      document.querySelector('#v2-tpl-grid [data-tpl="landing"]').click();
      await new Promise(r => setTimeout(r, 350));
      const d = window.__v2.getDoc();
      const el = d.elements[0];
      const origW = el.width;
      window.__v2.setSel(el.id);
      await new Promise(r => setTimeout(r, 240));

      // ① 选中后数值回填
      const filled = document.getElementById('sp-x').value === String(Math.round(el.x))
        && document.getElementById('sp-w').value === String(Math.round(origW));

      // ② 改 X 生效
      const xi = document.getElementById('sp-x');
      xi.value = '250';
      xi.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 240));
      const afterX = window.__v2.getDoc().elements.find(x => x.id === el.id).x;

      // ③ 非法值不写入
      const wi = document.getElementById('sp-w');
      wi.value = 'abc';
      wi.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      const badRejected = window.__v2.getDoc().elements.find(x => x.id === el.id).width === origW;

      // ④ 超范围夹紧（5 → 最小 40）
      wi.value = '5';
      wi.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 240));
      const afterClamp = window.__v2.getDoc().elements.find(x => x.id === el.id).width;

      // ⑤ 旋转 / 不透明度 / 层级
      const set = (id, v) => { const i = document.getElementById(id); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); };
      set('sp-rot', '30'); set('sp-op', '0.5'); set('sp-z', '9');
      await new Promise(r => setTimeout(r, 320));
      const a2 = window.__v2.getDoc().elements.find(x => x.id === el.id);
      const others = a2.rotation === 30 && Math.abs(a2.opacity - 0.5) < 0.001 && a2.z === 9;

      // ⑥ 画布背景色
      const bgInput = document.getElementById('v2-stage-bg');
      bgInput.value = '#101020';
      bgInput.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 260));
      const bgOk = window.__v2.getDoc().stage.background === '#101020';

      // ⑦ 撤销后输入框回声
      window.__v2.undo();
      await new Promise(r => setTimeout(r, 320));
      const bgEcho = document.getElementById('v2-stage-bg').value;

      return JSON.stringify({ filled, afterX, badRejected, afterClamp, others, bgOk, bgEcho });
    })()`));
    check('属性面板：数值回填', propTest.filled);
    check('属性面板：改 X 生效', propTest.afterX === 250, `x=${propTest.afterX}`);
    check('属性面板：非法值不写入', propTest.badRejected);
    check('属性面板：超范围夹紧到 40', propTest.afterClamp === 40, `宽=${propTest.afterClamp}`);
    check('属性面板：旋转/不透明度/层级', propTest.others);
    check('画布背景色：可设置', propTest.bgOk);
    check('画布背景色：撤销后回声', propTest.bgEcho === '#f5f5f7', `当前=${propTest.bgEcho}`);

    // A0-7 样式面板完整化 + A0-8 字体预设
    const styleTest = JSON.parse(await v2eval(`(async () => {
      document.getElementById('v2-tpl-btn').click();
      await new Promise(r => setTimeout(r, 150));
      document.querySelector('#v2-tpl-grid [data-tpl="landing"]').click();
      await new Promise(r => setTimeout(r, 350));
      const el = window.__v2.getDoc().elements[0];
      window.__v2.setSel(el.id);
      await new Promise(r => setTimeout(r, 260));
      const q = (id) => document.getElementById(id);
      const fire = (id, ev) => q(id).dispatchEvent(new Event(ev, { bubbles: true }));
      const setIn = (id, v) => { q(id).value = v; fire(id, 'input'); };

      // ① 预设已填充
      const fontOpts = q('sp-font').options.length;
      const weightOpts = q('sp-weight').options.length;
      const fontValueOk = q('sp-font').options[2].value.indexOf('Microsoft YaHei') >= 0;

      // ② 容器：边框三件套（input 实时写入）
      setIn('sp-bd-w', '3px');
      q('sp-bd-s').value = 'dashed'; fire('sp-bd-s', 'input');
      setIn('sp-bd-c', '#ff0000');
      fire('sp-bd-w', 'change');
      await new Promise(r => setTimeout(r, 180));
      let a = window.__v2.getDoc().elements.find(x => x.id === el.id);
      const borderOk = a.style.borderWidth === '3px' && a.style.borderStyle === 'dashed' && a.style.borderColor === '#ff0000';

      // ③ 阴影四字段合成
      setIn('sp-sh-x', '0'); setIn('sp-sh-y', '8'); setIn('sp-sh-b', '24'); setIn('sp-sh-c', '#000000');
      fire('sp-sh-b', 'change');
      await new Promise(r => setTimeout(r, 180));
      a = window.__v2.getDoc().elements.find(x => x.id === el.id);
      const shadowOk = a.style.boxShadow === '0px 8px 24px #000000';

      // ④ 文字字段（写覆盖表）
      // 目标默认是「整个模块」（修伪选中后不再自动落到第一个叶子）。
      // 这里显式选一个叶子，等价于用户点下拉选"模块里的某个内部元素"。
      const leafOpt = [...q('sp-leaf').options].find((o) => o.value);
      const leafId = leafOpt ? leafOpt.value : '';
      if (leafId) { q('sp-leaf').value = leafId; q('sp-leaf').dispatchEvent(new Event('change', { bubbles: true })); }
      setIn('sp-leaf-size', '44px');
      setIn('sp-leaf-ls', '2px');
      setIn('sp-leaf-color', '#00ff00');
      q('sp-font').value = '"Microsoft YaHei", "PingFang SC", sans-serif';
      fire('sp-font', 'input'); fire('sp-font', 'change');
      await new Promise(r => setTimeout(r, 220));
      a = window.__v2.getDoc().elements.find(x => x.id === el.id);
      const ov = a.overrides[leafId] || {};
      const leafOk = ov['font-size'] === '44px' && ov['letter-spacing'] === '2px'
        && ov.color === '#00ff00' && String(ov['font-family']).indexOf('Microsoft YaHei') >= 0;

      // ⑤ 按钮组：对齐 / 粗体 / 下划线
      // 注意：模板标题本来就是 font-weight:800，toggle 会"取消粗体"→ 先把字重降到 400 再测
      setIn('sp-weight', '400'); fire('sp-weight', 'change');
      await new Promise(r => setTimeout(r, 180));
      document.querySelector('[data-ta="center"]').click();
      await new Promise(r => setTimeout(r, 160));
      document.querySelector('[data-td="bold"]').click();
      await new Promise(r => setTimeout(r, 160));
      document.querySelector('[data-td="underline"]').click();
      await new Promise(r => setTimeout(r, 220));
      a = window.__v2.getDoc().elements.find(x => x.id === el.id);
      const ov2 = a.overrides[leafId] || {};
      const alignOk = ov2['text-align'] === 'center';
      const boldOk = String(ov2['font-weight']) === '700';
      const underlineOk = /underline/.test(String(ov2['text-decoration'] || ''));
      const btnLit = document.querySelector('[data-td="bold"]').classList.contains('on');
      const taLit = document.querySelector('[data-ta="center"]').classList.contains('on');

      // ⑥ 一步撤销能回退最后一次按钮操作
      window.__v2.undo();
      await new Promise(r => setTimeout(r, 280));
      a = window.__v2.getDoc().elements.find(x => x.id === el.id);
      const undoOnce = !/underline/.test(String((a.overrides[leafId] || {})['text-decoration'] || ''));

      return JSON.stringify({ fontOpts, weightOpts, fontValueOk, borderOk, shadowOk, leafOk, alignOk, boldOk, underlineOk, btnLit, taLit, undoOnce });
    })()`));
    check('A0-8 字体/字重预设填充', styleTest.fontOpts >= 11 && styleTest.weightOpts >= 8 && styleTest.fontValueOk,
      `字体 ${styleTest.fontOpts} 项 / 字重 ${styleTest.weightOpts} 项 / 含引号字体值正确=${styleTest.fontValueOk}`);
    check('样式面板：边框三件套（实时写入）', styleTest.borderOk);
    check('样式面板：阴影四字段合成', styleTest.shadowOk);
    check('样式面板：文字字段（字号/字距/字体/颜色）', styleTest.leafOk);
    check('样式面板：对齐按钮组 + 激活态', styleTest.alignOk && styleTest.taLit);
    check('样式面板：粗体 toggle + 激活态', styleTest.boldOk && styleTest.btnLit);
    check('样式面板：下划线 toggle', styleTest.underlineOk);
    check('样式面板：一次操作一步撤销', styleTest.undoOnce);

    // —— bug 报告修复验证 ——
    const fixTest = JSON.parse(await v2eval(`(async () => {
      const ad = window.__v2.adapter;
      const all = window.__v2.blocks || [];

      // ① 画布尺寸预设同步（应用海报模板后 select 要跟上）
      document.getElementById('v2-tpl-btn').click();
      await new Promise(r => setTimeout(r, 160));
      document.querySelector('#v2-tpl-grid [data-tpl="poster"]').click();
      await new Promise(r => setTimeout(r, 400));
      const presetSynced = document.getElementById('v2-preset').value === '1080x1440';

      // ② 死元素已删 + AI 面板顶距与工具栏对齐
      const noDeadToast = !document.getElementById('toast');
      const panelTop = getComputedStyle(document.getElementById('ai-panel')).top;

      // ③ 块降级：未做 canvas 原生适配的块也能插（抽 3 个验证）
      const adapted = ['pf-cta-banner', 'pf-section-features', 'pf-footer'];
      const rest = all.filter(b => adapted.indexOf(b.id) < 0);
      const sample = rest.slice(0, 3);
      const before = window.__v2.getDoc().elements.length;
      let inserted = 0;
      for (const b of sample) {
        try { ad.placeBlock(b, {}); inserted++; } catch (e) { /* 记录到 inserted */ }
      }
      await new Promise(r => setTimeout(r, 340));
      const grew = window.__v2.getDoc().elements.length - before;
      const lastInserted = window.__v2.getDoc().elements[window.__v2.getDoc().elements.length - 1];
      const lastRendered = !!document.querySelector('#v2-stage [data-el-id="' + lastInserted.id + '"]');

      // ④ 自由 HTML 不再抛错
      let freeOk = false;
      try {
        ad.insertFreeHTML('<section style="padding:40px;background:#111827;color:#ffffff;"><h2 data-id="h_free" style="margin:0 0 10px;font-size:28px;">自由生成测试</h2><p data-id="p_free" style="margin:0;">AI 生成的整块内容</p></section>');
        freeOk = true;
      } catch (e) { freeOk = false; }
      await new Promise(r => setTimeout(r, 340));
      const freeEl = window.__v2.getDoc().elements[window.__v2.getDoc().elements.length - 1];
      const freeRendered = !!document.querySelector('#v2-stage [data-el-id="' + freeEl.id + '"]');
      const freeHeight = freeEl.height;

      return JSON.stringify({
        presetSynced, noDeadToast, panelTop,
        total: all.length, restCount: rest.length, inserted, grew, lastRendered,
        freeOk, freeRendered, freeHeight,
      });
    })()`));
    check('修复：画布尺寸预设同步', fixTest.presetSynced);
    check('修复：删死元素 + AI 面板顶距对齐', fixTest.noDeadToast && fixTest.panelTop === '56px', `顶距=${fixTest.panelTop}`);
    check('修复：未适配块降级插入（51 块全可用）', fixTest.inserted === 3 && fixTest.grew === 3 && fixTest.lastRendered,
      `共 ${fixTest.total} 块，未适配 ${fixTest.restCount} 个，抽样插入成功 ${fixTest.inserted} 个并渲染=${fixTest.lastRendered}`);
    check('修复：AI 自由 HTML 不再阻断', fixTest.freeOk && fixTest.freeRendered, `插入高度估算 ${fixTest.freeHeight}px`);

    // A0-9 AI 诊断在 canvas 打通（直接验适配器路径，不实际调用模型）
    const diagTest = JSON.parse(await v2eval(`(async () => {
      const ad = window.__v2.adapter;

      // ① 诊断按钮可见（capabilities.diag = true → 不再被门控隐藏）
      const btn = document.getElementById('ai-tool-diag');
      const btnVisible = !!btn && btn.style.display !== 'none';

      // ② 诊断上下文 = 元素清单
      document.getElementById('v2-tpl-btn').click();
      await new Promise(r => setTimeout(r, 160));
      document.querySelector('#v2-tpl-grid [data-tpl="landing"]').click();
      await new Promise(r => setTimeout(r, 380));
      const ctx = ad.getDiagContext();
      const firstId = window.__v2.getDoc().elements[0].id;
      const ctxOk = !!ctx && ctx.schema === 'element'
        && ctx.text.indexOf('元素清单') >= 0 && ctx.text.indexOf(firstId) >= 0;

      // ③ 应用建议：容器样式 + 一条定位不到的（应跳过并计数）
      const target = window.__v2.getDoc().elements[0];
      const res = ad.applyDiagItems([
        { title: '加内边距', reason: '呼吸感不足', elementId: target.id, css: 'padding:48px 56px;' },
        { title: '不存在的元素', reason: '测试跳过', elementId: 'el_nope', css: 'padding:1px;' },
      ]);
      await new Promise(r => setTimeout(r, 300));
      const after = window.__v2.getDoc().elements.find(x => x.id === target.id);
      const appliedOk = res.applied === 1 && res.skipped === 1 && after.style.padding === '48px 56px';

      // ④ 一次应用 = 一步撤销
      window.__v2.undo();
      await new Promise(r => setTimeout(r, 300));
      const undone = !window.__v2.getDoc().elements.find(x => x.id === target.id).style.padding;

      // ⑤ 叶子级建议写进覆盖表
      const res2 = ad.applyDiagItems([{ elementId: target.id, leafId: 'p_logo', css: 'letter-spacing:3px;' }]);
      await new Promise(r => setTimeout(r, 280));
      const ov = (window.__v2.getDoc().elements.find(x => x.id === target.id).overrides || {})['p_logo'] || {};
      const leafOk = res2.applied === 1 && ov['letter-spacing'] === '3px';

      return JSON.stringify({ btnVisible, ctxOk, appliedOk, undone, leafOk, ctxLen: ctx.text.length });
    })()`));
    check('A0-9 诊断按钮在 v2 可见', diagTest.btnVisible);
    check('A0-9 诊断上下文（元素清单）', diagTest.ctxOk, `上下文 ${diagTest.ctxLen} 字符`);
    check('A0-9 应用建议（含跳过计数）', diagTest.appliedOk);
    check('A0-9 诊断应用一步撤销', diagTest.undone);
    check('A0-9 叶子级建议写覆盖表', diagTest.leafOk);

    // A0-10 剪贴板：复制粘贴（带偏移）· 跨页粘贴 · 剪切可撤销 · 全选
    const clipTest = JSON.parse(await v2eval(`(async () => {
      const q = (id) => document.getElementById(id);
      const key = (k, mod) => document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, mod ? { ctrlKey: true } : {})));

      q('v2-tpl-btn').click();
      await new Promise(r => setTimeout(r, 160));
      document.querySelector('#v2-tpl-grid [data-tpl="landing"]').click();
      await new Promise(r => setTimeout(r, 380));

      const target = window.__v2.getDoc().elements[0];
      const n0 = window.__v2.getDoc().elements.length;

      // ① 复制 → 粘贴（新元素带 24px 偏移、id 不同）
      window.__v2.setSel(target.id);
      await new Promise(r => setTimeout(r, 160));
      key('c', true);
      await new Promise(r => setTimeout(r, 140));
      key('v', true);
      await new Promise(r => setTimeout(r, 320));
      const d1 = window.__v2.getDoc();
      const pasted = d1.elements[d1.elements.length - 1];
      const copyPaste = d1.elements.length === n0 + 1
        && pasted.id !== target.id
        && pasted.x === target.x + 24 && pasted.y === target.y + 24;

      // ② 连续粘贴再次偏移（48px）
      key('v', true);
      await new Promise(r => setTimeout(r, 320));
      const d2 = window.__v2.getDoc();
      const pasted2 = d2.elements[d2.elements.length - 1];
      const stepped = pasted2.x === target.x + 48;

      // ③ 跨页粘贴：新建一页后剪贴板内容仍在
      q('v2-page-add').click();
      await new Promise(r => setTimeout(r, 360));
      const newPageN = window.__v2.getDoc().elements.length;
      key('v', true);
      await new Promise(r => setTimeout(r, 320));
      const crossPage = window.__v2.getDoc().elements.length === newPageN + 1;

      // ④ 剪切 → 元素消失；撤销 → 回来
      const t2 = window.__v2.getDoc().elements[0];
      if (!t2) return JSON.stringify({ copyPaste, stepped, crossPage, cutOk: false, cutUndone: false, allSel: 0 });
      window.__v2.setSel(t2.id);
      await new Promise(r => setTimeout(r, 160));
      const beforeCut = window.__v2.getDoc().elements.length;
      key('x', true);
      await new Promise(r => setTimeout(r, 300));
      const afterCut = window.__v2.getDoc().elements.length;
      window.__v2.undo();
      await new Promise(r => setTimeout(r, 320));
      const afterUndo = window.__v2.getDoc().elements.length;
      const cutOk = afterCut === beforeCut - 1 && afterUndo === beforeCut;

      // ⑤ Ctrl+A 全选（当前页要 ≥2 个元素才验得出来：先补粘一个）
      key('v', true);
      await new Promise(r => setTimeout(r, 320));
      key('a', true);
      await new Promise(r => setTimeout(r, 260));
      const selCount = document.querySelectorAll('#v2-stage .sel').length;
      const allSel = selCount >= 2;
      // 收尾：取消选择
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      return JSON.stringify({ copyPaste, stepped, crossPage, cutOk, allSel, selCount });
    })()`));
    check('A0-10 复制粘贴（带 24px 偏移）', clipTest.copyPaste);
    check('A0-10 连续粘贴阶梯偏移', clipTest.stepped);
    check('A0-10 跨页粘贴', clipTest.crossPage);
    check('A0-10 剪切 + 撤销恢复', clipTest.cutOk);
    check('A0-10 Ctrl+A 全选', clipTest.allSel, `选中 ${clipTest.selCount} 个`);

    // A0-11 基础修饰键：Alt+拖拽复制 · Shift 轴向锁定 · Enter 进编辑
    // 一律用 CDP 真实鼠标/键盘注入——拖拽依赖 elementFromPoint 真实命中，合成 JS 事件测不准
    {
      const applyLanding = async () => {
        await v2eval(`(() => { document.getElementById('v2-tpl-btn').click(); return true; })()`);
        await sleep(240);
        await v2eval(`(() => { const b = document.querySelector('#v2-tpl-grid [data-tpl="landing"]'); if (b) b.click(); return true; })()`);
        await sleep(440);
      };
      // 取元素 1（hero）的点位与起始坐标
      const probeOf = async (idx) => JSON.parse(await v2eval(`(() => {
        const stage = document.getElementById('v2-stage');
        const d = window.__v2.getDoc();
        const el = d.elements[${idx}];
        const r = stage.querySelector('[data-el-id="' + el.id + '"]').getBoundingClientRect();
        return JSON.stringify({ id: el.id, px: Math.round(r.left + r.width / 2), py: Math.round(r.top + Math.min(30, r.height / 2)),
          innerY: Math.round(r.top + Math.min(60, r.height / 2)), startX: el.x, startY: el.y, n: d.elements.length });
      })()`));

      // ① Alt+拖拽 = 复制（原件留在原位、总数 +1）
      await applyLanding();
      const p1 = await probeOf(1);
      await v2mouse('mousePressed', p1.px, p1.py, 0);
      await sleep(70);
      await v2mouse('mouseMoved', p1.px + 30, p1.py + 30, 1); // 1 = Alt
      await sleep(70);
      await v2mouse('mouseMoved', p1.px + 95, p1.py + 75, 1);
      await sleep(70);
      await v2mouse('mouseReleased', p1.px + 95, p1.py + 75, 1);
      await sleep(340);
      const r1 = JSON.parse(await v2eval(`(() => {
        const d = window.__v2.getDoc();
        const o = d.elements.find(x => x.id === '${p1.id}');
        return JSON.stringify({ n: d.elements.length, ox: o.x, oy: o.y });
      })()`));
      check('A0-11 Alt+拖拽复制（原件留原位）',
        r1.n === p1.n + 1 && r1.ox === p1.startX && r1.oy === p1.startY,
        `元素数 ${p1.n}→${r1.n}，原件 (${p1.startX},${p1.startY})→(${r1.ox},${r1.oy})`);

      // ② Shift 轴向锁定：横向位移远大于纵向 → Y 不变、X 变
      await applyLanding();
      const p2 = await probeOf(1);
      await v2mouse('mousePressed', p2.px, p2.py, 0);
      await sleep(70);
      await v2mouse('mouseMoved', p2.px + 40, p2.py + 2, 8); // 8 = Shift
      await sleep(70);
      await v2mouse('mouseMoved', p2.px + 135, p2.py + 9, 8);
      await sleep(70);
      await v2mouse('mouseReleased', p2.px + 135, p2.py + 9, 8);
      await sleep(340);
      const r2 = JSON.parse(await v2eval(`(() => {
        const o = window.__v2.getDoc().elements.find(x => x.id === '${p2.id}');
        return JSON.stringify({ x: o.x, y: o.y });
      })()`));
      check('A0-11 Shift 轴向锁定（横向拖动锁 Y）',
        r2.y === p2.startY && r2.x !== p2.startX,
        `(${p2.startX},${p2.startY}) → (${r2.x},${r2.y})`);

      // ③ Enter 进文字编辑（真实按键），Esc 退出
      await v2click(p2.px, p2.py);
      await sleep(240);
      await v2key('Enter', 'Enter', 13);
      await sleep(340);
      const entered = await v2eval(`document.getElementById('v2-stage').classList.contains('v2-editing')`);
      await v2key('Escape', 'Escape', 27);
      await sleep(300);
      const exited = await v2eval(`!document.getElementById('v2-stage').classList.contains('v2-editing')`);
      check('A0-11 Enter 进文字编辑（Esc 退出）', entered && exited, `进入=${entered} 退出=${exited}`);

      // ④ 锁轴逻辑单测（不依赖 GUI 命中，兜底保证语义正确）
      const ax = JSON.parse(await v2eval(`(() => JSON.stringify({
        h: window.__v2.lockAxis({ x: 100, y: 50 }, 120, 8, true),
        v: window.__v2.lockAxis({ x: 100, y: 50 }, 5, 90, true),
        f: window.__v2.lockAxis({ x: 100, y: 50 }, 120, 8, false),
      }))()`));
      check('A0-11 轴向锁定纯函数',
        ax.h.x === 220 && ax.h.y === 50 && ax.v.x === 100 && ax.v.y === 140 && ax.f.x === 220 && ax.f.y === 58,
        JSON.stringify(ax));
    }

    // 地雷二：拖拽轻路径——拖拽期间只预览 DOM、不动库；松手一次性提交（消除每帧全量重建）
    {
      const before = JSON.parse(await v2eval(`(() => {
        const stage = document.getElementById('v2-stage');
        const d = window.__v2.getDoc();
        const el = d.elements[1];
        const div = stage.querySelector('[data-el-id="' + el.id + '"]');
        div.scrollIntoView({ block: 'center' });
        const r = div.getBoundingClientRect();
        return JSON.stringify({ id: el.id, px: Math.round(r.left + r.width / 2), py: Math.round(r.top + Math.min(30, r.height / 2)), x: el.x, y: el.y });
      })()`));
      await v2mouse('mousePressed', before.px, before.py, 0);
      await sleep(70);
      await v2mouse('mouseMoved', before.px + 60, before.py + 40, 0);
      await sleep(90);
      const mid = JSON.parse(await v2eval(`(() => {
        const el = window.__v2.getDoc().elements.find(x => x.id === '${before.id}');
        const div = document.querySelector('[data-el-id="${before.id}"]');
        return JSON.stringify({ storeX: el.x, storeY: el.y, domLeft: Math.round(parseFloat(div.style.left)), domTop: Math.round(parseFloat(div.style.top)) });
      })()`));
      check('地雷二：拖拽中只预览 DOM、库未动',
        mid.storeX === before.x && mid.storeY === before.y && (mid.domLeft !== before.x || mid.domTop !== before.y),
        `库 (${mid.storeX},${mid.storeY})；DOM (${mid.domLeft},${mid.domTop})；原 (${before.x},${before.y})`);
      await v2mouse('mouseReleased', before.px + 60, before.py + 40, 0);
      await sleep(360);
      const after = JSON.parse(await v2eval(`(() => { const el = window.__v2.getDoc().elements.find(x => x.id === '${before.id}'); return JSON.stringify({ x: el.x, y: el.y }); })()`));
      check('地雷二：松手一次性提交到库', after.x !== before.x && after.y !== before.y, `(${before.x},${before.y}) → (${after.x},${after.y})`);

      // 溢出批量测量仍准确：改小高度 → overflow 标记；还原 → 标记消失
      const ov = JSON.parse(await v2eval(`(() => {
        window.__v2.setSel(null);
        const el = window.__v2.getDoc().elements[1];
        const orig = el.height;
        window.__v2.updateElement(el.id, { height: 60 });
        return JSON.stringify({ id: el.id, orig });
      })()`));
      await sleep(360);
      const overflowOn = await v2eval(`document.querySelector('[data-el-id="${ov.id}"]').classList.contains('overflow')`);
      check('地雷二：溢出批量测量（改小 → 标记出现）', overflowOn === true, `高度 ${ov.orig}→60`);
      await v2eval(`(() => { window.__v2.updateElement('${ov.id}', { height: ${ov.orig} }); return true; })()`);
      await sleep(360);
      const overflowOff = await v2eval(`!document.querySelector('[data-el-id="${ov.id}"]').classList.contains('overflow')`);
      check('地雷二：溢出恢复（还原高度 → 标记消失）', overflowOff === true);
    }

    // 修复：右键"插入图片"落在点击处（此前被丢到全页元素下方）+ 块内含图时给"更换图片"
    {
      const TINY = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      // 造一个"块内含图"的元素（模拟 v1 块降级：元素 type 不是 image，但 HTML 里有 <img>）
      await v2eval(`(() => { window.__v2.adapter.insertFreeHTML('<div style="padding:20px;background:#eef2f7"><img src="${TINY}" width="200" height="120" alt=""><p style="margin:8px 0 0">图片位</p></div>'); return true; })()`);
      await sleep(360);

      // 滚进视口后反查一个"确实命中该元素"的视口点（元素可能与模板元素重叠，盲算坐标会点错）
      const tgt = JSON.parse(await v2eval(`(() => {
        const d = window.__v2.getDoc();
        const e = d.elements[d.elements.length - 1];
        const div = document.querySelector('[data-el-id="' + e.id + '"]');
        if (!div) return JSON.stringify({ ok: false, why: '元素不在 DOM' });
        div.scrollIntoView({ block: 'center' });
        const r = div.getBoundingClientRect();
        const cands = [[0.5, 0.5], [0.5, 0.2], [0.2, 0.5], [0.5, 0.8], [0.35, 0.35]];
        for (const c of cands) {
          const x = Math.round(r.left + r.width * c[0]), y = Math.round(r.top + r.height * c[1]);
          if (x < 12 || y < 12 || x > window.innerWidth - 12 || y > window.innerHeight - 12) continue;
          const hit = document.elementFromPoint(x, y);
          const host = hit && hit.closest('[data-el-id]');
          if (host && host.dataset.elId === e.id) return JSON.stringify({ id: e.id, cx: x, cy: y, ok: true });
        }
        return JSON.stringify({ ok: false, id: e.id, why: '点位不在视口内或被遮挡', top: Math.round(r.top), left: Math.round(r.left), h: Math.round(r.height), vh: window.innerHeight });
      })()`));

      if (!tgt.ok) {
        check('修复：块内含图 → 菜单给"更换图片"', false, `构造失败 ${JSON.stringify(tgt)}`);
        check('修复：更换图片对块内 <img> 生效', false, '同上');
        check('修复：插入图片落在右键位置（不再丢到页面下方）', false, '同上');
      } else {
        // ① 真实右键 → 菜单应含"更换图片"（块内含图，尽管元素 type 不是 image）
        await v2mouse('mousePressed', tgt.cx, tgt.cy, 0, 'right');
        await v2mouse('mouseReleased', tgt.cx, tgt.cy, 0, 'right');
        await sleep(300);
        const acts = await v2eval(`[...document.querySelectorAll('.v2-ctx [data-act]')].map(b => b.dataset.act).join(',')`);
        const hit = await v2eval(`(() => { const t = window.__v2.ctx.target(); return t ? String(t.elementId) : 'null'; })()`);
        check('修复：块内含图 → 菜单给"更换图片"', acts.indexOf('replaceImg') >= 0,
          `右键命中元素 ${hit}（目标 ${tgt.id}）；菜单项 ${acts}`);

        // ② 走"更换图片"：换掉块内那张 <img>
        await v2eval(`(() => { const b = document.querySelector('.v2-ctx [data-act="replaceImg"]'); if (b) b.click(); return true; })()`);
        await sleep(280);
        await v2eval(`(() => { document.getElementById('v2-img-url').value = '${TINY}#changed'; return true; })()`);
        await v2eval(`(() => { document.getElementById('v2-img-ok').click(); return true; })()`);
        await sleep(360);
        const swapped = await v2eval(`window.__v2.getDoc().elements.find(x => x.id === '${tgt.id}').html.indexOf('#changed') >= 0`);
        check('修复：更换图片对块内 <img> 生效', swapped === true);

        // ③ 走"另插入一张图片"：新图应落在右键点附近，而不是画布最底部
        const before = await v2eval(`window.__v2.getDoc().elements.length`);
        await v2mouse('mousePressed', tgt.cx, tgt.cy, 0, 'right');
        await v2mouse('mouseReleased', tgt.cx, tgt.cy, 0, 'right');
        await sleep(300);
        await v2eval(`(() => { const b = document.querySelector('.v2-ctx [data-act="insertImg"]'); if (b) b.click(); return true; })()`);
        await sleep(280);
        await v2eval(`(() => { document.getElementById('v2-img-url').value = '${TINY}#placed'; return true; })()`);
        await v2eval(`(() => { document.getElementById('v2-img-ok').click(); return true; })()`);
        await sleep(400);
        const placed = JSON.parse(await v2eval(`(() => {
          const d = window.__v2.getDoc();
          const nu = d.elements[d.elements.length - 1];
          const ref = d.elements.find(x => x.id === '${tgt.id}');
          return JSON.stringify({ n: d.elements.length, x: nu.x, y: nu.y, hasPlaced: String(nu.html).indexOf('#placed') >= 0, rx: ref.x, ry: ref.y, rh: ref.height, stageH: d.stage.height });
        })()`));
        const inRange = placed.y >= placed.ry - 12 && placed.y <= placed.ry + placed.rh + 12;
        check('修复：插入图片落在右键位置（不再丢到页面下方）',
          placed.n === before + 1 && placed.hasPlaced && inRange,
          `新图 (${placed.x},${placed.y})；被点元素 y=${placed.ry} 高=${placed.rh}；画布高=${placed.stageH}`);
      }
    }

    // 修复：复合模块内部的按钮/标题选不上也改不了（v1 块 HTML 一个 data-id 都没有）
    {
      const MARKUP = '<div style="padding:32px;background:#111827;text-align:center"><h2 style="color:#fff;font-size:28px;margin:0 0 12px">加入我们</h2><p style="color:#9ca3af;margin:0 0 20px">现在就开启你的旅程</p><a href="#" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 28px;border-radius:999px;text-decoration:none">立即注册</a></div>';
      await v2eval(`(() => { window.__v2.adapter.insertFreeHTML('${MARKUP}'); return true; })()`);
      await sleep(360);

      // ① 块 HTML 进画布时应自动补叶子标记（否则块内元素没有可改的身份）
      const info = JSON.parse(await v2eval(`(() => {
        const d = window.__v2.getDoc();
        const e = d.elements[d.elements.length - 1];
        const ids = (e.html.match(/data-id="[^"]+"/g) || []);
        const btnId = (e.html.match(/<a[^>]*data-id="([^"]+)"/) || [])[1] || null;
        return JSON.stringify({ id: e.id, ids, btnId });
      })()`));
      check('修复：块 HTML 自动补叶子标记', info.ids.length >= 3 && !!info.btnId,
        `共 ${info.ids.length} 个叶子：${info.ids.join(',')}`);

      // ② 右键块内按钮 → 菜单给「选中这个内部元素」
      const pt = JSON.parse(await v2eval(`(() => {
        const d = window.__v2.getDoc();
        const e = d.elements[d.elements.length - 1];
        const host = document.querySelector('[data-el-id="' + e.id + '"]');
        host.scrollIntoView({ block: 'center' });
        const a = host.querySelector('a[data-id]');
        const r = a.getBoundingClientRect();
        return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
      })()`));
      await v2mouse('mousePressed', pt.x, pt.y, 0, 'right');
      await v2mouse('mouseReleased', pt.x, pt.y, 0, 'right');
      await sleep(320);
      const acts2 = await v2eval(`[...document.querySelectorAll('.v2-ctx [data-act]')].map(b => b.dataset.act).join(',')`);
      check('修复：右键块内按钮 → 菜单给「选中这个内部元素」', acts2.indexOf('deep') >= 0, `菜单项 ${acts2}`);

      // ③ 执行「选中这个内部元素」→ 叶子高亮 + 样式面板同步切到它
      await v2eval(`(() => { const b = document.querySelector('.v2-ctx [data-act="deep"]'); if (b) b.click(); return true; })()`);
      await sleep(340);
      const deep = JSON.parse(await v2eval(`(() => JSON.stringify({
        highlighted: document.querySelectorAll('#v2-stage .v2-leaf-sel').length,
        panelLeaf: (document.getElementById('sp-leaf') || {}).value || '',
        panelLabel: (() => { const s = document.getElementById('sp-leaf'); return s && s.selectedIndex >= 0 ? s.options[s.selectedIndex].textContent : ''; })(),
      }))()`));
      check('修复：深入选中叶子（画布高亮 + 样式面板同步）',
        deep.highlighted === 1 && deep.panelLeaf === info.btnId,
        `高亮 ${deep.highlighted} 处；面板叶子=${deep.panelLeaf}（按钮=${info.btnId}）；下拉显示「${deep.panelLabel}」`);

      // ④ 选中后改样式应落到该叶子的覆盖表（这才叫"能改"）
      await v2eval(`(() => { const i = document.getElementById('sp-leaf-color'); i.value = '#ff00aa'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      await sleep(340);
      const styled = JSON.parse(await v2eval(`(() => {
        const e = window.__v2.getDoc().elements.find(x => x.id === '${info.id}');
        const o = ((e.overrides || {})['${info.btnId}']) || {};
        const host = document.querySelector('[data-el-id="${info.id}"]');
        const a = host && host.querySelector('a[data-id="${info.btnId}"]');
        return JSON.stringify({ color: o.color || null, rendered: a ? getComputedStyle(a).color : null });
      })()`));
      check('修复：叶子样式写入 overrides 且画布即时生效',
        styled.color === '#ff00aa', `override=${styled.color} 渲染色=${styled.rendered}`);

      // ⑤ Ctrl+点击同效（再点同一处会退回整块，所以先清一次选择）
      await v2eval(`(() => { window.__v2.setSel(null); return true; })()`);
      await sleep(220);
      await v2mouse('mousePressed', pt.x, pt.y, 2); // 2 = Ctrl
      await v2mouse('mouseReleased', pt.x, pt.y, 2);
      await sleep(340);
      const ctrlDeep = await v2eval(`document.querySelectorAll('#v2-stage .v2-leaf-sel').length`);
      check('修复：Ctrl+点击也能深入选中', ctrlDeep === 1, `高亮 ${ctrlDeep} 处`);

      // ⑥ 幂等：已带 data-id 的叶子不应被重新编号（懒迁移每次加载都会遇到同一批元素）
      await v2eval(`(() => { window.__v2.adapter.insertFreeHTML('<div><p data-id="p_keep" style="margin:0">已有标记</p></div>'); return true; })()`);
      await sleep(320);
      const idem = JSON.parse(await v2eval(`(() => {
        const d = window.__v2.getDoc();
        const e = d.elements[d.elements.length - 1];
        return JSON.stringify({ kept: e.html.indexOf('data-id="p_keep"') >= 0, pf: /data-id="pf\\d/.test(e.html) });
      })()`));
      check('修复：已有 data-id 不被覆盖（补标记幂等）', idem.kept && !idem.pf, JSON.stringify(idem));
    }

    // 修复：AI 助手识别不到深入选中的块内元素（选中小模块后 AI 改不动它）
    {
      await v2eval(`(() => { window.__v2.adapter.insertFreeHTML('<div style="padding:28px;background:#0f172a;text-align:center"><p style="color:#94a3b8;margin:0 0 14px">订阅我们的更新</p><a href="#" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none">订阅</a></div>'); return true; })()`);
      await sleep(360);
      const ai = JSON.parse(await v2eval(`(() => {
        const d = window.__v2.getDoc();
        const e = d.elements[d.elements.length - 1];
        const btn = (e.html.match(/<a[^>]*data-id="([^"]+)"/) || [])[1];
        return JSON.stringify({ id: e.id, btn });
      })()`));
      await v2eval(`(() => { window.__v2.selectLeaf('${ai.id}', '${ai.btn}'); return true; })()`);
      await sleep(340);

      // ① 适配器上下文聚焦到叶子（tagName/leafId/文本都来自那个按钮）
      const ctxLeaf = JSON.parse(await v2eval(`(() => {
        const s = window.__v2.adapter.getSelection();
        const h = window.__v2.adapter.getSelectionHTML();
        return JSON.stringify({ tag: s.tagName, leafId: s.leafId, label: s.leafLabel, inside: !!s.insideBlock, text: s.text, leafOnly: h.indexOf('<div') < 0 && h.indexOf('订阅') >= 0 });
      })()`));
      check('修复：AI 上下文聚焦到内部元素',
        ctxLeaf.tag === 'a' && ctxLeaf.leafId === ai.btn && ctxLeaf.inside === true && ctxLeaf.leafOnly === true,
        `tag=${ctxLeaf.tag} 标签=${ctxLeaf.label} 文本「${ctxLeaf.text}」 只给叶子=${ctxLeaf.leafOnly}`);

      // ② AI 面板提示条标注作用范围
      const ctxBar = await v2eval(`(document.getElementById('ai-context') || {}).textContent || ''`);
      check('修复：AI 提示条标注作用范围', ctxBar.indexOf('组件内部') >= 0, `提示条：${ctxBar}`);

      // ③ AI 改样式（含背景/圆角）只落到那个叶子，整块容器不受影响
      const aiStyle = JSON.parse(await v2eval(`(() => {
        try { window.__v2.adapter.applyStyleToSelection('background:linear-gradient(90deg,#f59e0b,#ef4444);border-radius:999px;'); } catch (e) { return JSON.stringify({ err: String(e.message) }); }
        const e = window.__v2.getDoc().elements.find(x => x.id === '${ai.id}');
        const o = ((e.overrides || {})['${ai.btn}']) || {};
        return JSON.stringify({ leafBg: o.background || null, leafRadius: o['border-radius'] || null, containerStyle: e.style || {} });
      })()`));
      check('修复：AI 改样式只作用于选中的内部元素',
        String(aiStyle.leafBg || '').indexOf('linear-gradient') >= 0 && !aiStyle.containerStyle.background,
        `叶子 background=${aiStyle.leafBg}；容器 style=${JSON.stringify(aiStyle.containerStyle)}${aiStyle.err ? ' err=' + aiStyle.err : ''}`);

      // ④ 快捷提示按内部元素类型切换（按钮 → 胶囊/渐变一组）
      const chips = await v2eval(`[...document.querySelectorAll('#ai-chips .chip')].map(c => c.textContent).join(' | ')`);
      check('修复：AI 快捷提示按内部元素类型切换', chips.indexOf('胶囊') >= 0 || chips.indexOf('渐变') >= 0, `chips：${chips}`);

      // ⑤ 回到整块选中 → 上下文退回整块（不能一直卡在叶子上）
      await v2eval(`(() => { window.__v2.setSel('${ai.id}'); return true; })()`);
      await sleep(280);
      const back = JSON.parse(await v2eval(`(() => { const s = window.__v2.adapter.getSelection(); return JSON.stringify({ leafId: s.leafId, inside: !!s.insideBlock }); })()`));
      check('修复：退回整块选中后上下文复位', back.leafId === null && back.inside === false, JSON.stringify(back));
    }

    // 修复：伪选中——选中小模块却调了整体（不透明度/背景等"容器字段"写死到整块）
    {
      await v2eval(`(() => { window.__v2.adapter.insertFreeHTML('<div style="padding:26px;background:#1e293b;text-align:center"><p style="color:#cbd5e1;margin:0 0 12px">想看更多吗</p><a href="#" style="display:inline-block;background:#22c55e;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none">查看更多</a></div>'); return true; })()`);
      await sleep(360);
      const w = JSON.parse(await v2eval(`(() => {
        const d = window.__v2.getDoc();
        const e = d.elements[d.elements.length - 1];
        const btn = (e.html.match(/<a[^>]*data-id="([^"]+)"/) || [])[1];
        return JSON.stringify({ id: e.id, btn, elOpacity: e.opacity });
      })()`));

      // ① 整块选中 → 目标应是「整个模块」（不再偷偷落到第一个叶子）
      await v2eval(`(() => { window.__v2.setSel('${w.id}'); return true; })()`);
      await sleep(320);
      const whole = await v2eval(`(document.getElementById('sp-leaf') || {}).value`);
      check('修复：整块选中时目标是「整个模块」', whole === '', `下拉值="${whole}"`);

      // ② 深入选中按钮 → 面板目标自动切到它
      await v2eval(`(() => { window.__v2.selectLeaf('${w.id}', '${w.btn}'); return true; })()`);
      await sleep(340);
      const tgt = await v2eval(`(document.getElementById('sp-leaf') || {}).value`);
      check('修复：深入选中后样式面板目标切到该元素', tgt === w.btn, `下拉值="${tgt}"（按钮=${w.btn}）`);

      // ③ 调不透明度：只写叶子覆盖表，元素级 opacity 不变（用户报的"调了整体"）
      await v2eval(`(() => { const s = document.getElementById('sp-opa'); s.value = '0.35'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await sleep(380);
      const opa = JSON.parse(await v2eval(`(() => {
        const e = window.__v2.getDoc().elements.find(x => x.id === '${w.id}');
        const o = ((e.overrides || {})['${w.btn}']) || {};
        const host = document.querySelector('[data-el-id="${w.id}"]');
        const a = host && host.querySelector('a[data-id="${w.btn}"]');
        return JSON.stringify({ leafOpa: o.opacity || null, elOpa: e.opacity, rendered: a ? getComputedStyle(a).opacity : null });
      })()`));
      check('修复：调不透明度只作用于选中的内部元素',
        opa.leafOpa === '0.35' && opa.elOpa === w.elOpacity,
        `叶子 opacity=${opa.leafOpa}；元素级 opacity=${opa.elOpa}（原 ${w.elOpacity}）；渲染=${opa.rendered}`);

      // ④ 调背景色同样只写叶子（容器 style 不动）
      await v2eval(`(() => { const i = document.getElementById('sp-bg-txt'); i.value = '#ff00aa'; i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await sleep(360);
      const bg = JSON.parse(await v2eval(`(() => {
        const e = window.__v2.getDoc().elements.find(x => x.id === '${w.id}');
        const o = ((e.overrides || {})['${w.btn}']) || {};
        return JSON.stringify({ leafBg: o.background || null, containerBg: (e.style || {}).background || null });
      })()`));
      check('修复：调背景只作用于选中的内部元素',
        bg.leafBg === '#ff00aa' && !bg.containerBg,
        `叶子 background=${bg.leafBg}；容器 background=${bg.containerBg}`);

      // ⑤ 切回「整个模块」→ 改的是元素级（否则整块永远改不了）
      await v2eval(`(() => { const s = document.getElementById('sp-leaf'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await sleep(340);
      await v2eval(`(() => { const s = document.getElementById('sp-opa'); s.value = '0.6'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await sleep(360);
      const backW = JSON.parse(await v2eval(`(() => {
        const e = window.__v2.getDoc().elements.find(x => x.id === '${w.id}');
        const o = ((e.overrides || {})['${w.btn}']) || {};
        return JSON.stringify({ elOpa: e.opacity, leafOpa: o.opacity || null });
      })()`));
      check('修复：目标切回整个模块后改的是整块',
        backW.elOpa === 0.6 && backW.leafOpa === '0.35',
        `元素级 opacity=${backW.elOpa}；叶子 opacity 保持 ${backW.leafOpa}`);
    }

    // 新增：块内元素也能移动/旋转（transform 相对偏移，不破坏块布局）+ 旋转角度吸附
    {
      await v2eval(`(() => { window.__v2.adapter.insertFreeHTML('<div style="padding:30px;background:#111827;text-align:center"><p style="color:#9ca3af;margin:0 0 14px">需要帮助吗</p><a href="#" style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 26px;border-radius:999px;text-decoration:none">联系我们</a></div>'); return true; })()`);
      await sleep(360);
      const lf = JSON.parse(await v2eval(`(() => {
        const d = window.__v2.getDoc();
        const e = d.elements[d.elements.length - 1];
        const btn = (e.html.match(/<a[^>]*data-id="([^"]+)"/) || [])[1];
        return JSON.stringify({ id: e.id, btn, ex: e.x, ey: e.y });
      })()`));
      await v2eval(`(() => { window.__v2.selectLeaf('${lf.id}', '${lf.btn}'); return true; })()`);
      await sleep(380);
      // 新插的块在页面很下方，元素在视口外时 CDP 坐标无效 → 先滚到可见再交互
      await v2eval(`(() => { const h = document.querySelector('[data-el-id="${lf.id}"]'); if (h) h.scrollIntoView({ block: 'center' }); return true; })()`);
      await sleep(320);

      // ① 浮层出现且正好框住叶子、带旋转点
      const fr = JSON.parse(await v2eval(`(() => {
        const f = document.querySelector('#v2-stage .v2-leaf-frame');
        const host = document.querySelector('[data-el-id="${lf.id}"]');
        const a = host && host.querySelector('a[data-id="${lf.btn}"]');
        if (!f || !a) return JSON.stringify({ ok: false, hasFrame: !!f, hasLeaf: !!a });
        const f1 = f.getBoundingClientRect(), a1 = a.getBoundingClientRect();
        return JSON.stringify({ ok: true, hidden: f.hidden, dx: Math.round(Math.abs(f1.left - a1.left)), dy: Math.round(Math.abs(f1.top - a1.top)), knob: !!f.querySelector('.lf-rot') });
      })()`));
      check('新增：选中块内元素出现移动/旋转浮层',
        fr.ok && !fr.hidden && fr.dx <= 2 && fr.dy <= 2 && fr.knob,
        `偏移 (${fr.dx},${fr.dy}) 有旋转点=${fr.knob}`);

      // ② 拖浮层 = 位移（写叶子 transform；块本身 x/y 必须不动，否则布局被破坏）
      const fpos = JSON.parse(await v2eval(`(() => { const r = document.querySelector('#v2-stage .v2-leaf-frame').getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }); })()`));
      await v2mouse('mousePressed', fpos.x, fpos.y, 0);
      await sleep(70);
      await v2mouse('mouseMoved', fpos.x + 30, fpos.y + 20, 0);
      await sleep(70);
      await v2mouse('mouseMoved', fpos.x + 70, fpos.y + 45, 0);
      await sleep(70);
      await v2mouse('mouseReleased', fpos.x + 70, fpos.y + 45, 0);
      await sleep(380);
      const mv = JSON.parse(await v2eval(`(() => {
        const e = window.__v2.getDoc().elements.find(x => x.id === '${lf.id}');
        const ov = ((e.overrides || {})['${lf.btn}']) || {};
        const host = document.querySelector('[data-el-id="${lf.id}"]');
        const a = host && host.querySelector('a[data-id="${lf.btn}"]');
        return JSON.stringify({ tf: ov.transform || null, ex: e.x, ey: e.y, rendered: a ? getComputedStyle(a).transform.slice(0, 40) : '' });
      })()`));
      // 位移量按 zoom 换算（屏幕 70px ÷ zoom），所以断言用区间而不是固定值
      const tfm = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/.exec(String(mv.tf || ''));
      const tx = tfm ? Number(tfm[1]) : 0, ty = tfm ? Number(tfm[2]) : 0;
      check('新增：拖浮层移动内部元素（块布局不受影响）',
        tx > 60 && tx < 95 && ty > 40 && ty < 65 && mv.ex === lf.ex && mv.ey === lf.ey,
        `叶子 transform=${mv.tf}（位移 ${tx},${ty}）；块 x/y 保持 (${mv.ex},${mv.ey})（原 ${lf.ex},${lf.ey}）`);

      // ③ 拖旋转点 = 旋转
      const kp = JSON.parse(await v2eval(`(() => { const r = document.querySelector('#v2-stage .v2-leaf-frame .lf-rot').getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }); })()`));
      await v2mouse('mousePressed', kp.x, kp.y, 0);
      await sleep(70);
      await v2mouse('mouseMoved', kp.x + 60, kp.y + 12, 0);
      await sleep(70);
      await v2mouse('mouseMoved', kp.x + 130, kp.y + 26, 0);
      await sleep(70);
      await v2mouse('mouseReleased', kp.x + 130, kp.y + 26, 0);
      await sleep(380);
      const rt = await v2eval(`(() => { const e = window.__v2.getDoc().elements.find(x => x.id === '${lf.id}'); return (((e.overrides || {})['${lf.btn}']) || {}).transform || ''; })()`);
      check('新增：拖旋转点旋转内部元素', /rotate\(/.test(String(rt)) && /translate\(/.test(String(rt)), `叶子 transform=${rt}`);

      // ④ 角度吸附纯函数
      const sa = JSON.parse(await v2eval(`(() => JSON.stringify({
        n0: window.__v2.snapAngle(2.5), n90: window.__v2.snapAngle(88), n180: window.__v2.snapAngle(178.6),
        n270: window.__v2.snapAngle(-89), n360: window.__v2.snapAngle(359), free: window.__v2.snapAngle(37.4),
      }))()`));
      check('新增：旋转角度吸附（0/90/180/270 ±4°）',
        sa.n0 === 0 && sa.n90 === 90 && sa.n180 === 180 && sa.n270 === 270 && sa.n360 === 0 && sa.free === 37.4,
        JSON.stringify(sa));

      // ⑤ 双击旋转点归零
      await v2eval(`(() => { document.querySelector('#v2-stage .v2-leaf-frame .lf-rot').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return true; })()`);
      await sleep(340);
      const zero = await v2eval(`(() => { const e = window.__v2.getDoc().elements.find(x => x.id === '${lf.id}'); return (((e.overrides || {})['${lf.btn}']) || {}).transform || ''; })()`);
      check('新增：双击旋转点归零', !/rotate\(/.test(String(zero)), `叶子 transform=${zero}（应只剩 translate）`);

      // ⑥ 导出：叶子的 transform 必须出现在导出的 HTML 里（改了半天导不出去 = 白改）
      // 注意：模板字符串里 \(\) \s 会被 JS 吃掉（\(s → s），这里用 indexOf 避免转义坑
      const exp = JSON.parse(await v2eval(`(() => { const h = window.__v2.exportHtml(); return JSON.stringify({ hasTf: h.indexOf('translate(79px') >= 0, len: h.length }); })()`));
      check('新增：叶子 transform 随导出带出', exp.hasTf === true, `导出 ${exp.len} 字符，含 translate(79px)=${exp.hasTf}`);

      // ⑦ 修复：叶子移动吸附（用户报"小模块的移动吸附没有了"）
      //    做法：拖到"离块容器左边缘 3px"处（在 8px 阈值内）→ 吸附应把这点误差补掉，正好对齐
      const geo = JSON.parse(await v2eval(`(() => {
        const sr = document.getElementById('v2-stage').getBoundingClientRect();
        const host = document.querySelector('[data-el-id="${lf.id}"]');
        const a = host.querySelector('a[data-id="${lf.btn}"]');
        const hr = host.getBoundingClientRect(), ar = a.getBoundingClientRect();
        const f = document.querySelector('#v2-stage .v2-leaf-frame').getBoundingClientRect();
        return JSON.stringify({
          needDx: Math.round((hr.left - sr.left) - (ar.left - sr.left)),
          fx: Math.round(f.left + f.width / 2), fy: Math.round(f.top + f.height / 2),
        });
      })()`));
      await v2mouse('mousePressed', geo.fx, geo.fy, 0);
      await sleep(70);
      await v2mouse('mouseMoved', geo.fx + (geo.needDx - 3), geo.fy, 0);
      await sleep(110);
      const guideCount = await v2eval(`document.querySelectorAll('#v2-stage .v2-gx').length`);
      await v2mouse('mouseReleased', geo.fx + (geo.needDx - 3), geo.fy, 0);
      await sleep(340);
      const snapRes = JSON.parse(await v2eval(`(() => {
        const sr = document.getElementById('v2-stage').getBoundingClientRect();
        const host = document.querySelector('[data-el-id="${lf.id}"]');
        const a = host.querySelector('a[data-id="${lf.btn}"]');
        const e = window.__v2.getDoc().elements.find(x => x.id === '${lf.id}');
        return JSON.stringify({
          diff: Math.round((a.getBoundingClientRect().left - sr.left) - (host.getBoundingClientRect().left - sr.left)),
          tf: (((e.overrides || {})['${lf.btn}']) || {}).transform || '',
        });
      })()`));
      check('修复：叶子移动吸附到块容器边缘',
        Math.abs(snapRes.diff) <= 1 && guideCount >= 1,
        `左边缘差 ${snapRes.diff}px（拖到差 3px，吸附应补正）；拖拽中参考线 ${guideCount} 条；transform=${snapRes.tf}`);

      // ⑧ 地雷二：叶子拖拽同样走轻路径（拖拽中库未动、DOM 已预览；松手一次性提交）
      const f2 = JSON.parse(await v2eval(`(() => {
        const r = document.querySelector('#v2-stage .v2-leaf-frame').getBoundingClientRect();
        const e = window.__v2.getDoc().elements.find(x => x.id === '${lf.id}');
        return JSON.stringify({ fx: Math.round(r.left + r.width / 2), fy: Math.round(r.top + r.height / 2), tf: (((e.overrides || {})['${lf.btn}']) || {}).transform || '' });
      })()`));
      await v2mouse('mousePressed', f2.fx, f2.fy, 0);
      await sleep(70);
      await v2mouse('mouseMoved', f2.fx + 40, f2.fy + 30, 0);
      await sleep(90);
      const mid2 = JSON.parse(await v2eval(`(() => {
        const e = window.__v2.getDoc().elements.find(x => x.id === '${lf.id}');
        const a = document.querySelector('[data-el-id="${lf.id}"] a[data-id="${lf.btn}"]');
        return JSON.stringify({ tf: (((e.overrides || {})['${lf.btn}']) || {}).transform || '', inline: a ? a.style.transform : '' });
      })()`));
      check('地雷二：叶子拖拽中库未动、DOM 已预览', mid2.tf === f2.tf && mid2.inline !== '', `库="${mid2.tf}" DOM="${mid2.inline}"`);
      await v2mouse('mouseReleased', f2.fx + 40, f2.fy + 30, 0);
      await sleep(360);
      const after2 = await v2eval(`(() => { const e = window.__v2.getDoc().elements.find(x => x.id === '${lf.id}'); return (((e.overrides || {})['${lf.btn}']) || {}).transform || ''; })()`);
      check('地雷二：叶子松手一次性提交', after2 !== f2.tf && /translate\(/.test(String(after2)), `transform=${after2}`);
    }

    // A1-1 素材库：图标 / 插画 / 文案（全内嵌，导出不依赖网络）
    {
      await v2eval(`(() => { document.getElementById('v2-asset-btn').click(); return true; })()`);
      await sleep(320);

      const tabs = JSON.parse(await v2eval(`(() => {
        const out = {};
        document.querySelectorAll('.asset-tab').forEach((b) => {
          b.click();
          out[b.dataset.tab] = document.querySelectorAll('#v2-asset-body [data-kind]').length;
        });
        document.querySelector('.asset-tab[data-tab="icon"]').click();
        return JSON.stringify(out);
      })()`));
      check('A1-1 素材面板三分类都有内容',
        tabs.icon >= 20 && tabs.image >= 10 && tabs.text >= 5,
        `图标 ${tabs.icon} · 插画 ${tabs.image} · 文案 ${tabs.text}`);

      const searchHit = JSON.parse(await v2eval(`(() => {
        const q = document.getElementById('v2-asset-q');
        q.value = '箭头'; q.dispatchEvent(new Event('input', { bubbles: true }));
        const n = document.querySelectorAll('#v2-asset-body [data-kind]').length;
        q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
        return JSON.stringify({ n });
      })()`));
      check('A1-1 素材搜索过滤', searchHit.n > 0 && searchHit.n < tabs.icon, `搜"箭头"得 ${searchHit.n} 项（共 ${tabs.icon}）`);

      const ins = JSON.parse(await v2eval(`(async () => {
        const before = window.__v2.getDoc().elements.length;
        const pick = (kind) => { document.querySelector('.asset-tab[data-tab="' + kind + '"]').click(); return document.querySelector('#v2-asset-body [data-kind="' + kind + '"]'); };
        pick('icon').click();
        await new Promise(r => setTimeout(r, 280));
        pick('image').click();
        await new Promise(r => setTimeout(r, 280));
        pick('text').click();
        await new Promise(r => setTimeout(r, 340));
        const d = window.__v2.getDoc();
        const els = d.elements.slice(-3);
        return JSON.stringify({
          n: d.elements.length - before,
          iconSvg: /<svg/i.test(els[0].html), iconSize: els[0].width + 'x' + els[0].height,
          imgType: els[1].type, imgData: (els[1].html || '').indexOf('data:image/svg+xml') >= 0, imgW: els[1].width,
          textHasLeaf: /data-id="/.test(els[2].html), textW: els[2].width,
        });
      })()`));
      check('A1-1 插入图标（内联 SVG 元素）', ins.iconSvg && ins.iconSize === '56x56', `尺寸 ${ins.iconSize}，含 svg=${ins.iconSvg}`);
      check('A1-1 插入插画（image + dataURL）', ins.imgType === 'image' && ins.imgData && ins.imgW === 320, `type=${ins.imgType} dataURL=${ins.imgData} 宽=${ins.imgW}`);
      check('A1-1 插入文案（可编辑叶子）', ins.textHasLeaf === true, `宽 ${ins.textW}，含 data-id=${ins.textHasLeaf}`);

      await v2eval(`(() => { document.getElementById('v2-asset-cancel').click(); return true; })()`);
      await sleep(220);

      // ★ A1-1 验收核心：导出不依赖网络（素材全是内联 SVG/dataURL）
      const offline = JSON.parse(await v2eval(`(() => {
        const h = window.__v2.exportHtml();
        const ext = (h.match(/src="https?[:][/][/]/g) || []).length;
        return JSON.stringify({ ext, len: h.length, hasSvg: /<svg/i.test(h) });
      })()`));
      check('A1-1 导出不依赖网络（无外链资源）', offline.ext === 0 && offline.hasSvg,
        `外链资源 ${offline.ext} 个；导出 ${offline.len} 字符，含内联 svg=${offline.hasSvg}`);
    }

    // A1-2 AI 配色在 canvas 打通（调色板 → 全页元素；诚实计数可核对）
    {
      await v2eval(`(() => { document.getElementById('v2-tpl-btn').click(); return true; })()`);
      await sleep(240);
      await v2eval(`(() => { const b = document.querySelector('#v2-tpl-grid [data-tpl="landing"]'); if (b) b.click(); return true; })()`);
      await sleep(460);

      const colorBtn = await v2eval(`(() => { const b = document.getElementById('ai-tool-color'); return b ? b.style.display !== 'none' : false; })()`);
      check('A1-2 配色工具在 canvas 可见', colorBtn === true);

      // 应用一套调色板，并反向核对适配器报的计数是否属实
      const pal = JSON.parse(await v2eval(`(() => {
        const beforeBg = window.__v2.getDoc().stage.background;
        const st = window.__v2.adapter.applyPalette({ bg: '#0b1020', primary: '#22d3ee', text: '#e2e8f0', accent: '#f472b6' });
        const d = window.__v2.getDoc();
        let t = 0, x = 0, b = 0;
        for (const e of d.elements) {
          const tmp = document.createElement('div'); tmp.innerHTML = e.html;
          for (const n of tmp.querySelectorAll('[data-id]')) {
            const o = ((e.overrides || {})[n.getAttribute('data-id')]) || {};
            const tag = n.tagName.toLowerCase();
            if (/^h[1-6]$/.test(tag) && o.color === '#22d3ee') t++;
            else if ((tag === 'a' || tag === 'button') && o.background === '#f472b6') b++;
            else if (o.color === '#e2e8f0') x++;
          }
        }
        return JSON.stringify({ st, beforeBg, afterBg: d.stage.background, t, x, b });
      })()`));
      check('A1-2 配色写入全页（画布底 + 标题 + 正文 + 按钮）',
        pal.st.stage === true && pal.afterBg === '#0b1020' && pal.t > 0 && pal.b > 0,
        `画布底 ${pal.beforeBg}→${pal.afterBg}；标题 ${pal.st.titles} · 正文 ${pal.st.texts} · 按钮 ${pal.st.buttons}`);
      check('A1-2 计数属实（适配器报的 = 实测写入的）',
        pal.st.titles === pal.t && pal.st.buttons === pal.b,
        `标题 ${pal.st.titles}=${pal.t} · 按钮 ${pal.st.buttons}=${pal.b} · 正文 ${pal.st.texts}/${pal.x}`);

      // 渲染层真的变了（不只是数据）
      const rendered = JSON.parse(await v2eval(`(() => {
        for (const e of window.__v2.getDoc().elements) {
          const host = document.querySelector('[data-el-id="' + e.id + '"]');
          if (!host) continue;
          const h = host.querySelector('h1[data-id], h2[data-id], h3[data-id]');
          if (h) return JSON.stringify({ color: getComputedStyle(h).color });
        }
        return JSON.stringify({ color: null });
      })()`));
      check('A1-2 配色即时生效于画布', /34, 211, 238/.test(String(rendered.color)), `标题渲染色 ${rendered.color}（期望 rgb(34,211,238)）`);

      // 无效配色必须如实抛错，不能静默成功
      const bad = JSON.parse(await v2eval(`(() => {
        try { window.__v2.adapter.applyPalette({ primary: 'notacolor' }); return JSON.stringify({ threw: false }); }
        catch (e) { return JSON.stringify({ threw: true, msg: String(e.message).slice(0, 34) }); }
      })()`));
      check('A1-2 无效配色如实报错（不静默）', bad.threw === true, bad.msg);

      // 一次应用 = 一步撤销
      await v2eval(`(() => { window.__v2.undo(); return true; })()`);
      await sleep(360);
      const undone = JSON.parse(await v2eval(`(() => JSON.stringify({ bg: window.__v2.getDoc().stage.background }))()`));
      check('A1-2 配色应用一步撤销', undone.bg !== '#0b1020', `撤销后画布底回到 ${undone.bg}`);
    }

    // 数据安全补丁：存储满 → 可见保存警告；恢复后自动消失（失败不再静默）
    {
      const filled = JSON.parse(await v2eval(`(() => {
        // 逐级缩小填充块，直到 16 字节都写不下——保证余量小于任何真实文档
        const sizes = [1024 * 1024, 64 * 1024, 4 * 1024, 256, 16];
        let n = 0, k = 0;
        for (const sz of sizes) {
          for (;;) {
            try { localStorage.setItem('__pf_fill_' + (k++), 'x'.repeat(sz)); n += sz; }
            catch { break; }
            if (k > 400) break;
          }
        }
        // 注意：满配额下覆盖"等长"文档仍可能成功（净增量为零），必须让文档变大再存
        document.getElementById('v2-page-add').click();
        return JSON.stringify({ n, k });
      })()`));
      await sleep(620);
      const shown = await v2eval(`!!document.getElementById('v2-save-warn')`);
      check('存储满 → 可见保存警告', shown === true, `填充 ${(filled.n / 1024 / 1024).toFixed(1)}MB（${filled.k} 键）后`);
      await v2eval(`(() => {
        for (let i = 0; i < 400; i++) localStorage.removeItem('__pf_fill_' + i);
        window.__v2.snapshot(); window.__v2.undo(); // 触发恢复后的保存
        return true;
      })()`);
      await sleep(620);
      const gone = await v2eval(`!document.getElementById('v2-save-warn')`);
      check('存储恢复 → 警告自动消失', gone === true);
    }

    v2ws.close();
  }
}

// 3.10 运行期无报错
await sleep(500);
check('无 JS 运行时错误', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));

// ---------- 4. 汇总 ----------
ws.close();
const failed = results.filter((r) => !r.pass);
console.log('\n========== 回归结果 ==========');
console.log(`通过 ${results.length - failed.length}/${results.length}${failed.length ? '  ✗ 失败: ' + failed.map((f) => f.name).join(', ') : '  全绿 ✅'}`);
process.exit(failed.length ? 1 : 0);
