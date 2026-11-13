# PageForge MCP/AI 方案评估（v2 · 修订后复审）

> 评估对象：`PageForge-MCP-AI-方案.md`（v0.1 修订版，2026-11-13 19:44）
> 对照实现：`dsh-design-kit` v0.1.13（source 包）
> 评估方式：用 PageForge 真实块跑 kit 的 `init → plan → import → verify` 闸门 + 三宽实测 + 逐块内容槽能力测绘
> 本次新增：按修订版逐条复核，并补测了 4 项修订版未覆盖的约束
> 结论日期：2026-11-13

---

## 0. 一句话结论

**修订版通过。三个阻塞写进 §4.0、Phase -1 排在最前、§4.4 加了"rect + 裁剪祖先"——我上轮提的问题都改对了。**

但它仍然会**产出一个"闸门全过、视觉不可用"的池子**，因为还有 4 个约束没被写进去，其中一个是硬伤：

1. **360px 下三栏卡每张只有 90px，标题折 2–3 行**（kit 真实渲染宽度是 360×480，不是 390）。"不溢出"测不出来——它不溢出，只是挤成一坨。
2. **`foot` 槽全库只有 `pf-footer` 一个来源**；`bullet+meta` 只有 2 个块能给。方案的 contrast 三组合里 **2 个过不了内容槽**（实测）。
3. **换肤失效是 17 个块，不是 8 个**；5 个 hero 候选里 3 个（含 `pf-hero`、`pf-hero-img`）三主题零变化。
4. **没有任何单块能承载 ≥5/6 内容槽**，块组合是硬需求，不是风格选择。

前三条是文档里数字写错或没写；第四条是方案隐含假设错了。

---

## 1. 修订版核对结果

### 1.1 ✅ 改对了的

| 修订项 | 核对 |
|---|---|
| §4.0 A：canvas 页不能进候选池 | ✓ 与我实测一致，且补了"不要靠剥脚本混进去"这点比我说的更准 |
| §4.0 A：`overflow:hidden` 假通过 | ✓ 正确，我实测 `scrollWidth` 报 0 而实际 `h1Clipped:true` |
| §4.0 B：lineage 前先跑 theme coverage | ✓ 方向对，但**块数写错了**（见 §2.1） |
| §4.0 C：不能全局用 `/https?:\/\//` 判外链 | ✓ 比我建议的更彻底，改成属性级判定是对的 |
| §4.4：rect + 裁剪祖先，不依赖 scrollWidth | ✓ 正确修法 |
| Phase -1 排在最前 | ✓ 顺序对了 |
| §4.2 加了 theme coverage 前提 | ✓ |
| §9 改成"先修 Phase -1" | ✓ |

### 1.2 ⚠️ 仍未覆盖的（本次新发现）

---

## 2. 四个新发现

### 2.1 换肤失效是 17 块，不是 8 块

方案 §4.0 B 写"51 块里 8 个全部换肤失效"。实测 **17 个** `changed=0`：

```
换肤完全失效（5 主题下 HTML 完全相同）: 17 块
  pf-scroll-reveal, pf-carousel, pf-container, pf-spacer, pf-gallery,
  pf-grid-2, pf-grid-3, pf-grid-4, pf-breadcrumb, pf-anchor-nav,
  pf-image, pf-video, pf-hero, pf-hero-img, pf-card-glass,
  pf-quote-big, pf-category-icons

部分主题无区别: 3 块
  pf-announce(3/5), pf-hero-overlay(3/5), pf-nav-glass(3/5)

完全可换肤: 31 块
```

**最要命的是 hero 这一栏**——lineage 的主战场：

```
pf-hero              三主题唯一变体: 1/3  ✗ 不能用于 lineage
pf-hero-img          三主题唯一变体: 1/3  ✗ 不能用于 lineage
pf-hero-overlay      三主题唯一变体: 1/3  ✗ 不能用于 lineage
pf-section-split     三主题唯一变体: 3/3  ✓
pf-section-split-r   三主题唯一变体: 3/3  ✓
```

→ 方案 §4.2 的 lineage 策略（"同块组合 + 3 套主题 apple/flat/warm"）在**最常用的 3 个 hero 上直接不成立**。修完映射前，lineage 只能靠 `pf-section-split` 这类块，或改用结构差异。

### 2.2 内容槽有唯一来源，方案的 contrast 组合 2/3 过不了

实测各槽的可用来源：

