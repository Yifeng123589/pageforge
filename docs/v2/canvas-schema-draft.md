# PageForge v2 · Canvas 页 JSON 规范（v1.0 · 已评审，实现基线）

> 状态：**已评审通过（2026-09-10），作为实现基线**。
> 评审结论：D1 确认允许元素超出 stage（导出高度取 max）；Q1–Q7 全部按本文件建议执行。
> 落地形态：`editor-v2.html` 独立入口（v1 完全不动），垂直切片先行。
>
> 核心决策回顾：双模式共存（flow 页 = 现有 GrapesJS 原样；canvas 页 = 新四模块），canvas 页导出用
> **绝对定位 + 根节点等比缩放**（不做布局编译器），内容用**受限 HTML 叶子 + 样式覆盖表**（不是字符串黑盒）。

---

## 0. 设计原则（五条，改动需重审）

1. **双模式共存**：`Page.layoutMode: 'flow' | 'canvas'`，新建页面二选一，一个站点可混排。
2. **顶层自由、内部流式**：元素外层绝对定位（Keynote 手感），元素内容是受限 HTML（保留 grid 等流式排版）。
3. **内容不是黑盒**：文字叶子带 `data-id`，样式面板写"覆盖表"，导出时才合并成内联样式。
4. **导出即缩放**：canvas 页导出 = 编辑器画布的 1:1 HTML + 一行等比缩放 JS，放弃响应式是模式定义而非缺陷。
5. **AI 层零耦合**：块目录/槽位/缺口日志不变；canvas 页只新增一个"放置策略"。

---

## 1. 顶层结构

```ts
interface SiteDocument {
  app: 'PageForge';
  version: 2;
  title: string;
  desc: string;
  meta: { favicon?: string; og?: string };
  pages: PageDocument[];          // flow 页与 canvas 页可混排
}

interface PageDocument {
  id: string;                     // 'pg_' + nanoid
  name: string;                   // 显示名（导航/锚点用）
  layoutMode: 'flow' | 'canvas';
  // —— canvas 页专属 ——
  stage: { width: number; height: number; background: string };
  //   设计基准尺寸，如 1440×900。导出时按此尺寸输出，浏览端等比缩放。
  elements: CanvasElement[];
  // —— flow 页专属（v1 原样，不做任何改造）——
  //   GrapesJS project data 存于既有位置，此处不重复定义。
}
```

**决策记录 D1**：`stage.height` 是否允许超出（元素拖到 stage 外）？→ 允许，导出时 stage 高度取
`max(stage.height, max(el.y + el.height))`。画布"往下长"与 v1 习惯一致。

---

## 2. CanvasElement（元素）

```ts
type ElementType =
  | 'footer' | 'features3' | 'cta' | 'hero' | 'card'    // 结构块（来自 51 块的 canvas 适配版）
  | 'text' | 'image' | 'shape'                          // 基础元素
  ;  // 白名单封闭，新增类型需改本文件

interface CanvasElement {
  id: string;                     // 'el_' + 6位随机
  type: ElementType;
  x: number;                      // 左上角，stage 坐标系，px，可为负（拖出边界）
  y: number;
  width: number;                  // px，>= 40
  height: number;                 // px，>= 40（决策 D2：不做 auto，内容溢出由渲染层画警告描边）
  z: number;                      // 渲染 = z-index；置于顶层/底层 = 重排 z
  rotation: number;               // 度，顺时针，默认 0
  opacity: number;                // 0–1
  locked: boolean;                // 锁定后不可拖拽/选中（可在图层列表解锁）
  style: Record<string, string>;  // 容器自身样式：background / border / borderRadius / padding / boxShadow
  html: string;                   // 受限 HTML（见 §3），只含白名单标签与 data-id
  overrides: Record<string, Record<string, string>>;
  //   样式覆盖表：data-id → CSS 声明对象。样式面板写这里；导出时合并进对应叶子的内联样式。
}
```

**决策记录 D2**：`height` 固定 px，不支持 'auto'。理由：auto 引入运行时测量（渲染层和导出层各测一次，
两处结果可能不一致）。内容溢出的处理：渲染层给元素画琥珀色虚线描边 + 悬浮提示"内容超出，调大高度或精简"。

---

## 3. 受限 HTML 内容规范

| 项目 | 规则 |
|---|---|
| 标签白名单 | `section div p h1–h6 span a img strong em ul li` |
| 属性白名单 | `style` `href` `src` `alt` `data-id` |
| 禁止 | `<style>` `<script>` `class`（canvas 页内不使用 class，样式 = 内联 + 覆盖表） |
| data-id 约定 | **每个含文字或可独立换肤的叶子必须带**：`h*`（标题）`p*`（正文）`a*`（链接）`img*`（图片） |
| 富文本 | 叶子内部允许 `<strong> <em> <br>`（不引入 text-run 树，v2.1 再议） |

