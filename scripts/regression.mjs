// PageForge 一键回归（收敛版）：替代散乱的 verify-*.mjs
// 用法：npm run build:single && npm run regression
// 原理：自起 Edge/Chrome headless（临时 profile，用完即删）+ CDP 打开 dist-single/index.html，
//       通过 window.__pageforge 跑核心断言；全绿退出码 0，任一红退出码 1。
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

// 3.10 运行期无报错
await sleep(500);
check('无 JS 运行时错误', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));

// ---------- 4. 汇总 ----------
ws.close();
const failed = results.filter((r) => !r.pass);
console.log('\n========== 回归结果 ==========');
console.log(`通过 ${results.length - failed.length}/${results.length}${failed.length ? '  ✗ 失败: ' + failed.map((f) => f.name).join(', ') : '  全绿 ✅'}`);
process.exit(failed.length ? 1 : 0);
