// v2 CanvasAdapter：EditorAdapter 接口的 canvas 页实现
// 职责：放置策略（纵向空档扫描）+ 槽位→data-id 填槽 + 选择上下文
// 未实现的能力（样式面板/自由生成/整页替换等）按 capabilities=false 声明，调用会抛错

import { getDoc, snapshot, addElement, undo as storeUndo, redo as storeRedo, CANVAS_BY_BLOCK } from './store.js';

export function createCanvasAdapter({ getSelection = () => null, onSelect = () => () => {} } = {}) {
  return {
    mode: 'canvas',
    capabilities: { chat: true, placeBlock: true, freeHTML: false, style: false, replace: false, gen: false, color: false, diag: false },

    // —— 选择与上下文 ——
    getSelection,
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

    // —— 块协议落地：放置 + 槽位填入 data-id 叶子 ——
    placeBlock(def, slots = {}) {
      const make = CANVAS_BY_BLOCK[def.id];
      if (!make) throw new Error('该块暂无 canvas 适配版本：' + def.id);
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
      return el.id;
    },
    insertFreeHTML() {
      // canvas 页不接受裸 HTML（会破坏数据模型）；缺口日志仍记录，供结晶为 canvas 块
      throw new Error('CANVAS_FREE_UNSUPPORTED');
    },

    // —— 撤销透传（v2 store 快照栈）——
    undo: () => storeUndo(),
    redo: () => storeRedo(),
  };
}