**为什么这样就解决了硬伤一**：样式面板改"p_brand 的颜色"= 写 `overrides['p_brand'].color = '#fff'`，
纯数据操作，不 parse 字符串；双击编辑 = 只把该叶子 `contenteditable`，blur 时只提交该叶子的
`innerHTML`（白名单过滤后），外部其他元素零重绘。

---

## 4. 三个真实块样例（与现有 51 块一一对应）

### 4.1 页脚（对应块 `pf-footer`，AI 槽位 brand/intro 原样保留）

```json
{
  "id": "el_a3f9k2",
  "type": "footer",
  "x": 120, "y": 640, "width": 1200, "height": 190,
  "z": 3, "rotation": 0, "opacity": 1, "locked": false,
  "style": { "background": "#0d0d0f", "borderRadius": "16px", "padding": "40px 48px" },
  "html": "<div style=\"display:grid;grid-template-columns:2fr 1fr 1fr;gap:40px;align-items:start;\"> <div> <p data-id=\"p_brand\" style=\"color:#ffffff;font-size:20px;font-weight:800;margin:0 0 10px;\">你的品牌</p> <p data-id=\"p_intro\" style=\"color:#a1a1aa;font-size:14px;line-height:1.7;margin:0;\">一句话介绍你的产品，让访客知道你是做什么的。</p> </div> <div> <p data-id=\"p_l1\" style=\"color:#e4e4e7;font-size:14px;font-weight:700;margin:0 0 8px;\">产品</p> <p data-id=\"p_l2\" style=\"color:#a1a1aa;font-size:14px;margin:0 0 6px;\">功能</p> <p data-id=\"p_l3\" style=\"color:#a1a1aa;font-size:14px;margin:0;\">价格</p> </div> <div> <p data-id=\"p_l4\" style=\"color:#e4e4e7;font-size:14px;font-weight:700;margin:0 0 8px;\">公司</p> <p data-id=\"p_l5\" style=\"color:#a1a1aa;font-size:14px;margin:0 0 6px;\">关于我们</p> <p data-id=\"p_l6\" style=\"color:#a1a1aa;font-size:14px;margin:0;\">联系</p> </div> </div> <p data-id=\"p_copy\" style=\"color:#71717a;font-size:13px;margin:24px 0 0;padding-top:20px;border-top:1px solid #27272a;text-align:center;\">© 2026 你的品牌. All rights reserved.</p>",
  "overrides": {}
}
```

> 注意：grid 留在元素**内部**——内部流式正是双模式的意义。AI 填槽映射（块定义里补一张表）：
> `brand → p_brand, p_copy`（p_copy 为模板槽，替换品牌时两处同改）`intro → p_intro`。

### 4.2 三栏特性区（对应块 `pf-section-features`，AI 槽位 title/sub/items 原样保留）

```json
{
  "id": "el_b7q2m8",
  "type": "features3",
  "x": 120, "y": 200, "width": 1200, "height": 380,
  "z": 2, "rotation": 0, "opacity": 1, "locked": false,
  "style": { "padding": "56px 48px", "background": "#ffffff", "borderRadius": "16px" },
  "html": "<h2 data-id=\"h_title\" style=\"text-align:center;font-size:36px;font-weight:800;letter-spacing:-0.5px;margin:0 0 10px;color:#111827;\">功能特性</h2> <p data-id=\"p_sub\" style=\"text-align:center;font-size:17px;color:#6b7280;margin:0 0 40px;\">三栏介绍你的核心功能。</p> <div style=\"display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;\"> <div style=\"padding:24px;border-radius:14px;background:#f5f5f7;\"> <h3 data-id=\"h_c1\" style=\"margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;\">极速</h3> <p data-id=\"p_c1\" style=\"margin:0;font-size:14.5px;line-height:1.65;color:#6b7280;\">秒开页面，极致性能。</p> </div> <div style=\"padding:24px;border-radius:14px;background:#f5f5f7;\"> <h3 data-id=\"h_c2\" style=\"margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;\">安全</h3> <p data-id=\"p_c2\" style=\"margin:0;font-size:14.5px;line-height:1.65;color:#6b7280;\">端到端加密。</p> </div> <div style=\"padding:24px;border-radius:14px;background:#f5f5f7;\"> <h3 data-id=\"h_c3\" style=\"margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;\">省心</h3> <p data-id=\"p_c3\" style=\"margin:0;font-size:14.5px;line-height:1.65;color:#6b7280;\">全自动备份。</p> </div> </div>",
  "overrides": {}
}
```

> items 槽映射：`items[0] → h_c1 + p_c1`，`items[1] → h_c2 + p_c2`，`items[2] → h_c3 + p_c3`。

### 4.3 渐变行动横幅（对应块 `pf-cta-banner`，AI 槽位 title/sub/btn 原样保留）

