// PageForge × ACE 桥：AI 调用的本地成本估算（零 AI 调用、零依赖）
// 记忆包（价格表 + 校准系数 + 历史）与 AgentCostEstimator 双向兼容：
//   ACE 导出的 bundle 可在此导入获得个性化校准；此处的真实用量也可导出为 ACE 可读 bundle 喂给校准。
// 估算为单轮 chat 版（ACE 完整版面向多轮 agent 任务，数学在此适配；校准算法与 ACE 同法：近 N 次实际/估算合计比）。

const ACE_KEY = 'pageforge-ace-memory-v1';
const CAL_WINDOW = 10, CAL_MIN = 2, MAX_HISTORY = 1000;

// 内置默认价格（$/1M tokens，约值；导入 ACE 记忆包后以你的价格表为准）
const BUILTIN_PRICES = {
  'deepseek-chat': { input: 0.27, output: 1.1 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  'glm-4-flash-250414': { input: 0, output: 0 },
  'glm-4-air': { input: 0.14, output: 1.14 },
  'moonshot-v1-8k': { input: 1.9, output: 2.5 },
  'qwen-turbo': { input: 0.05, output: 0.2 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};
const FALLBACK_PRICE = { input: 0.3, output: 1.2 };

// 动作画像：复杂度分档 + 预期输出 token（校准系数会随真实用量自动修正）
const ACTION_PROFILE = {
  chat: { complexity: 'medium', out: 350 },
  style: { complexity: 'simple', out: 60 },
  replace: { complexity: 'medium', out: 400 },
  insert_block: { complexity: 'simple', out: 80 },
  gen: { complexity: 'complex', out: 1500 },
  diag: { complexity: 'complex', out: 500 },
  color: { complexity: 'simple', out: 150 },
};

function defaultState() {
  const prices = {};
  for (const k in BUILTIN_PRICES) {
    const p = BUILTIN_PRICES[k];
    prices[k] = { input: p.input, output: p.output, cache_write: +(p.input * 1.25).toFixed(4), cache_read: +(p.input * 0.1).toFixed(4) };
  }
  return {
    version: 1,
    model_prices: prices,
    calibration: {
      simple: { token_multiplier: 1, time_multiplier: 1 },
      medium: { token_multiplier: 1, time_multiplier: 1 },
      complex: { token_multiplier: 1, time_multiplier: 1 },
    },
    history: [],
  };
}
function loadState() {
  try {
    const raw = localStorage.getItem(ACE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    const d = defaultState();
    s.model_prices = Object.assign(d.model_prices, s.model_prices || {});
    s.calibration = Object.assign(d.calibration, s.calibration || {});
    s.history = Array.isArray(s.history) ? s.history : [];
    return s;
  } catch { return defaultState(); }
}
function saveState(state) {
  const history = state.history.length > MAX_HISTORY ? state.history.slice(-MAX_HISTORY) : state.history;
  try { localStorage.setItem(ACE_KEY, JSON.stringify({ ...state, history })); } catch { /* 存储满忽略 */ }
}

// 字符 → token 启发式：中文 ≈0.6/字，其他 ≈/3.8（校准系数会修正偏差）
export function tokensOf(text) {
  const s = String(text || '');
  if (!s) return 0;
  const cjk = (s.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || []).length;
  return Math.max(1, Math.round(cjk * 0.6 + (s.length - cjk) / 3.8));
}
function priceFor(model) {
  const st = loadState();
  if (st.model_prices[model]) return { p: st.model_prices[model], exact: true };
  const prefix = Object.keys(st.model_prices).find((k) => model && (model.startsWith(k) || k.startsWith(model)));
  if (prefix) return { p: st.model_prices[prefix], exact: true };
  return { p: FALLBACK_PRICE, exact: false };
}
function costOf(inTok, outTok, p) {
  return +(inTok / 1e6 * p.input + outTok / 1e6 * p.output).toFixed(6);
}

// 发送前估算：单轮调用版
export function estimateCall(userText, action = 'chat', model = '', systemChars = 0) {
  const prof = ACTION_PROFILE[action] || ACTION_PROFILE.chat;
  const st = loadState();
  const cal = st.calibration[prof.complexity] || {};
  const tm = cal.token_multiplier || 1;
  const inTok = Math.round((tokensOf(userText) + tokensOf(String(systemChars ? ' '.repeat(systemChars) : '')) + 60) * tm); // +60≈系统提示骨架
  const outTok = Math.round(prof.out * tm);
  const { p, exact } = priceFor(model);
  const costUsd = costOf(inTok, outTok, p);
  const timeSec = +Math.max(1.2, outTok / 45 + 1 * (cal.time_multiplier || 1)).toFixed(1);
  return { inTok, outTok, costUsd, timeSec, complexity: prof.complexity, priced: exact };
}

// 响应后记录实际用量（usage 为 OpenAI 兼容 data.usage；缺失则只记估算）
export function recordActual({ task, action, model, est, usage, elapsedSec }) {
  const st = loadState();
  const { p } = priceFor(model);
  const entry = {
    timestamp: new Date().toISOString(),
    task: String(task || '').slice(0, 80),
    action: action || 'chat',
    model: model || '',
    complexity: est.complexity,
    estimate: [{ scenario: 'median', total: est.inTok + est.outTok, cost: est.costUsd, time_sec: est.timeSec }],
    actual: usage
      ? {
          input_tokens: usage.prompt_tokens,
          output_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens ?? (usage.prompt_tokens + usage.completion_tokens),
          cost_usd: costOf(usage.prompt_tokens, usage.completion_tokens, p),
          time_seconds: +Number(elapsedSec || 0).toFixed(1),
        }
      : {},
  };
  st.history.push(entry);
  // 校准（与 ACE 同法）：同复杂度、近 CAL_WINDOW 条、有估算有实际 → Σ实际/Σ估算
  for (const c of ['simple', 'medium', 'complex']) {
    const rows = st.history.filter((r) => r.complexity === c && r.actual && r.actual.total_tokens && r.estimate?.[0]);
    const recent = rows.slice(-CAL_WINDOW);
    if (recent.length < CAL_MIN) continue;
    const eSum = recent.reduce((a, r) => a + r.estimate[0].total, 0);
    const aSum = recent.reduce((a, r) => a + r.actual.total_tokens, 0);
    if (eSum > 0) st.calibration[c].token_multiplier = +(aSum / eSum).toFixed(3);
    const et = recent.reduce((a, r) => a + (r.estimate[0].time_sec || 0), 0);
    const at = recent.reduce((a, r) => a + (r.actual.time_seconds || 0), 0);
    if (et > 0 && at > 0) st.calibration[c].time_multiplier = +(at / et).toFixed(3);
  }
  saveState(st);
  return entry;
}

// 记忆包（与 ACE bundle v1.2 互通）：导入合并价格/校准，历史追加
export function importBundle(json) {
  const b = typeof json === 'string' ? JSON.parse(json) : json;
  if (!b || typeof b !== 'object') throw new Error('格式不对');
  const st = loadState();
  let prices = 0, appended = 0;
  if (b.model_prices) {
    for (const k in b.model_prices) {
      const p = b.model_prices[k];
      st.model_prices[k] = {
        input: +p.input || 0,
        output: +p.output || 0,
        cache_write: +p.cache_write || +(p.input * 1.25).toFixed(4),
        cache_read: +p.cache_read || +(p.input * 0.1).toFixed(4),
      };
      prices++;
    }
  }
  if (b.calibration) {
    for (const k of ['simple', 'medium', 'complex']) {
      if (b.calibration[k]) st.calibration[k] = Object.assign(st.calibration[k] || {}, b.calibration[k]);
    }
  }
  if (Array.isArray(b.history)) {
    const seen = new Set(st.history.map((h) => h.timestamp + '|' + h.task));
    for (const h of b.history) {
      const k = (h.timestamp || '') + '|' + (h.task || '');
      if (seen.has(k)) continue;
      seen.add(k);
      st.history.push(h);
      appended++;
    }
    if (st.history.length > MAX_HISTORY) st.history = st.history.slice(-MAX_HISTORY);
  }
  saveState(st);
  return { prices, appended };
}
export function exportBundle() {
  const st = loadState();
  return {
    name: 'Agent Cost Estimator Bundle',
    version: '1.2',
    exported_at: new Date().toISOString(),
    model_prices: st.model_prices,
    calibration: st.calibration,
    history: st.history,
    source: 'PageForge',
  };
}
export function state() {
  const st = loadState();
  return { models: Object.keys(st.model_prices).length, history: st.history.length, calibration: st.calibration };
}
export function resetMemory() {
  localStorage.removeItem(ACE_KEY);
}
