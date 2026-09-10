// PageForge v2 · EditorAdapter（双模式统一执行接口，端口-适配器）
// 规范：docs/v2/editor-adapter-draft.md
//
// AI 层（ai-panel）与工具只依赖 adapter，不直接触碰 GrapesJS：
//   flow 页   → createFlowAdapter(editor)      （本文件，包 GrapesJS）
//   canvas 页 → createCanvasAdapter(deps)      （src/v2/adapter.js，包 v2 store/渲染）
//
// 职责边界：
//   - 撤销打包归适配器（flow = magicFusionIndex 合并；canvas = snapshot）
//   - 配色/诊断/初稿三个 A 系工具暂为 flow 专属（capabilities 里声明，UI 按 capabilities 显隐）

import { buildBlockHTML } from './block-html.js';
export { buildBlockHTML };

// —— flow 撤销打包：一批变更合并为单一撤销单元（magicFusionIndex 同组）——
let flowOpSeq = 0;
export function flowUndoBatch(editor, mutate) {
  const um = editor.UndoManager;
  const stack = um.getStack();
  const from = stack.length;
  mutate();
  let lastLen = -1, tries = 0;
  const merge = () => {
    if (stack.length !== lastLen && tries++ < 10) { lastLen = stack.length; setTimeout(merge, 60); return; }
    const group = 'op-' + (++flowOpSeq);
    for (let i = from; i < stack.length; i++) stack.at(i)?.set('magicFusionIndex', group);
  };
  setTimeout(merge, 60);
}

export function createFlowAdapter(editor) {
  return {
    mode: 'flow',
    capabilities: { chat: true, placeBlock: true, freeHTML: true, style: true, replace: true, gen: true, color: true, diag: true },

    // —— 选择与上下文 ——
    getSelection() {
      const s = editor.getSelected();
      if (!s) return null;
      let text = '';
      try { text = (s.get('content') || s.toHTML() || '').replace(/<[^>]+>/g, '').trim().slice(0, 20); } catch { /* 忽略 */ }
      return { tagName: String(s.get('tagName') || '').toLowerCase(), text, flowId: s.id };
    },
    getSelectionHTML() {
      const s = editor.getSelected();
      try { return s ? s.toHTML().slice(0, 2000) : ''; } catch { return ''; }
    },
    getPageHTML() {
      try { return editor.getHtml().replace(/<body[^>]*>|<\/body>/g, '').slice(0, 4000); } catch { return ''; }
    },
    getPageText() {
      try {
        const n = editor.getComponents().length;
        const text = editor.getHtml().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
        return `${n} 个顶层块。文字摘要：${text || '（空页）'}`;
      } catch { return '（空页）'; }
    },
    onSelect(cb) {
      const on = () => cb(this.getSelection());
      const off = () => cb(null);
      editor.on('component:selected', on);
      editor.on('component:deselected', off);
      return () => { editor.off('component:selected', on); editor.off('component:deselected', off); };
    },

    // —— 块协议落地 ——
    placeBlock(def, slots = {}) {
      flowUndoBatch(editor, () => editor.addComponents(buildBlockHTML(def, slots)));
    },
    insertFreeHTML(html) {
      flowUndoBatch(editor, () => editor.addComponents(html));
    },

    // —— 样式 / 替换 ——
    applyStyleToSelection(css) {
      const s = editor.getSelected();
      if (!s) throw new Error('请先选中一个组件，再让我改样式。');
      flowUndoBatch(editor, () => s.setStyle(css));
    },
    replaceSelection(html) {
      const s = editor.getSelected();
      if (!s) throw new Error('请先选中一个组件，再让我替换。');
      flowUndoBatch(editor, () => s.replaceWith(html));
    },

    // —— 整页替换（初稿）——
    replacePage(html) {
      flowUndoBatch(editor, () => {
        editor.getWrapper().components().reset();
        editor.setComponents(html);
      });
    },

    // —— 撤销透传（ai-panel 自身不用，工具链可能用）——
    undo: () => editor.UndoManager.undo(),
    redo: () => editor.UndoManager.redo(),
  };
}
