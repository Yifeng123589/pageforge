# EditorAdapter 接口（v2 · 实现文档）

> AI 层（ai-panel）与工具只依赖本接口；flow 页 = `createFlowAdapter(editor)`（src/editor-adapter.js），
> canvas 页 = `createCanvasAdapter(deps)`（src/v2/adapter.js）。**不要再给每个模块单独立接口**——撤销打包、
> 放置策略等模式差异都收在适配器内部。

## 接口面

```ts
interface EditorAdapter {
  mode: 'flow' | 'canvas';
  // 布尔能力声明，UI 按此显隐工具按钮（canvas 暂无 color/diag/gen/freeHTML）
  capabilities: {
    chat: boolean; placeBlock: boolean; freeHTML: boolean; style: boolean;
    replace: boolean; gen: boolean; color: boolean; diag: boolean;
  };
  getSelection(): { tagName: string; text: string; elementId?: string } | null;
  getSelectionHTML(): string;
  getPageHTML(): string;
  getPageText(): string;
  onSelect(cb: (sel) => void): () => void;
  placeBlock(def: BlockDef, slots: Record<string, string>): string;  // 返回新元素 id
  insertFreeHTML(html: string): void;
  applyStyleToSelection(cssDecls: Record<string, string> | string): void;
  replaceSelection(html: string): void;
  replacePage(html: string): void;
  undo(): boolean; redo(): boolean;
}
```

## 行为差异速查

| 能力 | flow（GrapesJS） | canvas（v2） |
|---|---|---|
| placeBlock | addComponents(buildBlockHTML)，magicFusion 合并撤销 | CANVAS_BY_BLOCK 模板 + 纵向排队（底部+40、stage 生长）+ applySlots 写 data-id 叶子 + snapshot |
| style | GrapesJS setStyle | 容器声明进 el.style；文字色/字号转写 overrides（首个文字叶子） |
| freeHTML | addComponents | **不支持**（抛 CANVAS_FREE_UNSUPPORTED，缺口日志在 ai-panel 侧兜底） |
| 撤销 | GrapesJS UndoManager | store 快照栈（200 帧） |

## 已知限制

- canvas 首批仅 3 块有模板（pf-footer / pf-section-features / pf-cta-banner）；未适配块 placeBlock 抛 `BLOCK_NOT_ADAPTED:<id>`，ai-panel 转中文提示并记缺口日志。
- applyStyleToSelection 的"文字声明转写"只命中元素内第一个文字叶子。
- replace 在 canvas 抛未实现（capabilities.replace=false，UI 门控）。