```json
{
  "id": "el_c9x4p1",
  "type": "cta",
  "x": 120, "y": 60, "width": 1200, "height": 240,
  "z": 1, "rotation": 0, "opacity": 1, "locked": false,
  "style": { "padding": "56px 48px", "background": "linear-gradient(135deg,#eef2ff 0%,#ffffff 100%)", "borderRadius": "16px", "textAlign": "center" },
  "html": "<h2 data-id=\"h_title\" style=\"font-size:40px;font-weight:800;letter-spacing:-0.5px;margin:0 0 12px;color:#111827;\">现在就开始</h2> <p data-id=\"p_sub\" style=\"font-size:17px;color:#6b7280;margin:0 0 28px;\">几分钟就能拥有一个漂亮的页面。</p> <a data-id=\"a_btn\" href=\"#\" style=\"display:inline-block;background:#4f46e5;color:#ffffff;padding:13px 32px;border-radius:999px;font-size:16px;font-weight:600;text-decoration:none;\">立即开始</a>",
  "overrides": {}
}
```

> 槽位映射：`title → h_title, sub → p_sub, btn → a_btn`。
> 三个样例叠放后即为一张完整的 canvas 页（stage 1440×900：CTA 在顶、三栏在中、页脚在底）。

---

## 5. 导出契约（canvas 页）

```html
<body style="margin:0;background:#e5e5e5;">
<div id="pf-stage" style="position:relative;width:1440px;height:900px;margin:0 auto;background:#ffffff;overflow:hidden;transform-origin:top center;">
  <!-- 每个元素： -->
  <div style="position:absolute;left:120px;top:640px;width:1200px;height:190px;z-index:3;
              transform:rotate(0deg);opacity:1;background:#0d0d0f;border-radius:16px;padding:40px 48px;">
    <!-- html（overrides 已合并进对应 data-id 叶子的内联样式） -->
  </div>
  <!-- …其余元素… -->
</div>
<script>
(function(){var s=document.getElementById('pf-stage');function f(){s.style.transform='scale('+Math.min(1,document.documentElement.clientWidth/1440)+')';}addEventListener('resize',f);f();})();
</script>
</body>
```

- **合并规则**：叶子的最终 style = 解析(原 style) + overrides[data-id]（覆盖表胜出），序列化回内联。
- **缩放规则**：只缩 `#pf-stage` 容器，桌面 ≥1440 显示原尺寸，小屏等比缩小。文字随之变小——这是模式 A 的定义。
- flow 页导出走现有管线，两种页可在一次导出中混排（见开放问题 Q4）。

---

## 6. AI 层衔接（零改动清单 + 一个新增）

| 模块 | 是否改动 | 说明 |
|---|---|---|
| 块目录 / 规则层 / insert_block 协议 | ❌ 零改动 | 不变 |
| 槽位定义 | ➕ 每块补一张映射表 | `slots → data-id`（见 §4 示例注释），AI 填槽时按表写入对应叶子 |
| 缺口日志 / ACE 桥 / 多模型 | ❌ 零改动 | 不变 |
| 新增 | **放置策略** | canvas 页收到 insert_block 时：默认放 stage 内第一个纵向空档（扫描已占 y 区间），用户再拖到位 |

---

## 7. 开放问题（评审时需要你拍板）

| # | 问题 | 我的建议 |
|---|---|---|
| Q1 | `height` 固定 px（D2）还是支持 auto？ | v1 固定；auto 引入测量不一致问题 |
| Q2 | stage 尺寸：固定 1440×900 还是多预设（1920 宽 / 390 手机竖版海报）？ | 建两张预设起步：`演示 1440×900`、`海报 1080×1440`；画布尺寸可调但改尺寸不缩放已放元素 |
| Q3 | 叶子内富文本边界：允许 strong/em/br（建议允许），还是纯文本？ | 允许三样，够 90% 场景 |
| Q4 | 混排导出：flow 页与 canvas 页在同一站点时，导航锚点跳转跨模式如何处理？ | v1：canvas 页导航链接只跳 flow 页/外链，不做跨模式锚点；v2.1 再做 |
| Q5 | 图片：img 用 base64 内嵌还是 URL？ | 沿用素材库现状（base64 内嵌，离线可用） |
| Q6 | 撤销粒度：每次拖拽结束 = 一帧全量 snapshot（建议，200 帧上限）还是 op-based？ | v1 全量 snapshot——canvas 页数据小（单页 <100KB），实现简单且天然支持"AI 操作=单撤销单元" |
| Q7 | 51 块里哪些进 canvas 首批？ | 页脚 / 三栏特性区 / CTA / 大标题区 / 媒体卡片（5 个，覆盖演示+落地页主力） |

---

## 8. 评审通过后的实施顺序（预告，不在本草案范围）

1. `editor-v2.html` 独立入口（v1 完全不动）
2. 数据层模块（类型 + 读写 + 校验）→ DOM 渲染层 → DragManager/选择/八点缩放 → 吸附参考线
3. 叶级文本编辑 + snapshot 撤销
4. JSON→HTML 序列化导出（等比缩放）
5. 块协议层接入（放置策略 + 槽位→data-id 填槽）
