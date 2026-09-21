// PageForge AI 助手（VS Code 式：侧边栏聊天 + 上下文感知 + 执行操作）
// 依赖 AI 服务商（OpenAI 兼容协议，多模型可切换）
//
// ============ 块协议层（飞轮主循环）============
// 优先级：规则层零 token 直取 → 模型按块目录 insert_block（~30 tok）→ 目录 miss 才裸 HTML（记缺口日志）
// 模式解耦：所有画布操作经 EditorAdapter（flow=包 GrapesJS / canvas=包 v2 store），本文件不直接触碰画布实现
import { blocks } from './blocks.js';
import * as Ace from './ace-bridge.js';
import { createFlowAdapter, flowUndoBatch } from './editor-adapter.js';
import { buildBlockHTML } from './block-html.js';
import { log } from './logger.js';
import { STORAGE_KEYS } from './storage-keys.js';
import { escHtml } from './esc.js';

const AI_API = 'https://api.deepseek.com/chat/completions';
const AI_MODEL = 'deepseek-chat';
const AI_KEY_DEFAULT = typeof __PAGEFORGE_AI_KEY__ !== 'undefined' ? __PAGEFORGE_AI_KEY__ : '';
const $ = (s) => document.querySelector(s);

// ---------- 多服务商适配（OpenAI 兼容协议 = 业界成熟标准，预设表即可，无需 SDK）----------
// 各家都暴露同构的 POST {endpoint} + Bearer key + {model, messages}
const AI_PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'], keyHint: 'platform.deepseek.com 创建（sk- 开头）' },
  { id: 'zhipu', name: '智谱 GLM（有免费模型）', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash-250414', models: ['glm-4-flash-250414', 'glm-4-flashx', 'glm-4-air', 'glm-z1-flash'], keyHint: 'open.bigmodel.cn 创建（glm-4-flash-250414 免费，调试推荐）' },
  { id: 'moonshot', name: 'Kimi (Moonshot)', endpoint: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'kimi-k2-0711-preview'], keyHint: 'platform.moonshot.cn 创建' },
  { id: 'qwen', name: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-turbo', models: ['qwen-turbo', 'qwen-plus', 'qwen-max'], keyHint: '阿里云百炼控制台创建' },
  { id: 'siliconflow', name: '硅基流动', endpoint: 'https://api.siliconflow.cn/v1/chat/completions', model: 'Qwen/Qwen2.5-7B-Instruct', models: ['Qwen/Qwen2.5-7B-Instruct', 'deepseek-ai/DeepSeek-V3', 'THUDM/glm-4-9b-chat'], keyHint: 'cloud.siliconflow.cn 创建（部分模型免费）' },
  { id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', models: ['gpt-4o-mini', 'gpt-4o'], keyHint: 'platform.openai.com 创建（需国外支付）' },
  { id: 'custom', name: '自定义（OpenAI 兼容）', endpoint: '', model: '', models: [], keyHint: '填任意兼容 /chat/completions 的完整地址（含 Ollama/中转站）' },
];

const AI_CFG_KEY = STORAGE_KEYS.AI_CONFIG;

// ---------- 结构化输出：response_format 强制 JSON（问题三修复）----------
// DeepSeek/智谱等主流厂商均支持 json_object 模式；不支持的服务商 400 时自动去掉该参数重试一次
async function chatCompletion(ai, key, messages, maxTokens) {
  const base = {
    model: ai.model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.6,
  };
  const call = (withFormat) => fetch(ai.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify(withFormat ? { ...base, response_format: { type: 'json_object' } } : base),
  }).catch((err) => {
    // 审计 I1：网络层错误脱敏（原始技术细节进 log，用户看人话）
    log.error('AI 网络请求失败', err);
    throw new Error('网络连接失败，请检查网络后重试');
  });
  let res = await call(true);
  if (res.status === 400) {
    // 可能是服务商不支持 response_format → 降级重试
    res = await call(false);
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error('请求失败（' + res.status + '）：' + (errText.slice(0, 200) || '请检查网络/Key'));
  }
  return res.json();
}

// ---------- JSON 抢救解析（弱模型输出不规范的兜底）----------
// 处理三类常见故障：1) 围栏没闭合 2) JSON 前后带杂文本 3) 输出中途被截断（补齐未闭合的字符串/括号）
function tryParseJSON(s) {
  try { return JSON.parse(String(s).trim()); } catch { return null; }
}
export function parseAIJson(reply) {
  const raw = String(reply || '');
  let t = raw.trim();
  let j = tryParseJSON(t);
  if (j) return { json: j, repaired: false };
  // 剥掉成对或未闭合的 markdown 围栏
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  j = tryParseJSON(t);
  if (j) return { json: j, repaired: false };
  // 截取首个 { 到末尾，再尝试
  const a = t.indexOf('{');
  if (a < 0) return null;
  t = t.slice(a);
  j = tryParseJSON(t);
  if (j) return { json: j, repaired: false };
  // 截断补齐：用栈记录未闭合括号类型，按逆序补齐（审计 BUG-01：旧实现 depth 混合计数
  // { 和 [ 但只补 }，数组中间截断会补错括号）
  let inStr = false, esc = false;
  const stack = [];
  for (const ch of t) {
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') inStr = !inStr;
    if (!inStr) {
      if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
      if (ch === '}' || ch === ']') stack.pop();
    }
  }
  let fixed = t;
  if (inStr) fixed += '"';
  fixed = fixed.replace(/[,:\s]+$/, '');
  while (stack.length) fixed += stack.pop();
  j = tryParseJSON(fixed);
  if (j) { log.warn('AI 回复疑似截断，已自动补齐解析（结果需核对）'); return { json: j, repaired: true }; }
  return null;
}
export function getAIConfig() {
  try { return JSON.parse(localStorage.getItem(AI_CFG_KEY) || '{}'); } catch { return {}; }
}
export function setAIConfig(patch) {
  const next = { ...getAIConfig(), ...patch };
  try {
    localStorage.setItem(AI_CFG_KEY, JSON.stringify(next));
  } catch (e) {
    log.warn('AI 配置保存失败（存储满或隐私模式）:', e.message);
  }
  return next;
}
// 当前生效配置：未配置时回落 dev 注入的 DeepSeek（本机开发开箱即用）
export function activeAI() {
  const cfg = getAIConfig();
  const prov = AI_PROVIDERS.find((p) => p.id === cfg.provider) || AI_PROVIDERS[0];
  return {
    provider: prov,
    endpoint: (cfg.provider === 'custom' ? (cfg.endpoint || '') : prov.endpoint) || AI_API,
    model: cfg.model || prov.model || AI_MODEL,
    key: cfg.apiKey || localStorage.getItem(STORAGE_KEYS.AI_KEY_LEGACY) || AI_KEY_DEFAULT,
  };
}

