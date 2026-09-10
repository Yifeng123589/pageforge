# PageForge v2 · 画布页 JSON Schema（草案 v0.1 · 待评审）

> 双模式架构的数据层设计。模式 B（flow）沿用现有 GrapesJS 工程数据，本文只定义**模式 A（canvas）**。
> 三块样例取自现有块库：页脚 / 三栏特性区 / 渐变行动横幅。
> **评审通过前不写任何实现代码。**

---

## 0. 设计原则（上轮讨论的定论）

1. **双模式共存，页面级二选一**：`layoutMode: 'flow' | 'canvas'`，一个站点可混排（落地页 canvas + 博客页 flow）
2. **canvas 页放弃响应式是定义，不是缺陷**：导出 = 绝对定位 + 根节点等比缩放（不做布局编译器）
3. **内容不是 opaque 字符串**（硬伤一的教训）：叶子带 `dataId`，样式面板走覆盖表，编辑按叶提交
4. **渲染用 DOM 不用 canvas 库**（硬伤二讨论的定论）：输出是 HTML，编辑器画布就该是 HTML
5. AI 块协议零改动：`insert_block` 在 canvas 页 = 写入一个 element（块目录/槽位/缺口日志全部照旧）

---

## 1. 顶层：工程与页面

```ts
interface PFProject {
  version: 2;
  pages: Page[];                    // 页面顺序 = 导出顺序
  settings: { title: string; desc: string; fav?: string; og?: string };
}

interface Page {
  id: string;                       // ulid
  name: string;                     // 页面名（导航锚点用）
  title?: string;
  layoutMode: 'flow' | 'canvas';

  // ---- layoutMode === 'flow'：沿用现有 GrapesJS project 数据，结构不动 ----
  flowData?: unknown;               // GrapesJS project JSON（本 schema 不定义）

  // ---- layoutMode === 'canvas' ----
  stage?: Stage;
  elements?: CanvasElement[];
}

/** 画布规格：宽固定（默认 1440），纵向可增长（网页语义：往下拼） */
interface Stage {
  width: number;                    // 默认 1440；导出时根节点 scale = viewport/width
  background: string;               // 页面底色，默认 '#ffffff'
  // height 不存——由最底元素的 y+h 决定（内容驱动，避免双源）
}
```

**决策记录**：
- Stage 不存 height。Keynote 是固定页高，网页纵向无限——高度=内容底界，渲染层和导出层各自计算，避免"改了元素忘了改高度"的双源 bug。
- flow 页的 `flowData` 原样嵌在 Page 里，保证一个工程文件同时携带两种页面，导入导出格式不变。

---

## 2. 元素：CanvasElement

```ts
interface CanvasElement {
  id: string;                       // ulid（选中/吸附/撤销都靠它）
  type: 'block' | 'text' | 'image' | 'shape';
  x: number; y: number;             // 左上角，stage 坐标系（px）
  w: number; h: number;
  z: number;                        // 渲染层按 z 排序挂 DOM
  rotation?: number;                // 度，默认 0（八点缩放做逆变换，见交互层备忘）
  opacity?: number;                 // 0~1
  locked?: boolean;
  hidden?: boolean;

  // type === 'block'：块库引用 + 插入配方
  blockId?: string;                 // 如 'pf-footer'（AI 块目录同名）
  slots?: Record<string, unknown>;  // 插入时的 AI 槽位（仅生成 content 用，见 §3 数据流）

  // 实例化后的内容（真相，见 §3）
  content?: ContentNode[];          // 展开后的受限叶子树
  styleOverrides?: Record<string, CSSDecl>;  // dataId → 覆盖样式（样式面板的写入目标）

  // 简单类型
  text?: string;                    // type==='text'
  fontSize?: number; fontColor?: string;  // text 的快捷样式（v1 先够用）
  src?: string;                     // type==='image'
  fill?: string; radius?: number;   // type==='shape'
}

/** 受限叶子：白名单标签，每个可编辑叶子有 dataId */
interface ContentNode {
  dataId: string;                   // 'n' + ulid 短码；编辑/覆盖表/吸附提示都锚定它
  tag: 'p' | 'h1' | 'h2' | 'h3' | 'span' | 'a' | 'img' | 'footer' | 'nav' | 'div' | 'section';
  text?: string;                    // 文本叶子
  href?: string; alt?: string; src?: string;
  style?: CSSDecl;                  // 块模板的默认内联样式（插入时从块模板拷贝）
  children?: ContentNode[];         // 允许 2 层嵌套（容器叶子），不递归更深
}

type CSSDecl = Record<string, string>;   // { color:'#fff', padding:'24px' } 值全部是字符串
```

**决策记录**：
- 叶子树**最多两层**。现有 51 块的 HTML 都在两层以内（容器→叶子），深树是文档编辑器的需求，不是卡片块的需求。
- `slots` 只在插入瞬间用（纯函数：`blockId + slots → content`）。**实例化之后 content 就是唯一真相**——用户双击改字直接写叶子的 `text`；AI 再填槽 = 通过协议定位 dataId 改写。不存在"改了 slots 要不要同步 content"的双源问题。
- `styleOverrides` 与叶子默认 `style` 分离：样式面板改颜色 → 写覆盖表，渲染时 merge（override 优先）。导出时才合并进内联 style。**HTML 字符串永远只在导出瞬间生成**（`blockId+content+overrides → html` 是纯函数），编辑全程不碰字符串——硬伤一的解。