| 槽 | 全库唯一/少数来源 | 实测 |
|---|---|---|
| `foot` | **只有 `pf-footer`** | 含 `©` 的块：仅 `pf-footer` 1 个 |
| `bullet`×3 + `meta`×3 | 只有 `pf-media-cards`、`pf-section-features` 2 个 | 同时能给 3+3 的块：仅这 2 个 |
| `title` 纯文本叶子 | 多个，但 `pf-hero` 的 h1 含 `<br>` 不可读 | 见下 |
| `cta` | 多个，但 `pf-cta-banner` 的被 `<span>` 包裹不可读 | 见下 |

按这个约束实测方案的三个 contrast 组合：

```
low:  pf-hero + pf-section-features + pf-footer              ✓ 内容槽可读
mid:  pf-hero-img + pf-media-cards + pf-cta-banner           ✗ 内容槽不可读（缺 foot）
high: pf-nav-glass + pf-carousel + pf-section-features       ✗ 内容槽不可读（缺 foot）
high: pf-nav-glass + pf-carousel + pf-section-features + pf-footer   ✓ 内容槽可读
```

**根因**：`foot` 槽只有 `pf-footer` 能给，方案 §4.2 的 mid/high 组合都没带 footer。

三个具体不可读的原因（都是"非纯文本叶子"）：

```
pf-hero 的 h1:          "让你的想法<br>大放异彩"      ← 含 <br>
pf-cta-banner 的 h2/a:  <span data-pf-slot="title">   ← 被 span 包裹
pf-footer 的版权行:     <div>© 2026 <span>…           ← div + 内嵌 span
```

→ **§4.2 的每个组合都必须显式包含 `pf-footer`**。建议在方案里写成硬规则：`compose_bundle` 的每个候选必须 `hasSlot(foot)`，否则直接拒绝。

### 2.3 硬伤：360px 下三栏卡挤成竖排（"不溢出"测不出来）

**kit 的真实渲染宽度是 360×480，不是方案里写的 390。** 源码核实：

```
templates/shortlist.html:  .cand { width: 360px; }  iframe { width: 360px; height: 480px; }
templates/shortlist-final.html: 同上
```

按 360px 实测我生成的 12 页：**0/12 溢出**。看起来全过。但量到具体元素：

```
360px 下三栏特性卡:
  grid 列宽: 90.66px / 90.67px / 90.66px
  "三分钟成页" 卡片宽 43px → 折 3 行
  "所见即所得" 卡片宽 43px → 折 3 行
  "一键导出"  卡片宽 43px → 折 2 行
```

截图（`shots/feature-cards-360.png`）确认：三张卡挤在一行，每张 90px，标题竖着排。

**这是方案 §4.4 验收条件的一个漏洞**：`getBoundingClientRect()` + 裁剪祖先只能抓"超出边界"，抓不到"挤到不可读"。三栏块在 360px 下不溢出，但已经不是三栏了。

→ 建议 §4.4 补一条**可读性断言**，而不只是溢出断言：
- 每个 `bullet`/`meta` 叶子的渲染宽度 ≥ 内容槽 min-width（比如 3 个中文字 × 字号）；
- 或更简单：`bullet` 的 `rect.height / lineHeight ≤ 2`（最多折 2 行）。
- `pf-section-features` / `pf-media-cards` 在 360px 下应该**降级成单列堆叠**，而不是硬挤三栏。这需要给这两个块加 `@media (max-width: 480px)` 的响应式规则——**当前 51 个块里一个 `@media` 都没有**。

### 2.4 没有单块能承载 ≥5/6 内容槽 → 块组合是硬需求

逐块测绘 51 个块对 6 个槽的覆盖能力，**最高只有 4/6**：

```
pf-section-features   4/6  (T S B3 M3 - -)
pf-media-cards        4/6  (T S B3 M4 - -)
0 个块达到 5/6 或 6/6
```

这印证了"块组合"是对的，但也说明：**不能指望某个 starter/块天然满足 design-kit 的内容契约**，必须由 `compose_bundle` 主动拼装 + 注入 `data-slot`。方案 §4.1 的映射表是"字段级"的，缺了"块级"这一层（哪个块负责哪个槽、缺槽怎么补）。

顺便：`contrast` 用的三档组合需要**装饰密度**真的分得开。实测可用的装饰梯度：

| 块 | 装饰强度 |
|---|---|
| `pf-hero` | 无装饰（纯文字居中） |
| `pf-hero-img` | 一张大图 |
| `pf-hero-overlay` | 大图 + 渐变遮罩 |
| `pf-section-features` | 3 个浅底卡片 |
| `pf-media-cards` | 3 张带阴影卡片 |
| `pf-carousel` | 3 图淡入动画 |
| `pf-nav-glass` | 毛玻璃条 |

够分 low/mid/high，但**`pf-carousel` 是换肤失效 + 带 `<style>` 动画**的，进池要单独审。

---

## 3. 方案需要补的 4 条