// ---------- 规则层：高频意图零 token 直取 ----------
const RULE_BLOCKS = [
  { re: /页脚|底部收尾|版权行|备案信息/, id: 'pf-footer' },
  { re: /三栏(特性|介绍|功能)?|三个(功能|特性|优势|服务)|功能介绍区/, id: 'pf-section-features' },
  { re: /行动号召|cta|转化(横幅|区)|注册横幅/i, id: 'pf-cta-banner' },
  { re: /导航栏|顶部导航|菜单栏/, id: 'pf-navbar' },
  { re: /公告条|公告栏|通知条|顶部公告/, id: 'pf-announce' },
  { re: /定价(表|方案)|价格表|套餐对比/, id: 'pf-pricing' },
  { re: /常见问题|faq|问答(手风琴|区)?/i, id: 'pf-faq' },
  { re: /时间线|发展历程|里程碑/, id: 'pf-timeline' },
  { re: /统计数字|数据展示|数字区/, id: 'pf-stats' },
  { re: /联系表单|留言表单|表单区/, id: 'pf-form' },
];
// 只在"像插入请求"时命中：有插入动词且无修改动词（"把页脚改成蓝色"不会被劫持）
export function matchRule(text) {
  if (!/(加|插入|添加|做一个|来一个|放个|生成|拼)/.test(text)) return null;
  if (/(改|调|换|删|去掉|移除|颜色|样式|字体|对齐)/.test(text)) return null;
  const hit = RULE_BLOCKS.find((r) => r.re.test(text));
  if (!hit) return null;
  const def = blocks.find((b) => b.id === hit.id);
  return def ? { id: hit.id, def } : null;
}

// ---------- 块目录（注入系统提示）----------
function buildCatalogText() {
  const full = blocks.filter((b) => b.ai).map((b) => {
    const slots = Object.entries(b.ai.slots).map(([k, s]) => `${k}(${s.label})`).join(' ');
    return `- ${b.label}｜${b.ai.desc}｜选:${b.ai.when.join('/')}｜不选:${b.ai.not}｜槽位:${slots}`;
  });
  const rest = blocks.filter((b) => !b.ai).map((b) => b.label);
  return `带槽位的块（优先用，槽位填中文）：\n${full.join('\n')}\n其他可用块（无槽位，引用名字即可，插入后用户画布改字）：${rest.join('、')}`;
}

// ---------- 缺口日志（飞轮：fallback = 模块缺口信号）----------
const GAP_KEY = STORAGE_KEYS.GAP_LOG;
export function getGapLog() {
  try { return JSON.parse(localStorage.getItem(GAP_KEY) || '[]'); } catch { return []; }
}
function logGap(q, head) {
  try {
    const arr = getGapLog();
    arr.unshift({ t: Date.now(), q: String(q).slice(0, 120), head: String(head || '').slice(0, 60) });
    localStorage.setItem(GAP_KEY, JSON.stringify(arr.slice(0, 50)));
  } catch { /* 存储满忽略 */ }
}

