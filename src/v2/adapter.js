// v2 CanvasAdapter：EditorAdapter 接口的 canvas 页实现
// 职责：放置策略（内容底部 +40，stage 生长）+ 槽位→data-id 填槽 + 选择上下文 + 样式薄封装
// 未实现的能力按 capabilities=false 声明（UI 已按门控显隐），调用会抛错
// 撤销归 store 快照栈；style 走覆盖表/容器样式（AI 的 style 动作 = 解析 css 声明应用）

import { getDoc, snapshot, updateElement, addElement, placeElement, undo as storeUndo, redo as storeRedo, CANVAS_BY_BLOCK, makeElementFromHTML, setStage } from './store.js';
import { buildBlockHTML } from '../block-html.js';

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
  // 取元素内某个叶子节点（data-id 定位）——AI 聚焦"模块里的那个按钮"靠它
  const LEAF_CN = {
    a: '按钮/链接', button: '按钮', img: '图片', h1: '大标题', h2: '标题', h3: '小标题',
    h4: '小标题', h5: '小标题', h6: '小标题', p: '文字',
  };
  function leafOf(el, leafId) {
    if (!el || !leafId) return null;
    const tmp = document.createElement('div');
    tmp.innerHTML = el.html;
    const node = tmp.querySelector(`[data-id="${leafId}"]`);
    return node || null;
  }
  return {
    mode: 'canvas',
    // color 已开：canvas 版的"调色板 → 全页元素"由 adapter.applyPalette 实现
    capabilities: { chat: true, placeBlock: true, freeHTML: true, style: true, replace: true, gen: false, color: true, diag: true },

    // —— 选择与上下文 ——
    getSelection() {
      const s = getSelection();
      const el = s?.elementId && getDoc().elements.find((e) => e.id === s.elementId);
      if (!el) return null;
      // 深入选中叶子时，上下文聚焦到那个叶子——否则 AI 只看到整个模块，改不到块里的按钮
      const leaf = s.leafId ? leafOf(el, s.leafId) : null;
      if (leaf) {
        const tag = leaf.tagName.toLowerCase();
        return {
          tagName: tag,
          text: (leaf.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30),
          elementId: el.id,
          leafId: s.leafId,
          leafLabel: LEAF_CN[tag] || tag,
          insideBlock: true,
        };
      }
      const text = el.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20);
      return { tagName: el.type, text, elementId: el.id, leafId: null };
    },
    getSelectionHTML() {
      const s = getSelection();
      const el = s?.elementId && getDoc().elements.find((e) => e.id === s.elementId);
      if (!el) return '';
      const leaf = s.leafId ? leafOf(el, s.leafId) : null;
      if (leaf) return leaf.outerHTML.slice(0, 1200); // 只给这个叶子：AI 不会误把整块当目标
      return el.html.slice(0, 2000);
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

    // —— 样式（AI style 动作）：容器声明进 el.style；文字类声明转写文字叶子的覆盖表 ——
    // target = 指定的文字叶子 data-id（AI 精准定位）；省略 = 用户当前深入选中的叶子 / 全部文字叶子
    // 诚实原则：解析不出有效声明 / 应用后无变化 → 抛错（绝静默成功）
    applyStyleToSelection(css, target = null) {
      const s = getSelection();
      const el = s?.elementId && getDoc().elements.find((e) => e.id === s.elementId);
      if (!el) throw new Error('请先选中一个元素。');
      const decls = parseCss(css);
      if (!Object.keys(decls).length) {
        throw new Error('没能从回复里解析出有效的样式声明（' + String(typeof css === 'object' ? JSON.stringify(css) : css || '').slice(0, 60) + '），未做任何修改。');
      }
      // 聚焦在块内叶子（Ctrl+点击 / 右键「选中这个内部元素」）→ 全部声明只写这个叶子的覆盖表。
      // 必须包含 background/border/padding：用户选的是按钮，改背景就该只改按钮，不能整块变色。
      const aim = target || s.leafId || null;
      if (aim) {
        const probe = document.createElement('div');
        probe.innerHTML = el.html;
        const hit = probe.querySelector(`[data-id="${aim}"]`);
        if (!hit) throw new Error(`要修改的内部元素（${aim}）已不存在，请重新选中。`);
        const beforeOv = JSON.stringify(el.overrides || {});
        snapshot();
        const prev = (el.overrides || {})[aim] || {};
        updateElement(el.id, { overrides: { ...el.overrides, [aim]: { ...prev, ...decls } } });
        const el2 = getDoc().elements.find((e) => e.id === el.id);
        if (JSON.stringify(el2.overrides || {}) === beforeOv) {
          throw new Error('样式未能应用到该内部元素（值与现状相同），未做修改。');
        }
        return;
      }
      const before = JSON.stringify({ s: el.style, o: el.overrides });
      snapshot();
      const nextStyle = { ...el.style, ...decls };
      // 文字颜色/字号/行高对容器无意义 → 转写到文字叶子的覆盖表
      const overrides = { ...el.overrides };
      const textDecls = {};
      for (const k of ['color', 'font-size', 'line-height', 'font-weight', 'letter-spacing']) {
        if (k in nextStyle) { textDecls[k] = nextStyle[k]; delete nextStyle[k]; }
      }
      if (Object.keys(textDecls).length) {
        const tmp = document.createElement('div');
        tmp.innerHTML = el.html;
        let textLeaves = [...tmp.querySelectorAll('[data-id]')].filter((n) => /^(P|H1|H2|H3|H4|H5|H6|SPAN|A)$/.test(n.tagName));
        // 精准定位：target 指定叶子优先，且仅该叶子生效
        if (target) {
          const hit = textLeaves.find((n) => n.getAttribute('data-id') === target);
          if (hit) textLeaves = [hit];
          else throw new Error('指定的叶子 data-id="' + target + '" 不存在。可用的叶子：' + textLeaves.map((n) => n.getAttribute('data-id')).join('、'));
        }
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

    // —— AI 配色（A1-2）：调色板 → 全页元素 ——
    // v1 是直接操作 GrapesJS 的 CssComposer（硬耦合，canvas 页根本没有那东西）；
    // canvas 版改为写数据层：
    //   bg      → 画布舞台背景
    //   primary → 各级标题文字色
    //   text    → 正文/次要文字色
    //   accent  → 链接与按钮背景色（文字转白，保证对比度）
    // secondary 本次不使用（没有可安全批量替换的块级背景，宁可不动也不乱刷）
    // 诚实计数：逐段统计，零命中或部分失败都如实回报（沿用 v1 的口径）
    applyPalette(palette) {
      const p = palette || {};
      const isHex = (v) => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
      if (!['bg', 'primary', 'text', 'accent'].some((k) => isHex(p[k]))) {
        throw new Error('配色方案里没有可用的颜色值（需要 #hex），未做任何修改。');
      }
      const stat = { stage: false, titles: 0, texts: 0, buttons: 0, errs: [] };
      snapshot();
      if (isHex(p.bg)) {
        try { setStage({ background: p.bg.trim() }); stat.stage = true; }
        catch (e) { stat.errs.push('画布背景: ' + (e.message || e)); }
      }
      for (const el of getDoc().elements) {
        try {
          const tmp = document.createElement('div');
          tmp.innerHTML = el.html;
          const patch = { ...(el.overrides || {}) };
          let touched = 0;
          for (const n of [...tmp.querySelectorAll('[data-id]')]) {
            const id = n.getAttribute('data-id');
            const tag = n.tagName.toLowerCase();
            const next = { ...(patch[id] || {}) };
            if (/^h[1-6]$/.test(tag)) {
              if (!isHex(p.primary)) continue;
              next.color = p.primary.trim(); stat.titles++; touched++;
            } else if (tag === 'a' || tag === 'button') {
              if (!isHex(p.accent)) continue;
              next.background = p.accent.trim();
              next.color = '#ffffff';
              stat.buttons++; touched++;
            } else if (['p', 'span', 'li', 'blockquote', 'em', 'strong'].includes(tag)) {
              if (!isHex(p.text)) continue;
              next.color = p.text.trim(); stat.texts++; touched++;
            } else continue;
            patch[id] = next;
          }
          if (touched) updateElement(el.id, { overrides: patch });
        } catch (e) { stat.errs.push('元素 ' + el.id + ': ' + (e.message || e)); }
      }
      const total = stat.titles + stat.texts + stat.buttons + (stat.stage ? 1 : 0);
      if (!total) throw new Error('页面里没有可着色的元素（标题/正文/链接），未做修改。');
      return { ...stat, total };
    },

    // —— 块协议落地：放置 + 槽位填入 data-id 叶子 ——
    placeBlock(def, slots = {}) {
      snapshot();
      const make = CANVAS_BY_BLOCK[def.id];
      let el;
      if (make) {
        el = make();
        // 放置策略（D1）：内容底部 +40、stage 向下生长——与 store.placeElement 同源
        placeElement(el);
        if (el.applySlots) {
          const tmp = document.createElement('div');
          tmp.innerHTML = el.html;
          el.applySlots(tmp, slots);
          el.html = tmp.innerHTML;
        }
      } else {
        // D1a 降级：该块尚未做 canvas 原生适配 → 用 v1 的块 HTML 直接构一个画布元素。
        // 效果：51 个块在 canvas 页全部可用（内容流式、高度可调），而不是只有 3 个。
        el = makeElementFromHTML(buildBlockHTML(def, slots));
        placeElement(el);
      }
      addElement(el);
      setSel(el.id); // 放置即选中：用户可立即拖动/改字
      return el.id;
    },
    insertFreeHTML(html) {
      // 降级：AI 自由生成的 HTML 作为一个元素收入画布（元素数组仍是唯一真相，数据模型不破坏）
      if (!html || !String(html).trim()) throw new Error('没有可插入的内容。');
      snapshot();
      const el = makeElementFromHTML(String(html));
      placeElement(el);
      addElement(el);
      setSel(el.id);
      return el.id;
    },

    // —— 设计诊断（A0-9）——
    // canvas 页没有 CSS 规则表，所以诊断上下文给"元素清单 + 关键样式"，
    // 让模型针对具体元素（elementId / 叶子 data-id）给建议，应用时直接写回该元素。
    getDiagContext() {
      const d = getDoc();
      const lines = d.elements.map((e, i) => {
        const txt = String(e.html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
        const st = Object.entries(e.style || {}).map(([k, v]) => `${k}:${v}`).join(';');
        const ov = Object.entries(e.overrides || {})
          .map(([lid, o]) => `${lid}{${Object.entries(o).map(([k, v]) => `${k}:${v}`).join(';')}}`)
          .join(' ');
        return `#${i + 1} id=${e.id} 类型=${e.type} ${e.width}×${e.height} 位置(${e.x},${e.y}) 容器[${st}] 覆盖[${ov}] 文本「${txt}」`;
      }).join('\n');
      return {
        schema: 'element',
        text: `画布 ${d.stage.width}×${d.stage.height}，底色 ${d.stage.background}\n元素清单（共 ${d.elements.length} 个）：\n${lines || '（空画布）'}`,
      };
    },

    // 应用诊断建议：按 elementId 写入容器样式（或指定叶子的覆盖表）。
    // 找不到元素 / 声明非法 → 跳过并计数（诚实汇报，不虚标成功）
    applyDiagItems(items) {
      const d = getDoc();
      snapshot();
      let applied = 0;
      let skipped = 0;
      for (const it of (items || [])) {
        const el = it && it.elementId && d.elements.find((x) => x.id === it.elementId);
        const css = parseCss(it && it.css);
        if (!el || !Object.keys(css).length) { skipped++; continue; }
        if (it.leafId) {
          const prev = (el.overrides || {})[it.leafId] || {};
          updateElement(el.id, { overrides: { ...el.overrides, [it.leafId]: { ...prev, ...css } } });
        } else {
          updateElement(el.id, { style: { ...(el.style || {}), ...css } });
        }
        applied++;
      }
      return { applied, skipped };
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