### 3.1 §4.4 加可读性断言（最高优先）

```diff
- 390/768/1440 三宽预览不溢出（至少 390 和 1440）
+ 360/768/1440 三宽预览（360 = kit iframe 真实宽度）：
+   a) 无元素超出裁剪边界（rect + 裁剪祖先）
+   b) 内容槽叶子可读：bullet/meta 的 rect.height / lineHeight ≤ 2（最多折 2 行）
+   c) 三栏块在 360 下必须降级为单列（需先给块加 @media）
```

### 3.2 §4.2 每个组合强制带 footer

```diff
- low：pf-hero + pf-section-features + pf-footer
- mid：pf-hero-img + pf-media-cards + pf-cta-banner
- high：pf-nav-glass + pf-carousel + pf-section-features
+ 每个候选 = 导航(可选) + hero + bullet块 + (配件) + footer(必需)
+ 硬规则：hasSlot('foot') 为 false 直接拒绝，foot 只有 pf-footer 能给
```

### 3.3 §4.0 B 数字修正 + Phase -1 加一条

- "8 个换肤失效" → **17 个 changed=0，3 个部分失效**（清单见 §2.1 本文）。
- Phase -1 加第 4 项：**给 `pf-section-features` / `pf-media-cards` / `pf-pricing` 加 `@media (max-width: 480px)` 单列降级**。当前 51 块零媒体查询，这是 360px 可读性的前置条件。

### 3.4 §4.1 补"块级"映射表

字段级映射（title↔pf-hero.title）不够用，需补：

| 槽 | 唯一/少数来源 | 缺失时的处理 |
|---|---|---|
| `foot` | `pf-footer`（唯一） | **必需块**，缺则拒绝 |
| `bullet`×3 + `meta`×3 | `pf-section-features` / `pf-media-cards` | 二选一，必需 |
| `title` | 多个（但 `pf-hero` 的含 `<br>` 不可读） | 注入时替换为纯文本叶子 |
| `cta` | 多个（`pf-cta-banner` 的被 span 包裹） | 注入时替换为纯文本叶子 |

---

## 4. 仍然正确的判断（保留）

- §0 "不要把 PageForge 做成 MCP 聊天服务" —— 全篇最重要的一句。
- §4.0 A 的"canvas 一律 `candidateEligible=false`" —— 比我上轮建议更果断，对的。
- §4.0 C 的"按属性判外链 + allowlist xmlns" —— 比我建议的"剥 xmlns"更正确。
- Phase -1 → Phase 0 → Phase 1 的顺序。
- §10 五个决策我的推荐不变：stdio / 只返 HTML+溢出报告 / 交给 Host / `compose_bundle` 高层 / 禁止 `pf-video`。

---

## 5. 结论

**修订版可以照做，前提是补上 §3 那 4 条。**

优先级排序（我的建议）：

| 顺序 | 事项 | 理由 |
|---|---|---|
| 1 | 给三栏块加 `@media` 单列降级 | 否则 360px 候选全是竖排卡片，用户看到就会删光 |
| 2 | 修主题映射（P1，17 块） | lineage 策略的前提 |
| 3 | `compose_bundle` 加 footer 硬规则 | 否则 2/3 组合过不了内容槽 |
| 4 | §4.4 加可读性断言 | 否则"闸门全过但视觉不可用" |
| 5 | 属性级外链检查 + xmlns allowlist | 素材面板可用性 |
| 6 | 然后才是 Phase 0 / MCP | — |

**最核心的一句判断不变**：PageForge 在粗选环节的价值是"响应式块库 + 主题系统 + 内容槽映射"，不是 canvas 画布。而现在这块库**还没有真正响应式**（零 `@media`）、**主题也换不动**（17 块失效）。这两件事修完，"响应式块库"这个价值主张才成立。

---

## 附：本次验证脚本

`%TEMP%\pfspike\`：

| 脚本 | 作用 | 本轮新增 |
|---|---|---|
| `spike3.mjs` | 真实块 → 12 页 → 全链路闸门 | |
| `spike4-360.mjs` | 360/768/1440 三宽溢出 | ✓ 改用 kit 真实 360 |
| `slotcaps.mjs` | 51 块 × 6 槽能力测绘 | ✓ |
| `coverage.mjs` | 51 块 × 5 主题换肤覆盖 | ✓ |
| `combocheck.mjs` | 方案 §4.2 三组合逐一验证 | ✓ |
| `lines.cjs` | 360px 下文字折行行数 | ✓ |
| `diversity.mjs` | 结构组合空间 + hero lineage 可用性 | ✓ |

截图：`shots/feature-cards-360.png`（360px 三栏挤成竖排的铁证）