export function initAIPanel({ editor, toast, adapter }) {
  // 画布操作统一走 EditorAdapter（未注入时回落 flow 适配器）
  const ad = adapter || createFlowAdapter(editor);
  const panel = $('#ai-panel');
  const mask = $('#ai-panel-mask');
  const btn = $('#btn-ai');
  const msgs = $('#ai-msgs');
  const input = $('#ai-input');
  const sendBtn = $('#ai-send');
  const ctxBar = $('#ai-context');
  const chips = document.querySelectorAll('#ai-chips .chip');

  const getKey = () => activeAI().key;
  const setKey = (k) => setAIConfig({ apiKey: k });

  // 开关面板（P1-1：联动 body.ai-open，右侧 Tab 收窄让位）
  function setPanelOpen(on) {
    open = on;
    panel.classList.toggle('open', on);
    mask.hidden = !on;
    document.body.classList.toggle('ai-open', on);
  }
  let open = false;
  btn.addEventListener('click', () => setPanelOpen(!open));
  mask.addEventListener('click', () => setPanelOpen(false));
  $('#ai-close').addEventListener('click', () => setPanelOpen(false));

  // 上下文：选中组件变化 → 更新提示条（经 adapter，模式无关）
  function updateContext() {
    const sel = ad.getSelection();
    if (sel) {
      // 深入选中块内元素时明确标注作用范围，用户一眼能看到"AI 认得我选的那个按钮"
      const scope = sel.insideBlock ? `（组件内部的${sel.leafLabel || '元素'}）` : '（作用于选中组件）';
      ctxBar.innerHTML = `已选中：<b>&lt;${sel.tagName}&gt;</b> ${sel.text ? '「' + sel.text + '」' : ''}<span class="ctx-hint">${scope}</span>`;
    } else {
      ctxBar.innerHTML = `未选中组件 <span class="ctx-hint">（AI 将作用于整个页面 / 解答问题）</span>`;
    }
  }
  // 选中变化 → 提示条 + chips 同步（一个订阅 covers select/deselect）
  ad.onSelect(() => { updateContext(); renderChips(); });
  updateContext();

  // 快捷提示（P1-3：按选中元素类型动态切换）
  const CHIP_SETS = {
    none: [
      ['🎨 整页换配色', '给整个页面换一个更有设计感的配色'],
      ['🧱 加 3 栏功能块', '在页面末尾插入一个 3 栏功能介绍区'],
      ['🦶 加页脚', '在页面末尾插入一个简洁的页脚'],
    ],
    button: [
      ['💊 变胶囊形', '把选中的按钮改成胶囊形状'],
      ['✨ 加悬停光效', '给选中按钮加悬停光效和过渡动画'],
      ['🌈 换渐变色', '把选中按钮改成渐变背景'],
    ],
    text: [
      ['🔠 调大标题', '把选中文字调大并加粗'],
      ['📏 改行高', '把选中段落行高调到 1.8'],
      ['🌈 渐变文字', '给选中文字加渐变效果'],
    ],
    image: [
      ['🖼 加圆角阴影', '给选中图片加圆角和柔和阴影'],
      ['🔁 换占位图', '把选中图片换成占位图'],
      ['🔍 悬停缩放', '给选中图片加悬停放大效果'],
    ],
    container: [
      ['📐 加内边距', '给选中容器加内边距'],
      ['🎨 换背景色', '给选中容器换一个浅色背景'],
      ['🧊 加毛玻璃', '给选中容器加毛玻璃效果'],
    ],
  };
  function chipTypeFor(tag) {
    if (!tag) return 'none';
    if (tag === 'a' || tag === 'button') return 'button';
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'blockquote', 'li', 'em', 'strong'].includes(tag)) return 'text';
    if (tag === 'img') return 'image';
    return 'container';
  }
  function renderChips() {
    const chipBox = $('#ai-chips');
    if (!chipBox) return;
    const tag = (ad.getSelection()?.tagName || '').toLowerCase();
    const type = chipTypeFor(tag);
    const set = CHIP_SETS[type] || CHIP_SETS.none;
    chipBox.innerHTML = set
      .map(([label, prompt]) => `<button class="chip" data-prompt="${prompt.replace(/"/g, '&quot;')}">${label}</button>`)
      .join('');
    chipBox.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
      // 点击即发送（少一步）；想改措辞可直接在输入框改后再点 ➤
      input.value = c.dataset.prompt;
      send();
    }));
  }
  renderChips();

  // 消息渲染
  function addMsg(role, text) {
    const div = document.createElement('div');
    div.className = `ai-msg ${role}`;
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }
  function addActionNote(text) {
    const div = document.createElement('div');
    div.className = 'ai-action';
    div.textContent = '✓ ' + text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }
  const fmtTok = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
  function addAceChip(text) {
    const div = document.createElement('div');
    div.className = 'ace-chip';
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }
  // ACE 开关（💰）：开 = 每次模型调用前本地估算、响应后记实际用量并校准
  function aceOn() { return !!getAIConfig().aceEstimate; }
  function syncAceToggle() { $('#ai-ace').classList.toggle('on', aceOn()); }
  $('#ai-ace').addEventListener('click', () => {
    setAIConfig({ aceEstimate: !aceOn() });
    syncAceToggle();
    toast(aceOn() ? '已开启：发送前显示本地成本估算' : '已关闭成本估算');
  });

  // AI 的一次画布修改 = 撤销栈里的一个整体单元。
  // 撤销打包已随 EditorAdapter 迁移：flow=flowUndoBatch（magicFusionIndex 合并）/ canvas=snapshot

  // 构建系统提示词（无选中 = 目录拼装协议；选中 = 改样式/替换）
  function pageOutline() {
    return ad.getPageText();
  }
  function buildSystem() {
    const sel = ad.getSelection();
    if (!sel) {
      // —— 无选中：块目录拼装协议（飞轮主循环，省 token 路径）——
      return `你是 PageForge 可视化网页拼装助手，用户不懂代码。优先用「块目录」拼装，不要自己写 HTML——只有目录确实没有合适的块才自由生成。
${buildCatalogText()}

只回一个 JSON（不要 markdown、不要任何其他文字）：
1) 目录有合适块：{"action":"insert_block","block":"目录中的块名","reason":"一句话说明","slots":{"槽位名":"中文值"}}
   示例：用户"加个页脚，品牌叫 Star" → {"action":"insert_block","block":"页脚","reason":"已选页脚块","slots":{"brand":"Star"}}
   注意：三栏特性区的 items 是数组，每项用"名称：描述"格式，最多 3 项
2) 目录确实没有合适的：{"action":"insert","reason":"...","html":"完整 HTML 区块"}
   硬性规则：全部内联 style（禁止 <style>/<link>）；栅格用 grid + repeat(auto-fit,minmax(180px,1fr))；配色克制（白底#f5f5f7/深#0d0d0f/一个强调色）；圆角12-16px；中文；区块用 max-width:1100px;margin:0 auto;padding:80px 24px
3) 只是问答/建议：{"action":"answer","text":"..."}
槽位没把握就省略（块有默认文案，用户画布可改）。当前页面：${pageOutline()}`;
    }
    // —— 选中：改样式 / 整体替换（原逻辑）——
    let html = '';
    try { html = ad.getPageHTML().slice(0, 4000); } catch { html = ''; }
    let selHtml = '';
    try { selHtml = ad.getSelectionHTML().slice(0, 2000); } catch { selHtml = ''; }
    return `你是 PageForge 网页设计助手，用中文交流。用户正在用可视化编辑器"拼乐高"式地做网页（不懂代码）。
当前页面内容（body 内 HTML）：
${html || '（空页面）'}
当前选中组件（可能为空）：
${selHtml || '（未选中）'}
${sel.leafId ? `\n★ 用户当前聚焦的是上面这个组件内部的一个${sel.leafLabel || '元素'}（<${sel.tagName}>${sel.text ? '「' + sel.text + '」' : ''}）——上面给的 HTML 就只是这一个元素。用户说"改它 / 这个 / 选中的"都指它，样式只作用于它，不要动整个组件。\n` : ''}

根据用户请求，只回复一个 JSON 对象（不要任何其他文字、不要 markdown 代码块），格式：
1) 选中组件时改样式：{"action":"style","reason":"一句话说明做了什么","css":"纯 CSS 声明，如 color:#fff;padding:24px;","target":"可选：要修改的文字叶子的 data-id"}
   - target 说明：选中组件的 HTML 里每个文字元素都带 data-id 属性；用户指定改某个局部文字时填对应 data-id，只影响那个叶子；改整个组件或没把握时省略 target
2) 选中组件时整体替换：{"action":"replace","reason":"...","html":"新的完整 HTML"}
3) 插入新区块到页面末尾：{"action":"insert","reason":"...","html":"完整的 HTML 区块"}
4) 只是问答/建议：{"action":"answer","text":"文字回答"}

硬性规则：
- HTML 全部用内联 style 属性（禁止 <style>/<link>）；不用外部依赖
- 栅格用 grid + repeat(auto-fit,minmax(180px,1fr))（响应式）
- 配色克制有设计感（白底 #f5f5f7 / 深色 #0d0d0f / 强调色可自选，避免花哨）
- 文字用中文；圆角 12-16px；多列内容间距 24px
- 插入区块用 <section style="max-width:1100px;margin:0 auto;padding:80px 24px;"> 包内容`;
  }

  // 发送
  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMsg('user', text);
    // 规则层：插入类请求且命中高频块 → 零 token 直取（不进模型）
    let waiting = null;
    const rule = matchRule(text);
    if (rule) {
      try {
        ad.placeBlock(rule.def, {});
        addActionNote(`已插入「${rule.def.label}」（目录直取，未调用 AI）——点画布可直接改字`);
      } catch (e) {
        // 当前模式暂无该块的适配版本：记缺口 + 中文提示（不吞异常）
        logGap(text, rule.def.content);
        waiting = addMsg('ai', `「${rule.def.label}」在当前页面模式暂不可插入（已记入缺口，后续版本会支持）。`);
      }
      return;
    }
    waiting = addMsg('ai', '思考中…');
    const aceCtx = aceOn() ? { est: Ace.estimateCall(text, 'chat', activeAI().model, buildCatalogText()), t0: Date.now() } : null;
    if (aceCtx) {
      addAceChip(`💰 预估 ~${fmtTok(aceCtx.est.inTok + aceCtx.est.outTok)} tok · $${aceCtx.est.costUsd.toFixed(4)} · ~${aceCtx.est.timeSec}s（本地估算${aceCtx.est.priced ? '' : ' · 默认价，可导入 ACE 记忆包校准'}）`);
    }
    try {
      const key = getKey();
      if (!key) {
        waiting.textContent = '未配置 API Key。点右上角 ⚙ 选服务商并填 Key（智谱 glm-4-flash 免费，调试推荐）。';
        openKeyPrompt();
        return;
      }
      const ai = activeAI();
      const data = await chatCompletion(ai, key, [
        { role: 'system', content: buildSystem() },
        { role: 'user', content: text },
      ], 1200);
      // ACE：真实用量回写校准（usage 由 OpenAI 兼容响应自带）
      if (aceCtx) {
        const act = Ace.recordActual({ task: text, action: 'chat', model: ai.model, est: aceCtx.est, usage: data.usage, elapsedSec: (Date.now() - aceCtx.t0) / 1000 });
        if (data.usage) addAceChip(`💰 实际 ${fmtTok(data.usage.total_tokens)} tok · $${(act.actual.cost_usd || 0).toFixed(4)} · ${act.actual.time_seconds}s`);
      }
      const reply = data.choices?.[0]?.message?.content || '';
      // 解析 JSON（抢救式：剥围栏/补截断，弱模型输出不规范也能驱动协议）
      const { json, repaired } = parseAIJson(reply);
      if (!json || !json.action) {
        waiting.textContent = 'AI 回复无法解析（弱模型偶发，换个说法重试即可）。原始回复：' + reply.slice(0, 120);
        return;
      }
      if (repaired) addAceChip('⚠ 回复疑似截断，已自动补齐——请核对执行结果');
      // 执行操作（全部经 EditorAdapter，模式无关）
      try {
        if (json.action === 'style') {
          // css 原样传给适配器（字符串/对象均可）；target = 指定的文字叶子 data-id（可选）
          ad.applyStyleToSelection(json.css || '', json.target || null);
          addActionNote(json.reason || '已应用样式');
          waiting.remove();
        } else if (json.action === 'replace') {
          ad.replaceSelection(json.html);
          addActionNote(json.reason || '已替换组件');
          waiting.remove();
        } else if (json.action === 'insert_block') {
          // 块目录命中：模型只出块名+槽位（~30 tok），不写 HTML
          const key = String(json.block || '').trim();
          const def = blocks.find((b) => b.label === key || b.id === key)
            || blocks.find((b) => (b.ai?.when || []).some((w) => key.includes(w) || w.includes(key)));
          if (!def) {
            waiting.textContent = `目录里没有「${key}」这个块。换个说法，或让我自由生成。`;
            return;
          }
          try {
            ad.placeBlock(def, json.slots || {});
            addActionNote(`${json.reason || '已插入区块'}（块「${def.label}」·目录命中）`);
            waiting.remove();
          } catch (e) {
            // canvas 等模式暂无该块的适配版本：记缺口并给中文提示（不炸）
            logGap(text + '（' + def.label + '）', json.html || def.content);
            waiting.textContent = `「${def.label}」在当前页面模式暂不可插入（已记入缺口，后续版本会支持）。`;
          }
        } else if (json.action === 'insert') {
          // 目录 miss：自由生成（贵）——先记缺口日志再执行（执行被拒也要记，供结晶环提炼新块）
          logGap(text, json.html);
          try {
            ad.insertFreeHTML(json.html);
            addActionNote(`${json.reason || '已在页面末尾插入区块'}（自由生成·已记缺口日志）`);
            waiting.remove();
          } catch (e) {
            if (e.message.includes('CANVAS_FREE')) {
              waiting.textContent = '当前为自由画布页，暂不支持 AI 自由生成整块内容——可改用组件块，或回 flow 页使用。';
            } else throw e;
          }
        } else {
          waiting.textContent = json.text || json.reason || '完成。';
        }
      } catch (e) {
        waiting.textContent = '执行出错：' + e.message;
      }
    } catch (e) {
      waiting.textContent = '网络错误：' + e.message;
    }
  }
  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

  // 模型设置（小白友好弹窗，Electron 不支持 window.prompt）
  function syncProviderUI() {
    const id = document.getElementById('ai-key-provider').value;
    const prov = AI_PROVIDERS.find((p) => p.id === id) || AI_PROVIDERS[0];
    document.getElementById('ai-model-list').innerHTML = (prov.models || []).map((m) => `<option value="${m}">`).join('');
    document.getElementById('ai-key-model').placeholder = prov.model || '模型名';
    document.getElementById('ai-key-endpoint').hidden = id !== 'custom';
    document.getElementById('ai-endpoint-label').hidden = id !== 'custom';
    document.getElementById('ai-key-hint').textContent = prov.keyHint || '';
  }
  function openKeyPrompt() {
    const cfg = getAIConfig();
    const sel = document.getElementById('ai-key-provider');
    if (!sel.options.length) {
      AI_PROVIDERS.forEach((p) => {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.name;
        sel.appendChild(o);
      });
    }
    sel.value = cfg.provider || 'deepseek';
    syncProviderUI();
    const prov = AI_PROVIDERS.find((p) => p.id === (cfg.provider || 'deepseek'));
    document.getElementById('ai-key-model').value = cfg.model || prov?.model || '';
    document.getElementById('ai-key-input').value = cfg.apiKey || localStorage.getItem(STORAGE_KEYS.AI_KEY_LEGACY) || '';
    document.getElementById('ai-key-endpoint').value = cfg.endpoint || '';
    refreshAceStatus();
    document.getElementById('modal-ai-key').hidden = false;
    setTimeout(() => document.getElementById('ai-key-input').focus(), 60);
  }
  document.getElementById('ai-key-provider').addEventListener('change', () => {
    syncProviderUI();
    // 切服务商时模型跟随预设默认（用户可改）
    const prov = AI_PROVIDERS.find((p) => p.id === document.getElementById('ai-key-provider').value);
    document.getElementById('ai-key-model').value = prov?.model || '';
  });
  document.getElementById('ai-key-save').addEventListener('click', () => {
    const provider = document.getElementById('ai-key-provider').value;
    const prov = AI_PROVIDERS.find((p) => p.id === provider);
    const model = document.getElementById('ai-key-model').value.trim() || prov?.model || '';
    const apiKey = document.getElementById('ai-key-input').value.trim();
    const endpoint = document.getElementById('ai-key-endpoint').value.trim();
    setAIConfig({ provider, model, apiKey, endpoint });
    toast(`已保存：${prov?.name || provider} · ${model}`);
    document.getElementById('modal-ai-key').hidden = true;
  });
  document.getElementById('ai-key-cancel').addEventListener('click', () => {
    document.getElementById('modal-ai-key').hidden = true;
  });
  $('#ai-key').addEventListener('click', openKeyPrompt);

  // ACE 校准区（设置弹窗内）：记忆包与 AgentCostEstimator 互通
  function refreshAceStatus() {
    const s = Ace.state();
    $('#ace-status').textContent = `价格表 ${s.models} 个模型 · 校准历史 ${s.history} 条 · 与 AgentCostEstimator 记忆包互通`;
  }
  $('#ace-import-btn').addEventListener('click', () => document.getElementById('ace-import-file').click());
  document.getElementById('ace-import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const r = Ace.importBundle(reader.result);
        toast(`已导入：${r.prices} 个模型价格 · 追加 ${r.appended} 条历史`);
        refreshAceStatus();
      } catch (err) { toast('导入失败：' + err.message, true); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
  $('#ace-export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(Ace.exportBundle(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pageforge_ace_memory_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  syncAceToggle();
  refreshAceStatus();

  // ============ AI 层 A1/A2/A3：公共 AI 请求 ============
  async function aiRequest(system, user, maxTokens = 1600, action = 'diag') {
    const key = getKey();
    if (!key) {
      openKeyPrompt();
      throw new Error('NO_KEY');
    }
    const ai = activeAI();
    const aceCtx = aceOn() ? { est: Ace.estimateCall(user, action, ai.model, system), t0: Date.now() } : null;
    const data = await chatCompletion(ai, key, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], maxTokens);
    if (aceCtx) Ace.recordActual({ task: user, action, model: ai.model, est: aceCtx.est, usage: data.usage, elapsedSec: (Date.now() - aceCtx.t0) / 1000 });
    const reply = data.choices?.[0]?.message?.content || '';
    const { json: parsed, repaired } = parseAIJson(reply);
    if (!parsed) {
      // 常见原因：max_tokens 截断（回复在 JSON 中途断掉）或弱模型围栏未闭合
      throw new Error('AI 回复无法解析（若内容较长可能是输出被截断，请重试或精简描述）：' + reply.slice(0, 150));
    }
    if (repaired) log.warn('aiRequest 回复截断已补齐，结果需人工核对', action);
    return parsed;
  }

  // ============ A1 智能配色 ============
  const colorModal = $('#modal-ai-color');
  let lastPalette = null;
  $('#ai-tool-color').addEventListener('click', () => {
    $('#ai-color-result').innerHTML = '';
    $('#ai-color-apply').disabled = true;
    colorModal.hidden = false;
    setTimeout(() => $('#ai-color-input').focus(), 60);
  });
  $('#ai-color-cancel').addEventListener('click', () => { colorModal.hidden = true; });
  $('#ai-color-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); generatePalette(); }
  });
  $('#ai-color-input').addEventListener('input', () => {
    // 输入变化后旧方案作废
    lastPalette = null;
    $('#ai-color-apply').disabled = true;
  });
  async function generatePalette() {
    const prompt = $('#ai-color-input').value.trim();
    if (!prompt) { toast('请先输入配色风格描述'); return; }
    const box = $('#ai-color-result');
    box.innerHTML = '<div class="ai-loading">正在生成配色方案…</div>';
    try {
      const json = await aiRequest(
        '你是资深 UI 配色设计师。根据用户描述生成一套网页配色方案，只回复一个 JSON 对象：\n{"name":"方案名","palette":{"primary":"主色 hex","secondary":"辅色 hex","accent":"强调色 hex（按钮/链接用）","bg":"页面背景 hex（浅色）","text":"正文文字 hex（深色）"},"advice":"一两句应用建议"}\n颜色要和谐有设计感，全部 hex 小写。不要其他文字。',
        prompt, 1600, 'color'
      );
      if (!json.palette) throw new Error('回复缺少 palette');
      lastPalette = json;
      const p = json.palette;
      box.innerHTML = `
        <div class="ai-palette-name">「${json.name || '自定义配色'}」${json.advice ? '<div class="ai-palette-advice">' + json.advice + '</div>' : ''}</div>
        <div class="ai-palette">
          ${Object.entries(p).map(([k, v]) => `<div class="ai-swatch" title="${k}: ${v}" style="background:${v}"><span>${k}<br>${v}</span></div>`).join('')}
        </div>`;
      $('#ai-color-apply').disabled = false;
    } catch (e) {
      box.innerHTML = '<div class="ai-error">' + (e.message === 'NO_KEY' ? '未配置 API Key，请先设置。' : e.message) + '</div>';
    }
  }
  function applyPaletteToPage() {
    if (!lastPalette || !lastPalette.palette) return;
    // canvas 页：整个"调色板 → 全页元素"由适配器实现——v1 那段硬写 GrapesJS 的 CssComposer，
    // canvas 页根本没有 CssComposer，不能照搬
    if (ad.mode === 'canvas' && typeof ad.applyPalette === 'function') {
      try {
        const st = ad.applyPalette(lastPalette.palette);
        const name = lastPalette.name || '自定义配色';
        if (st.errs && st.errs.length) {
          toast(`配色已部分应用（更新 ${st.total} 处），有 ${st.errs.length} 段失败——详见控制台`, 'error');
          log.warn('配色部分失败', st.errs);
        } else {
          const parts = [`标题 ${st.titles}`, `正文 ${st.texts}`, `按钮 ${st.buttons}`];
          if (st.stage) parts.push('画布背景');
          toast(`已应用配色「${name}」（${parts.join(' · ')}）`);
        }
      } catch (e) {
        toast('配色未能应用：' + e.message, 'error');
        log.error('配色应用失败', e);
      }
      colorModal.hidden = true;
      return;
    }
    const p = lastPalette.palette;
    // 审计 L2：三段应用分别计数，部分失败如实告知（不再一律报"已应用"）
    const stat = { rules: 0, body: false, errs: [] };
    flowUndoBatch(editor, () => {
      // 组件样式在 CssComposer 规则（avoidInlineStyle），走 iframe 渲染层 + 规则修改（fixContrast 同款）
      try {
        const doc = editor.Canvas.getFrameEl().contentDocument;
        if (doc) {
          doc.querySelectorAll('h1,h2,h3,h4,a,button').forEach((el) => {
            const id = el.id;
            if (!id) return;
            const rule = editor.CssComposer.getAll().find((r) => (r.getSelectors && r.getSelectors().getFullString()) === '#' + id);
            if (!rule) return;
            const tag = el.tagName.toLowerCase();
            const s2 = { ...rule.get('style') };
            if (['h1', 'h2', 'h3', 'h4'].includes(tag)) s2.color = p.text;
            else if (tag === 'a' || tag === 'button') { s2.background = p.accent; s2.color = '#ffffff'; }
            rule.set('style', s2);
            stat.rules++;
          });
        }
      } catch (err) { stat.errs.push('标题/链接规则: ' + (err.message || err)); log.warn('配色应用-规则段失败', err); }
      // body 背景/文字：改 wrapper（body 组件）样式
      try {
        const ws = { ...(editor.getWrapper().getStyle() || {}) };
        ws.background = p.bg;
        ws.color = p.text;
        editor.getWrapper().setStyle(ws);
        stat.body = true;
      } catch (err) { stat.errs.push('body 样式: ' + (err.message || err)); log.warn('配色应用-body 段失败', err); }
      // 兜底：找不到 body 规则时加规则
      try {
        const rules = editor.CssComposer.getAll();
        const hasBody = rules.some((r) => {
          const sel = (r.getSelectors && r.getSelectors().getFullString()) || '';
          return sel === 'body' || sel === 'html body';
        });
        if (!hasBody) editor.CssComposer.addRules(`body{background:${p.bg};color:${p.text};}`);
      } catch (err) { stat.errs.push('body 兜底规则: ' + (err.message || err)); }
    });
    if (stat.rules === 0 && !stat.body) {
      toast('配色未能应用（页面无可着色元素或应用出错）', 'error');
      log.error('配色应用完全失败', stat.errs);
    } else if (stat.errs.length) {
      toast(`配色已部分应用（更新 ${stat.rules} 处规则），有 ${stat.errs.length} 段失败——详见控制台`, 'error');
      log.warn('配色部分失败', stat.errs);
    } else {
      toast(`已应用配色「${lastPalette.name || '自定义配色'}」（更新 ${stat.rules} 处规则）`);
    }
    colorModal.hidden = true;
  }
  $('#ai-color-apply').addEventListener('click', applyPaletteToPage);

  // ============ A2 设计诊断 ============
  const diagModal = $('#modal-ai-diag');
  let lastDiagItems = [];
  $('#ai-tool-diag').addEventListener('click', () => {
    $('#ai-diag-result').innerHTML = '';
    $('#ai-diag-loading').hidden = false;
    $('#ai-diag-apply-all').disabled = true;
    diagModal.hidden = false;
    runDiagnose();
  });
  $('#ai-diag-cancel').addEventListener('click', () => { diagModal.hidden = true; });
  // 诊断上下文与建议应用都经 adapter（AI 层零耦合）：
  //   flow   → 页面 HTML + CSS 规则，建议用 CSS 选择器
  //   canvas → 元素清单 + 关键样式，建议用 elementId（画布页没有 CSS 规则表）
  const isCanvasDiag = () => ad.mode === 'canvas' && typeof ad.getDiagContext === 'function';
  const DIAG_PROMPT_FLOW = '你是资深网页设计师，做设计诊断。分析用户页面的排版/间距/配色/可读性问题，只回复一个 JSON 对象：\n{"items":[{"title":"建议标题（短）","reason":"为什么/问题描述（一句话）","selector":"CSS 选择器（用标签名如 h1、p、section 或现有类名）","css":"修复用的纯 CSS 声明，如 padding:24px 0;line-height:1.8;color:#334155;"}]}\n3-5 条建议；css 只含声明（不含选择器）；只建议修改样式，不增删内容。';
  const DIAG_PROMPT_CANVAS = '你是资深网页设计师，做设计诊断。这是一个"自由画布页"——元素用绝对定位摆放，没有 CSS 规则表，样式写在元素自己的容器样式和文字叶子的覆盖表里。\n只回复一个 JSON 对象：\n{"items":[{"title":"建议标题（短）","reason":"为什么/问题描述（一句话）","elementId":"要修改的元素 id（必须是清单里出现过的 id=xxx）","leafId":"可选：要改的文字叶子 data-id（清单 覆盖[] 里的键名）；留空表示改整个容器","css":"修复用的纯 CSS 声明，如 padding:40px;line-height:1.8;color:#334155;"}]}\n3-5 条建议；elementId 必须来自清单；css 只含声明；只建议修改样式，不增删内容。';

  async function runDiagnose() {
    const useCanvas = isCanvasDiag();
    let prompt = DIAG_PROMPT_FLOW;
    let payload = '';
    if (useCanvas) {
      prompt = DIAG_PROMPT_CANVAS;
      try { payload = ad.getDiagContext().text; } catch { payload = '（读取画布信息失败）'; }
    } else {
      let html = '';
      try { html = editor.getHtml().replace(/<body[^>]*>|<\/body>/g, '').slice(0, 6000); } catch { html = ''; }
      let css = '';
      try { css = editor.getCss().slice(0, 3000); } catch { css = ''; }
      payload = '当前页面 HTML：\n' + (html || '（空）') + '\n\n当前 CSS：\n' + (css || '（无）');
    }
    try {
      const json = await aiRequest(prompt, payload, 1600, 'diag');
      lastDiagItems = Array.isArray(json.items) ? json.items : [];
      if (!lastDiagItems.length) throw new Error('回复缺少建议');
      $('#ai-diag-result').innerHTML = lastDiagItems.map((it, i) => `
        <div class="ai-diag-item">
          <div class="ai-diag-title">${i + 1}. ${escHtml(it.title)}</div>
          <div class="ai-diag-reason">${escHtml(it.reason || '')}</div>
          <code>${escHtml(useCanvas ? (it.elementId || '?') : (it.selector || 'body'))} { ${escHtml(it.css || '')} }</code>
        </div>`).join('');
      $('#ai-diag-apply-all').disabled = false;
    } catch (e) {
      $('#ai-diag-result').innerHTML = '<div class="ai-error">' + (e.message === 'NO_KEY' ? '未配置 API Key，请先设置。' : e.message) + '</div>';
    }
    $('#ai-diag-loading').hidden = true;
  }
  function applyDiagItems() {
    // canvas：交给适配器按 elementId 写回元素（诚实计数，跳过的不虚报）
    if (isCanvasDiag() && typeof ad.applyDiagItems === 'function') {
      const res = ad.applyDiagItems(lastDiagItems);
      toast(`已应用 ${res.applied} 条建议${res.skipped ? `（${res.skipped} 条无法定位已跳过）` : ''} — 撤销可恢复`);
      diagModal.hidden = true;
      return;
    }
    let applied = 0;
    flowUndoBatch(editor, () => {
      lastDiagItems.forEach((it) => {
        if (!it.css || !it.selector) return;
        try {
          editor.CssComposer.addRules(`${it.selector}{${it.css}}`);
          applied++;
        } catch { /* 单条失败忽略 */ }
      });
    });
    toast(`已应用 ${applied} 条建议（撤销可恢复）`);
    diagModal.hidden = true;
  }
  $('#ai-diag-apply-all').addEventListener('click', applyDiagItems);

  // ============ A3 生成初稿 ============
  const genModal = $('#modal-ai-gen');
  let lastDraft = null;
  // 三态状态机：input=等待描述（生成钮亮/替换钮灰）→ busy=生成中 → ready=有初稿（替换钮变主按钮）
  function setGenState(state) {
    const doBtn = $('#ai-gen-do'), applyBtn = $('#ai-gen-apply');
    const hasResult = state === 'ready';
    doBtn.disabled = state === 'busy';
    doBtn.textContent = state === 'busy' ? '生成中…' : (hasResult ? '重新生成' : '生成初稿');
    doBtn.className = 'btn ' + (hasResult ? 'ghost' : 'primary');
    applyBtn.disabled = !hasResult;
    applyBtn.className = 'btn ' + (hasResult ? 'primary' : 'ghost');
    applyBtn.title = hasResult ? '用初稿替换当前页面（Ctrl+Z 可撤销）' : '先点「生成初稿」，满意后再替换';
  }
  $('#ai-tool-gen').addEventListener('click', () => {
    $('#ai-gen-result').innerHTML = '';
    setGenState('input');
    genModal.hidden = false;
    setTimeout(() => $('#ai-gen-input').focus(), 60);
  });
  $('#ai-gen-do').addEventListener('click', generateDraft);
  $('#ai-gen-cancel').addEventListener('click', () => { genModal.hidden = true; });
  $('#ai-gen-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generateDraft(); }
  });
  async function generateDraft() {
    const prompt = $('#ai-gen-input').value.trim();
    if (!prompt) { toast('请先描述你想做的网站'); return; }
    setGenState('busy');
    $('#ai-gen-loading').hidden = false;
    $('#ai-gen-result').innerHTML = '';
    try {
      const json = await aiRequest(
        '你是资深网页设计师。根据用户描述生成一个完整的单页网站初稿，只回复一个 JSON 对象：\n{"title":"页面标题","html":"<body> 内的完整 HTML（导航栏+主视觉+内容区+页脚）"}\n硬性规则：全部内联 style；中文；响应式（grid auto-fit minmax(180px,1fr)）；配色克制有设计感（白底 #f5f5f7 / 深色 #0d0d0f / 一个强调色）；圆角 12-16px；导航 4-5 个链接；段落行高 1.7；区块 section 用 max-width:1100px;margin:0 auto;padding:80px 24px；不要 <style> 标签。',
        prompt, 4000, 'gen'
      );
      if (!json.html) throw new Error('回复缺少 html');
      lastDraft = json;
      const plain = json.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
      $('#ai-gen-result').innerHTML = `
        <div class="ai-draft-title">已生成：「${json.title || '未命名页面'}」</div>
        <div class="ai-draft-preview">${plain}…</div>`;
      setGenState('ready');
    } catch (e) {
      $('#ai-gen-result').innerHTML = '<div class="ai-error">' + (e.message === 'NO_KEY' ? '未配置 API Key，请先设置。' : e.message) + '</div>';
      setGenState('input');
    }
    $('#ai-gen-loading').hidden = true;
  }
  function applyDraft() {
    if (!lastDraft || !lastDraft.html) return;
    ad.replacePage(lastDraft.html);
    toast('已生成初稿（Ctrl+Z 可撤销）');
    genModal.hidden = true;
  }
  $('#ai-gen-apply').addEventListener('click', applyDraft);

  // 能力门控：canvas 等不支持的工具按 adapter.capabilities 显隐
  for (const [id, cap] of [['#ai-tool-color', 'color'], ['#ai-tool-diag', 'diag'], ['#ai-tool-gen', 'gen']]) {
    if (!ad.capabilities?.[cap]) { const b = $(id); if (b) b.style.display = 'none'; }
  }

  // 供回归脚本 / 控制台调用（块协议层 + 模型适配 + ACE 桥测试接口）
  Object.assign(window.__pageforge || (window.__pageforge = {}), {
    matchRule, buildBlockHTML, getGapLog, buildCatalogText,
    AI_PROVIDERS, getAIConfig, setAIConfig, activeAI,
    ace: Ace,
    adapter: ad,
  });
}