---

## 3. 数据流（一句话版）

```
插入：blockId + slots ──(块模板纯函数)──► content + 默认style
编辑：双击叶子 → contenteditable → 失焦写回该叶子的 text（单叶提交）
样式：面板 ──► styleOverrides[dataId]          （HTML 全程不变）
渲染：elements ──(DOM Renderer)──► 绝对定位容器树
导出：content + overrides ──(序列化纯函数)──► 绝对定位 HTML + 根缩放脚本
```

---

## 4. 三块样例（现有块 → canvas 元素）

### 4.1 页脚（pf-footer，含 slot 双写点）

```jsonc
{
  "id": "01J9F3KQ7M",
  "type": "block",
  "blockId": "pf-footer",
  "x": 0, "y": 1180, "w": 1440, "h": 320, "z": 3,
  "slots": { "brand": "Latte", "intro": "咖啡因驱动的每一天" },
  "content": [
    { "dataId": "nA1", "tag": "footer", "style": { "background": "#0d0d0f", "color": "#a1a1aa", "padding": "56px 24px 32px" },
      "children": [
        { "dataId": "nA2", "tag": "div", "style": { "maxWidth": "1100px", "margin": "0 auto", "display": "grid", "gridTemplateColumns": "repeat(auto-fit,minmax(160px,1fr))", "gap": "40px" },
          "children": [
            { "dataId": "nA3", "tag": "div", "children": [
              { "dataId": "nA4", "tag": "p", "style": { "margin": "0 0 12px", "fontSize": "20px", "fontWeight": "800", "color": "#fff" },
                "children": [ { "dataId": "nA5", "tag": "span", "text": "Latte" } ] },
              { "dataId": "nA6", "tag": "p", "style": { "margin": "0", "fontSize": "14px", "lineHeight": "1.7" },
                "children": [ { "dataId": "nA7", "tag": "span", "text": "咖啡因驱动的每一天" } ] }
            ]}
            // … 产品/公司/资源 三列，同样结构（评审版略，实现时由模板函数生成）
          ]},
        { "dataId": "nA8", "tag": "div", "style": { "maxWidth": "1100px", "margin": "32px auto 0", "paddingTop": "24px", "borderTop": "1px solid #27272a", "textAlign": "center", "fontSize": "13px" },
          "children": [
            { "dataId": "nA9", "tag": "span", "text": "© 2026 Latte. All rights reserved." }
          ]}
      ]}
  ],
  "styleOverrides": {
    "nA5": { "color": "#fbbf24" }      // 用户在面板把品牌名改成了金色——HTML 未动
  }
}
```

> 注意 `brand` 槽的双写点：nA5（品牌名）和 nA9（版权行）都由 slot 生成——这正是现有 `data-pf-slot` 机制的翻译。slots 只在插入时生效一次，之后两处各自独立（用户改其一不影响另一）。

### 4.2 三栏特性区（pf-section-features，items 数组槽）

```jsonc
{
  "id": "01J9F3KQ8N", "type": "block", "blockId": "pf-section-features",
  "x": 60, "y": 300, "w": 1320, "h": 520, "z": 2,
  "slots": { "title": "为什么选我们", "sub": "三个理由", "items": ["极速：秒开页面", "安全：端到端加密", "省心：全自动备份"] },
  "content": [
    { "dataId": "nB1", "tag": "section", "style": { "maxWidth": "1100px", "margin": "0 auto", "padding": "80px 24px", "textAlign": "center" },
      "children": [
        { "dataId": "nB2", "tag": "h2", "text": "为什么选我们", "style": { "fontSize": "40px", "fontWeight": "700", "letterSpacing": "-0.5px", "margin": "0 0 12px", "color": "#1d1d1f" } },
        { "dataId": "nB3", "tag": "p", "text": "三个理由", "style": { "fontSize": "19px", "color": "#6e6e73", "margin": "0 0 48px" } },
        { "dataId": "nB4", "tag": "div", "style": { "display": "grid", "gridTemplateColumns": "1fr 1fr 1fr", "gap": "20px", "textAlign": "left" },
          "children": [
            { "dataId": "nB5", "tag": "div", "style": { "padding": "24px", "borderRadius": "18px", "background": "#f5f5f7" }, "children": [
              { "dataId": "nB6", "tag": "h3", "text": "极速", "style": { "margin": "0 0 8px", "fontSize": "19px", "fontWeight": "700", "color": "#1d1d1f" } },
              { "dataId": "nB7", "tag": "p", "text": "秒开页面", "style": { "margin": "0", "fontSize": "15px", "lineHeight": "1.6", "color": "#6e6e73" } } ]},
            { "dataId": "nB8", "tag": "div", "children": [ /* 安全… */ ]},
            { "dataId": "nB9", "tag": "div", "children": [ /* 省心… */ ]}
          ]}
      ]}
  ]
}
```

