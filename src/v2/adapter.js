// v2 CanvasAdapter：EditorAdapter 接口的 canvas 页实现
// 职责：放置策略（内容底部 +40，stage 生长）+ 槽位→data-id 填槽 + 选择上下文 + 样式薄封装
// 未实现的能力按 capabilities=false 声明（UI 已按门控显隐），调用会抛错
// 撤销归 store 快照栈；style 走覆盖表/容器样式（AI 的 style 动作 = 解析 css 声明应用）

import { getDoc, snapshot, updateElement, addElement, undo as storeUndo, redo as storeRedo, CANVAS_BY_BLOCK } from './store.js';

// css 声明 → 对象（强化版）：接受字符串或对象（ai-panel 会先 parseCss 成对象传入），
// 剥选择器/花括号包装，只留合法属性名——防模型输出的垃圾声明静默生效
function parseCss(str) {
  let obj = {};
  if (str && typeof str === 'object') {
    obj = { ...str };
  } else {
    String(str || '')
      .replace(/[{}]/g, '')
      .split(';')
      .forEach((part) => {
        const i = part.indexOf(':');
        if (i <= 0) return;
        obj[part.slice(0, i).trim()] = part.slice(i + 1).trim();
      });
  }
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k).trim().toLowerCase();
    const val = String(v == null ? '' : v).trim();
    if (!key || !val) continue;
    if (!/^[a-z-]+$/.test(key)) continue;   // 非法属性名（如 ".selected" "[object"）丢弃
    if (/[<>]/.test(val)) continue;         // 值里带标签 = 模型跑偏了
    clean[key] = val;
  }
  return clean;
}

export function createCanvasAdapter({ getSelection = () => null, onSelect = () => () => {}, setSel = () => {} } = {}) {
  return {
    mode: 'canvas',
    capabilities: { chat: true, placeBlock: true, freeHTML: false, style: true, replace: true, gen: false, color: false, diag: false },

    // —— 选择与上下文 ——
    getSelection() {
      const s = getSelection();
      const el = s?.elementId && getDoc().elements.find((e) => e.id === s.elementId);
      if (!el) return null;
      const text = el.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20);
      return { tagName: el.type, text, elementId: el.id };
    },
    getSelectionHTML() {
      const s = getSelection();
      const el = s?.elementId && getDoc().elements.find((e) => e.id === s.elementId);
      return el ? el.html.slice(0, 2000) : '';
    },
    getPageHTML() {
      const d = getDoc();
      return d.elements
        .map((e) => `<div style="position:absolute;left:${e.x}px;top:${e.y}px;width:${e.width}px;height:${e.height}px;">${e.html}</div>`)
        .join('\n');
    },
    getPageText() {
      const d = getDoc();
      const text = d.elements.map((e) => e.html.replace(/<[^>]+>/g, ' ')).join(' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      return `${d.elements.length} 个画布元素。文字摘要：${text || '（空页）'}`;
    },
    onSelect,

    // —— 样式（AI style 动作）：容器声明进 el.style；文字类声明转写全部文字叶子的覆盖表 ——
    // 诚实原则：解析不出有效声明 / 应用后无变化 → 抛错（绝静默成功）
    applyStyleToSelection(css) {
      const s = getSelection();
      const el = s?.elementId && getDoc().elements.find((e) => e.id === s.elementId);
      if (!el) throw new Error('请先选中一个元素。');
      const decls = parseCss(css);
      if (!Object.keys(decls).length) {
        throw new Error('没能从回复里解析出有效的样式声明（' + String(css || '').slice(0, 60) + '），未做任何修改。');
      }
      const before = JSON.stringify({ s: el.style, o: el.overrides });
      snapshot();
      const nextStyle = { ...el.style, ...decls };
      // 文字颜色/字号/行高对容器无意义 → 转写到全部文字叶子的覆盖表（问题四：改的是整个组件的文字）
      const overrides = { ...el.overrides };
      const textDecls = {};
      for (const k of ['color', 'font-size', 'line-height', 'font-weight', 'letter-spacing']) {
        if (k in nextStyle) { textDecls[k] = nextStyle[k]; delete nextStyle[k]; }
      }
      if (Object.keys(textDecls).length) {
        const tmp = document.createElement('div');
        tmp.innerHTML = el.html;
        const textLeaves = [...tmp.querySelectorAll('[data-id]')].filter((n) => /^(P|H1|H2|H3|H4|H5|H6|SPAN|A)$/.test(n.tagName));
        if (textLeaves.length) {
          for (const n of textLeaves) {
            const id = n.getAttribute('data-id');
            overrides[id] = { ...(overrides[id] || {}), ...textDecls };
          }
        } else {
          Object.assign(nextStyle, textDecls); // 没有文字叶子就留在容器（无害）
        }
      }
      updateElement(el.id, { style: nextStyle, overrides });
      const el2 = getDoc().elements.find((e) => e.id === el.id);
      const after = JSON.stringify({ s: el2.style, o: el2.overrides });
      if (before === after) {
        throw new Error('样式未能应用到该元素（值与现状相同或属性不适用），未做修改。');
      }
    },

    // —— 块协议落地：放置 + 槽位填入 data-id 叶子 ——
    placeBlock(def, slots = {}) {
      const make = CANVAS_BY_BLOCK[def.id];
      if (!make) throw new Error('BLOCK_NOT_ADAPTED:' + def.id);
      snapshot();
      const d = getDoc();
      const el = make();
      // 放置策略（D1）：放已占内容底部 +40，stage 随之向下生长——绝不与现有元素重叠
      const maxY = d.elements.length ? Math.max(...d.elements.map((e) => e.y + e.height)) : 0;
      el.x = Math.round((d.stage.width - el.width) / 2);
      el.y = d.elements.length ? Math.round(maxY + 40) : Math.round((d.stage.height - el.height) / 2 - 40);
      if (el.y + el.height + 40 > d.stage.height) d.stage.height = el.y + el.height + 40;
      if (el.applySlots) {
        const tmp = document.createElement('div');
        tmp.innerHTML = el.html;
        el.applySlots(tmp, slots);
        el.html = tmp.innerHTML;
      }
      addElement(el);
      setSel(el.id); // 放置即选中：用户可立即拖动/改字
      return el.id;
    },
    insertFreeHTML() {
      // canvas 页不接受裸 HTML（会破坏数据模型）；缺口日志仍记录，供结晶为 canvas 块
      throw new Error('CANVAS_FREE_UNSUPPORTED');
    },

    // —— 整体替换：模型返回的新 HTML 替换选中元素内容（保留几何与身份；高度用户可再调）——
    replaceSelection(html) {
      const s = getSelection();
      const el = s?.elementId && getDoc().elements.find((e) => e.id === s.elementId);
      if (!el) throw new Error('请先选中一个元素。');
      snapshot();
      updateElement(el.id, { html });
    },

    // —— 整页替换：canvas 页不支持（会破坏元素模型），AI 初稿在 canvas 页隐藏 ——
    replacePage() {
      throw new Error('CANVAS_PAGE_REPLACE_UNSUPPORTED');
    },

    // —— 撤销透传（v2 store 快照栈）——
    undo: () => storeUndo(),
    redo: () => storeRedo(),
  };
}
