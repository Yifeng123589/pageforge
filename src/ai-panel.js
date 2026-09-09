// PageForge AI 助手（VS Code 式：侧边栏聊天 + 上下文感知 + 执行操作）
// 依赖 DeepSeek API（OpenAI 兼容），CORS 已确认允许 file://
//
// ============ 块协议层（飞轮主循环）============
// 优先级：规则层零 token 直取 → 模型按块目录 insert_block（~30 tok）→ 目录 miss 才裸 HTML（记缺口日志）
import { blocks } from './blocks.js';

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

const AI_CFG_KEY = 'pageforge-ai-config-v1';
export function getAIConfig() {
  try { return JSON.parse(localStorage.getItem(AI_CFG_KEY) || '{}'); } catch { return {}; }
}
export function setAIConfig(patch) {
  const next = { ...getAIConfig(), ...patch };
  localStorage.setItem(AI_CFG_KEY, JSON.stringify(next));
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
    key: cfg.apiKey || localStorage.getItem('pageforge-ai-key') || AI_KEY_DEFAULT,
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

// ---------- 填槽：data-pf-slot 标记 → 模型给的值（缺省保留块默认文案）----------
export function buildBlockHTML(def, slots = {}) {
  let html = def.content;
  const ai = def.ai;
  if (ai?.slots) {
    const doc = new DOMParser().parseFromString(`<div id="__pf_root">${html}</div>`, 'text/html');
    const root = doc.getElementById('__pf_root');
    root.querySelectorAll('[data-pf-slot]').forEach((el) => {
      const key = el.getAttribute('data-pf-slot');
      const sch = ai.slots[key];
      const v = slots?.[key];
      if (sch && typeof v === 'string' && v.trim()) el.textContent = v.trim().slice(0, sch.max || 60);
      el.removeAttribute('data-pf-slot');
    });
    // items 槽：容器 data-pf-items，子项按顺序填"名称：描述"
    const itemsEl = root.querySelector('[data-pf-items]');
    if (itemsEl && ai.slots.items) {
      const arr = Array.isArray(slots.items) ? slots.items : [];
      [...itemsEl.children].forEach((col, i) => {
        const raw = typeof arr[i] === 'string' ? arr[i].trim() : '';
        if (!raw) return;
        const seg = raw.split(/[：:]/);
        const h3 = col.querySelector('h3');
        const p = col.querySelector('p');
        if (seg.length >= 2) {
          if (h3) h3.textContent = seg[0].trim().slice(0, 12);
          if (p) p.textContent = seg.slice(1).join('：').trim().slice(0, 50);
        } else if (h3) h3.textContent = raw.slice(0, 12);
      });
      itemsEl.removeAttribute('data-pf-items');
    }
    html = root.innerHTML;
  }
  return html;
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
const GAP_KEY = 'pageforge-gap-log-v1';
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

export function initAIPanel({ editor, toast }) {
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

  // 上下文：选中组件变化 → 更新提示条
  function updateContext() {
    const sel = editor.getSelected();
    if (sel) {
      const tag = sel.get('tagName') || 'div';
      const text = (sel.get('content') || sel.get('components')?.toHTML?.() || '').replace(/<[^>]+>/g, '').trim().slice(0, 20);
      ctxBar.innerHTML = `已选中：<b>&lt;${tag.toLowerCase()}&gt;</b> ${text ? '「' + text + '」' : ''}<span class="ctx-hint">（作用于选中组件）</span>`;
    } else {
      ctxBar.innerHTML = `未选中组件 <span class="ctx-hint">（AI 将作用于整个页面 / 解答问题）</span>`;
    }
  }
  editor.on('component:selected', updateContext);
  editor.on('component:deselected', updateContext);
  updateContext();
  // P1-3：选中变化时 chips 同步切换
  function updateContextAndChips() { updateContext(); renderChips(); }
  editor.on('component:selected', updateContextAndChips);
  editor.on('component:deselected', updateContextAndChips);

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
    const sel = editor.getSelected();
    const tag = sel ? (sel.get('tagName') || '').toLowerCase() : '';
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

  // AI 的一次画布修改 = 撤销栈里的一个整体单元。
  // GrapesJS 异步解析会把一次操作拆成多条撤销动作；等入栈稳定后，
  // 把这批新动作的 magicFusionIndex 改写成同一值，一次 undo/redo 即整体生效
  let aiOpSeq = 0;
  function asOneUndoStep(mutate) {
    const um = editor.UndoManager;
    const stack = um.getStack();
    const from = stack.length;
    mutate();
    let lastLen = -1, tries = 0;
    const merge = () => {
      if (stack.length !== lastLen && tries++ < 10) { lastLen = stack.length; setTimeout(merge, 60); return; }
      const group = 'ai-' + (++aiOpSeq);
      for (let i = from; i < stack.length; i++) stack.at(i)?.set('magicFusionIndex', group);
    };
    setTimeout(merge, 60);
  }

  // 构建系统提示词（无选中 = 目录拼装协议；选中 = 改样式/替换）
  function pageOutline() {
    try {
      const n = editor.getComponents().length;
      const text = editor.getHtml().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      return `${n} 个顶层块。文字摘要：${text || '（空页）'}`;
    } catch { return '（空页）'; }
  }
  function buildSystem() {
    const sel = editor.getSelected();
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
    try { html = editor.getHtml().replace(/<body[^>]*>|<\/body>/g, '').slice(0, 4000); } catch { html = ''; }
    let selHtml = '';
    try { selHtml = sel.toHTML().slice(0, 2000); } catch { selHtml = ''; }
    return `你是 PageForge 网页设计助手，用中文交流。用户正在用可视化编辑器"拼乐高"式地做网页（不懂代码）。
当前页面内容（body 内 HTML）：
${html || '（空页面）'}
当前选中组件（可能为空）：
${selHtml || '（未选中）'}

根据用户请求，只回复一个 JSON 对象（不要任何其他文字、不要 markdown 代码块），格式：
1) 选中组件时改样式：{"action":"style","reason":"一句话说明做了什么","css":"纯 CSS 声明，如 color:#fff;padding:24px;"}
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
    const rule = matchRule(text);
    if (rule) {
      asOneUndoStep(() => editor.addComponents(buildBlockHTML(rule.def, {})));
      addActionNote(`已插入「${rule.def.label}」（目录直取，未调用 AI）——点画布可直接改字`);
      return;
    }
    const waiting = addMsg('ai', '思考中…');
    try {
      const key = getKey();
      if (!key) {
        waiting.textContent = '未配置 API Key。点右上角 ⚙ 选服务商并填 Key（智谱 glm-4-flash 免费，调试推荐）。';
        openKeyPrompt();
        return;
      }
      const ai = activeAI();
      const res = await fetch(ai.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
          model: ai.model,
          messages: [
            { role: 'system', content: buildSystem() },
            { role: 'user', content: text },
          ],
          max_tokens: 1200,
          temperature: 0.6,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        waiting.textContent = '请求失败（' + res.status + '）：' + (errText.slice(0, 200) || '请检查网络/Key');
        return;
      }
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || '';
      // 解析 JSON（容错：剥离 ```json 代码块）
      let json = null;
      const m = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
      const candidate = m ? m[1] : reply;
      try { json = JSON.parse(candidate.trim()); } catch { json = null; }
      if (!json || !json.action) {
        waiting.textContent = reply || '（AI 无回复）';
        return;
      }
      // 执行操作
      try {
        if (json.action === 'style') {
          const sel = editor.getSelected();
          if (!sel) { waiting.textContent = '请先选中一个组件，再让我改样式。'; return; }
          asOneUndoStep(() => sel.setStyle(parseCss(json.css || '')));
          addActionNote(json.reason || '已应用样式');
          waiting.remove();
        } else if (json.action === 'replace') {
          const sel = editor.getSelected();
          if (!sel) { waiting.textContent = '请先选中一个组件，再让我替换。'; return; }
          asOneUndoStep(() => sel.replaceWith(json.html));
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
          asOneUndoStep(() => editor.addComponents(buildBlockHTML(def, json.slots || {})));
          addActionNote(`${json.reason || '已插入区块'}（块「${def.label}」·目录命中）`);
          waiting.remove();
        } else if (json.action === 'insert') {
          // 目录 miss：自由生成（贵）——记入缺口日志，供结晶环提炼新块
          asOneUndoStep(() => editor.addComponents(json.html));
          logGap(text, json.html);
          addActionNote(`${json.reason || '已在页面末尾插入区块'}（自由生成·已记缺口日志）`);
          waiting.remove();
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

  // CSS 字符串 → 对象（容错）
  function parseCss(str) {
    const obj = {};
    str.split(';').forEach(part => {
      const i = part.indexOf(':');
      if (i > 0) {
        const k = part.slice(0, i).trim();
        const v = part.slice(i + 1).trim();
        if (k && v) obj[k] = v;
      }
    });
    return obj;
  }

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
    document.getElementById('ai-key-input').value = cfg.apiKey || localStorage.getItem('pageforge-ai-key') || '';
    document.getElementById('ai-key-endpoint').value = cfg.endpoint || '';
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

  // ============ AI 层 A1/A2/A3：公共 AI 请求 ============
  async function aiRequest(system, user, maxTokens = 1600) {
    const key = getKey();
    if (!key) {
      openKeyPrompt();
      throw new Error('NO_KEY');
    }
    const ai = activeAI();
    const res = await fetch(ai.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: ai.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.6,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error('请求失败（' + res.status + '）：' + (errText.slice(0, 200) || '请检查网络/Key'));
    }
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || '';
    const m = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = m ? m[1] : reply;
    try {
      return JSON.parse(candidate.trim());
    } catch {
      throw new Error('AI 回复无法解析：' + reply.slice(0, 150));
    }
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
        prompt
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
    const p = lastPalette.palette;
    asOneUndoStep(() => {
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
            const s = { ...rule.get('style') };
            if (['h1', 'h2', 'h3', 'h4'].includes(tag)) s.color = p.text;
            else if (tag === 'a' || tag === 'button') { s.background = p.accent; s.color = '#ffffff'; }
            rule.set('style', s);
          });
        }
      } catch { /* 忽略 */ }
      // body 背景/文字：改 wrapper（body 组件）样式
      try {
        const ws = { ...(editor.getWrapper().getStyle() || {}) };
        ws.background = p.bg;
        ws.color = p.text;
        editor.getWrapper().setStyle(ws);
      } catch { /* 忽略 */ }
      // 兜底：找不到 body 规则时加规则
      try {
        const rules = editor.CssComposer.getAll();
        const hasBody = rules.some((r) => {
          const sel = (r.getSelectors && r.getSelectors().getFullString()) || '';
          return sel === 'body' || sel === 'html body';
        });
        if (!hasBody) editor.CssComposer.addRules(`body{background:${p.bg};color:${p.text};}`);
      } catch { /* 忽略 */ }
    });
    toast(`已应用配色「${lastPalette.name || '自定义配色'}」`);
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
  async function runDiagnose() {
    let html = '';
    try { html = editor.getHtml().replace(/<body[^>]*>|<\/body>/g, '').slice(0, 6000); } catch { html = ''; }
    let css = '';
    try { css = editor.getCss().slice(0, 3000); } catch { css = ''; }
    try {
      const json = await aiRequest(
        '你是资深网页设计师，做设计诊断。分析用户页面的排版/间距/配色/可读性问题，只回复一个 JSON 对象：\n{"items":[{"title":"建议标题（短）","reason":"为什么/问题描述（一句话）","selector":"CSS 选择器（用标签名如 h1、p、section 或现有类名）","css":"修复用的纯 CSS 声明，如 padding:24px 0;line-height:1.8;color:#334155;"}]}\n3-5 条建议；css 只含声明（不含选择器）；只建议修改样式，不增删内容。',
        '当前页面 HTML：\n' + (html || '（空）') + '\n\n当前 CSS：\n' + (css || '（无）')
      );
      lastDiagItems = Array.isArray(json.items) ? json.items : [];
      if (!lastDiagItems.length) throw new Error('回复缺少建议');
      $('#ai-diag-result').innerHTML = lastDiagItems.map((it, i) => `
        <div class="ai-diag-item">
          <div class="ai-diag-title">${i + 1}. ${it.title}</div>
          <div class="ai-diag-reason">${it.reason || ''}</div>
          <code>${it.selector || 'body'} { ${it.css || ''} }</code>
        </div>`).join('');
      $('#ai-diag-apply-all').disabled = false;
    } catch (e) {
      $('#ai-diag-result').innerHTML = '<div class="ai-error">' + (e.message === 'NO_KEY' ? '未配置 API Key，请先设置。' : e.message) + '</div>';
    }
    $('#ai-diag-loading').hidden = true;
  }
  function applyDiagItems() {
    let applied = 0;
    asOneUndoStep(() => {
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
  $('#ai-tool-gen').addEventListener('click', () => {
    $('#ai-gen-result').innerHTML = '';
    $('#ai-gen-apply').disabled = true;
    genModal.hidden = false;
    setTimeout(() => $('#ai-gen-input').focus(), 60);
  });
  $('#ai-gen-cancel').addEventListener('click', () => { genModal.hidden = true; });
  $('#ai-gen-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generateDraft(); }
  });
  async function generateDraft() {
    const prompt = $('#ai-gen-input').value.trim();
    if (!prompt) { toast('请先描述你想做的网站'); return; }
    $('#ai-gen-loading').hidden = false;
    $('#ai-gen-result').innerHTML = '';
    try {
      const json = await aiRequest(
        '你是资深网页设计师。根据用户描述生成一个完整的单页网站初稿，只回复一个 JSON 对象：\n{"title":"页面标题","html":"<body> 内的完整 HTML（导航栏+主视觉+内容区+页脚）"}\n硬性规则：全部内联 style；中文；响应式（grid auto-fit minmax(180px,1fr)）；配色克制有设计感（白底 #f5f5f7 / 深色 #0d0d0f / 一个强调色）；圆角 12-16px；导航 4-5 个链接；段落行高 1.7；区块 section 用 max-width:1100px;margin:0 auto;padding:80px 24px；不要 <style> 标签。',
        prompt
      );
      if (!json.html) throw new Error('回复缺少 html');
      lastDraft = json;
      const plain = json.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
      $('#ai-gen-result').innerHTML = `
        <div class="ai-draft-title">已生成：「${json.title || '未命名页面'}」</div>
        <div class="ai-draft-preview">${plain}…</div>`;
      $('#ai-gen-apply').disabled = false;
    } catch (e) {
      $('#ai-gen-result').innerHTML = '<div class="ai-error">' + (e.message === 'NO_KEY' ? '未配置 API Key，请先设置。' : e.message) + '</div>';
    }
    $('#ai-gen-loading').hidden = true;
  }
  function applyDraft() {
    if (!lastDraft || !lastDraft.html) return;
    asOneUndoStep(() => {
      editor.getWrapper().components().reset();
      editor.setComponents(lastDraft.html);
    });
    toast('已生成初稿（Ctrl+Z 可撤销）');
    genModal.hidden = true;
  }
  $('#ai-gen-apply').addEventListener('click', applyDraft);

  // 供回归脚本 / 控制台调用（块协议层 + 模型适配测试接口）
  Object.assign(window.__pageforge || (window.__pageforge = {}), {
    matchRule, buildBlockHTML, getGapLog, buildCatalogText,
    AI_PROVIDERS, getAIConfig, setAIConfig, activeAI,
  });
}