### 4.3 渐变行动横幅（pf-cta-banner）

```jsonc
{
  "id": "01J9F3KQ9P", "type": "block", "blockId": "pf-cta-banner",
  "x": 0, "y": 860, "w": 1440, "h": 320, "z": 1,
  "slots": { "title": "现在就来一杯", "sub": "街角的温暖，记忆里的味道", "btn": "找店" },
  "content": [
    { "dataId": "nC1", "tag": "section", "style": { "padding": "96px 24px", "textAlign": "center", "background": "linear-gradient(135deg,#f5f5f7 0%,#e8e8ed 100%)" },
      "children": [
        { "dataId": "nC2", "tag": "h2", "text": "现在就来一杯", "style": { "fontSize": "44px", "fontWeight": "700", "letterSpacing": "-0.5px", "margin": "0 0 14px", "color": "#1d1d1f" } },
        { "dataId": "nC3", "tag": "p", "text": "街角的温暖，记忆里的味道", "style": { "fontSize": "19px", "color": "#6e6e73", "margin": "0 0 32px" } },
        { "dataId": "nC4", "tag": "a", "href": "#", "style": { "display": "inline-block", "background": "#1d1d1f", "color": "#ffffff", "padding": "14px 34px", "borderRadius": "980px", "fontSize": "17px", "fontWeight": "600", "textDecoration": "none" },
          "children": [ { "dataId": "nC5", "tag": "span", "text": "找店" } ] }
      ]}
  ]
}
```

---

## 5. 导出格式（canvas 页）

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>页面标题</title>
<style>
  html,body{margin:0;background:#fff}
  #pf-stage{position:relative;width:1440px;transform-origin:0 0;overflow:hidden}
</style>
</head>
<body>
<div id="pf-stage">
  <!-- 每个元素一个绝对定位容器；内部 = content+overrides 合并后的流式 HTML -->
  <div data-el="01J9F3KQ9P" style="position:absolute;left:0px;top:860px;width:1440px;height:320px;z-index:1;">
    <section style="padding:96px 24px;text-align:center;background:linear-gradient(...)">
      <h2 style="…">现在就来一杯</h2>
      <p style="…">街角的温暖，记忆里的味道</p>
      <a style="…">找店</a>
    </section>
  </div>
  <!-- …其余元素按 z 排序 -->
</div>
<script>
(function(){var s=document.getElementById('pf-stage');function fit(){s.style.transform='scale('+Math.min(1,document.documentElement.clientWidth/1440)+')';document.body.style.height=s.getBoundingClientRect().height+'px'}fit();window.addEventListener('resize',fit)})();
</script>
</body>
</html>
```

**要点**：
- 根缩放 = 模式 A 的全部"响应式"（按定义放弃重排，等比保真）
- `data-el` 保留元素 id：**重新导入回编辑器时无损还原**（导出↔导入双向，v1 的 N1 导入功能在 canvas 页上的等价物）
- 高度：body 高度由 stage 实测撑起（scale 后 transform 不占布局，需要手动同步 body 高，已在脚本里处理）

---

## 6. 渲染 / 交互 / 撤销的约束预埋（本 schema 已为其留好钩子）

- **渲染**：elements 按 z 排序 → 每元素一个 `position:absolute` 容器 → content 树挂进去。选中框 = 覆盖层（不进 content DOM）。
- **拖拽/八点缩放/旋转**：move 时位移向量按 `-rotation` 逆变换再写回 x/y/w/h（光标乱飞的解）。数据层只暴露 `updateElement(id, patch)`。
- **吸附**：拖拽时对其他元素的 x/y 边和中心线生成参考线，阈值 8px；数据层无需感知。
- **撤销**：对 `elements` 数组做快照栈（structuredClone），每次交互批次（pointerdown→pointerup）入栈一帧。比 backbone-undo 简单一个数量级，且天然全量可回滚。
- **AI 协议**：`insert_block` 在 canvas 页 = 追加 element（x=0, y=当前最底+40, w=stage.width, h=块默认高），然后照常走块模板纯函数生成 content。缺口日志/ACE/规则层零改动。

---

## 7. 待你评审的开放问题

1. **Stage 固定宽 1440** 可以吗？（主题换肤/苹果块目前按 1100~1440 设计，1440 是现状兼容值）
2. **叶子树两层封顶**够不够？现有 51 块里有更深的吗（表格/时间线待逐块核对，实现时如发现超深块，该块降级为"整块单叶"处理）
3. **text/shadow 简单元素的快捷样式字段**（fontSize/fontColor）要不要 v1 就砍掉，统一走覆盖表？（我倾向砍掉，少一套并行机制）
4. **canvas 页在页面管理里的图标/标识**：加个 🎨 角标区分两种页面？
5. 导出根缩放倍率 `Math.min(1, vw/1440)`：大屏（>1440）不放大、居中留白——同意吗？还是大屏也放大铺满？

---

*评审通过后：实现顺序 = 数据层（schema + 块模板纯函数 + 序列化器单测）→ 渲染层 → 交互层 → 吸附 → 接入 AI/页面管理/导出入口。*
