# PageForge MCP/AI 方案评估

> 评估对象：`PageForge-MCP-AI-方案.md` v0.1 (2026-11-13)
> 对照实现：`dsh-design-kit` v0.1.13（source 包）
> 评估方式：不读文档下判断，直接用 PageForge 真实块跑 kit 的 `init → plan → import → verify` 闸门 + 390/768/1440 三宽实测
> 结论日期：2026-11-13

---

## 0. 一句话结论

**方向对，可以做。但方案里有两处前提是错的，必须先修，否则 `compose_bundle` 只能产出"过闸门但视觉不可信"的页面。**

方案的技术判断（工具化、不调模型、validate 闭环、先做 compose_bundle 再谈 MCP）全部成立，且已被实测支持。
错的是两处**没被验证的实现假设**：

1. **候选池不能用 canvas 页**（方案全篇没说清导出哪种页，而 canvas 导出天生进不了池）。
2. **主题映射对新苹果块已失效**（打掉方案 §4.2 里 "lineage = 同块 + 3 套主题" 这条主线的一半）。

---

## 1. 实测证据

### 1.1 ✅ 链路能通：真实块 12 页过全部闸门

用 `src/blocks.js` 的真实块 HTML（`pf-hero` / `pf-hero-img` / `pf-nav-glass` / `pf-section-features` / `pf-media-cards` / `pf-section-split` / `pf-carousel` / `pf-cta-banner` / `pf-footer`）+ `src/themes.js` 换色，拼 6 种组合 × 5 主题，产出 12 页：

```
=== import ===  已导入外部池 12/12   writer: external · skill: pageforge
=== verify ===
  ✔ 轮次/候选/上限符合 4×3=12 与待定 3
  ✔ 每轮关系成立且 HTML 互不相同
  ✔ 候选与页面 HTML 的 sha 一致、无外链且未被篡改
  ✔ 外部池来源、12 页、内容槽与关系一致
  ✔ 决策与候选一一对应、轮次连续、每轮待定 ≤1
  ✔ 待定数正确且 ≤3
  ✔ 收口产物与状态一致
结论: 通过
```

**这是最重要的正面结论：方案 §9 的最小可交付链路是真的能跑通的**，不是纸面推演。

### 1.2 ❌ canvas 页导出不能进候选池（方案盲点）

`src/v2/export-canvas.js` 的导出形态是 **1440 定宽 stage + `<script>` 等比缩放**。实测：

| 检查项 | 结果 |
|---|---|
| 含 `<script>` | **是** → kit `EXTERNAL_PATTERNS` 直接拒绝 |
| 去掉脚本后 390px | `stageW: 1440` / `wrapW: 374` / `h1Right: 1448` / **`h1Clipped: true`** |
| 溢出检测 | `overflow: hidden` 掩盖了裁切，`scrollWidth` 报 **0 溢出（假象）** |

**关键风险**：`overflow:hidden` 会让"三宽不溢出"这条验收条件**假通过**。方案 §4.4 把"390/1440 预览不溢出"当硬闸门，而 canvas 路径会用裁切骗过它——内容右半截被切掉，检测却显示无溢出。

→ **候选池必须走 flow 页（响应式块直接输出），不能走 canvas 页。** 方案需要显式写明这一点，否则实现者会自然地去调 `export_html` 的 canvas 分支。

### 1.3 ⚠️ 主题映射对新苹果块已失效（真 bug，不只是对接问题）

`themes.js` 的 `map` 只认旧 indigo/slate 色板。新苹果块用的是 `#1d1d1f` / `#6e6e73` / `#2997ff` / `#86868b`，**全都不在映射表里**：

```
pf-hero              apple:未变  warm:未变  neon:未变  dark:未变    ← 完全换不动
pf-nav-glass         apple:未变  warm:未变  neon:变1处  dark:变1处
pf-cta-banner        apple:未变  warm:变2处  neon:变3处  dark:变3处
pf-section-split     apple:未变  warm:变2处  neon:变2处  dark:变2处
pf-section-features  apple:未变  warm:变3处  neon:变3处  dark:变3处
pf-media-cards       apple:变8处  warm:变8处  neon:变8处  dark:变8处   ← 只有它正常
```

按色板归类 51 个块：

| 类别 | 数量 | 影响 |
|---|---|---|
| 用旧色板（可换肤） | 25 | 正常 |
| **用新苹果色（换肤失效）** | 8 | `pf-hero` `pf-hero-img` `pf-nav-glass` `pf-card-glass` `pf-breadcrumb` `pf-anchor-nav` `pf-quote-big` `pf-category-icons` |
| 新旧混用 | 6 | 部分换色，产生脏配色 |
| 无 hex / 无映射 | 12 | — |

**后果**：方案 §4.2 的 lineage 策略是 "同一块组合 + 3 套主题（apple/flat/warm）"。但 `pf-hero` + `pf-hero-img` + `pf-nav-glass` 恰好是这套策略的主力块，而它们**换主题后完全不变** → 3 个"不同世界"其实是同一张页，`htmlSha` 相同会被 kit 当重复拒绝（§1.4 已实测到这个失败）。

→ 这不是设计问题，是 `themes.js` 缺映射的 bug。**优先修**，而且修完 D1 那 12 块才算真正"可换肤"。

### 1.4 ⚠️ 12 页唯一性是硬约束，且很脆

同 `(块组合, 主题)` 对产出 **byte 级相同**的 HTML。实测踩到：

```
=== import ===  ✗ 失败：候选 HTML 跨轮重复：r3p3
```

kit 要求整池 12 页互不相同。所以 **12 页必须是 12 个不同的 `(组合 × 主题)` 对**。6 组合 × 5 主题 = 30 种，够用，但没有余量做"同组合换主题"的 lineage 表达——而那正是方案 §4.2 想要的。

→ lineage 轮要么靠**组合差异**（不是主题差异），要么先修 §1.3 让主题真的能换。

### 1.5 ⚠️ 内联 SVG 被误杀（素材面板全挂）

`EXTERNAL_PATTERNS` 里有 `/https?:\/\//i`，而内联 SVG 的 `xmlns="http://www.w3.org/2000/svg"` 正好命中：

| 形态 | 闸门 |
|---|---|
| 内联 `<svg xmlns="http://...">` | ✗ **拒绝** |
| base64 dataURL（`data:image/svg+xml;base64,...`） | ✓ 通过 |
| `data:image/svg+xml,` 明文 | ✓ 通过 |

→ 素材面板 39 个图标全是内联 SVG，**直接进不了候选池**。修法：导出候选页时剥掉 `xmlns`，或统一转 base64。方案 §4.3 提到了这点，但低估了影响面（它说的是"可去掉命名空间"，实际是"必须"，否则素材面板整个不可用）。

### 1.6 ⚠️ 内容槽是硬约束，逐块映射工作量被低估

kit 的 `readContentSlots` 要求：`<title>` 必须等于主标题、恰好 3 条 `bullet` + 3 条 `meta`、**只认纯文本叶子**。实测踩坑：

| 坑 | 现象 | 修法 |
|---|---|---|
| `pf-footer` 版权行是嵌套结构（含 `<span>`） | `foot: null` → 内容槽不可读 | 替换成纯文本 `<p data-slot="foot">` |
| `pf-footer` 的简介也命中 meta 正则 | `metas: 4 条` → 判定失败 | 只给三栏特性/媒体卡打 meta |
| `pf-section-split` 没有三栏 | `bullet/meta 应 3 组，实际 0` | 组合里必须补一个三栏块 |
| `pf-media-cards` 是 `<h3>` 在 `<p>` 之后 | 顺序与 features 相反 | 两套正则，或统一改块结构 |
| `pf-carousel` / `pf-hero-overlay` 无文本槽 | 不可读 | 不能单独成页，只能做配件 |

→ 方案 §4.1 的映射表只写了"哪个槽对应哪个字段"，没写"哪些块根本进不了池"。**建议加一列 `inPool: yes/no`**：51 块里真正能承载内容槽的大约 12–15 个，其余是配件。

---

## 2. 方案需要改的地方

### 2.1 加一条硬规则（最高优先）

> **候选页必须由 flow 模式（响应式块直出）生成，禁止用 canvas 页导出。**
> 判据：候选 HTML 不含 `.pf-canvas-stage`、不含 `<script>`、带 `<meta name="viewport">`。
> 溢出检测必须在 `overflow: visible` 下做，禁止被 `overflow:hidden` 掩盖。

这条不写清楚，实现者一定会走 canvas 分支，然后得到一个"闸门全过、内容被裁一半"的池子。

### 2.2 前置修复项（不进 MCP 也要修）

| # | 项 | 理由 |
|---|---|---|
| P1 | `themes.js` 补新苹果色板映射 | 8 个块换肤失效；直接打掉 lineage 策略 |
| P2 | 候选导出剥 `xmlns` / 转 base64 | 素材面板否则完全不可用 |
| P3 | `buildBlockHTML` 抽离 DOMParser | 方案 §6 Phase 0 已提；实测 Node 下确实跑不了，只能用正则绕 |

P1 和 P2 是**做这个方案的前提**，不是方案的一部分。建议先做，再谈 MCP。

### 2.3 修订 §9 最小可交付

原方案：`blocks.list` → `pages.create` → `pages.apply_ops` → `pages.validate` → `shortlist.compose_bundle`

实测后建议改成：

```
① 修 P1/P2/P3
② src/service/{catalog,compose,slots,validate}.mjs   ← 纯函数，Node 可跑
③ compose_shortlist_bundle（CLI 先跑通，不急着 MCP）
④ 验收：12 页过 import + verify + 三宽真溢出检测
⑤ 再做 MCP server 包一层
```

**`compose_bundle` 应该是一个纯函数 + CLI，MCP 只是它的一个 transport。** 方案已经这么想（§2.1 边界原则），但 §9 把它排在 MCP 工具之后，顺序反了。先有纯函数，MCP 是几行包壳；先做 MCP，纯函数会被协议形状绑死。

---

## 3. §10 五个决策的推荐

| # | 问题 | 推荐 | 理由 |
|---|---|---|---|
| 1 | transport | **先 stdio** | 本地进程、无鉴权面、Host 直接起子进程。HTTP/SSE 等真有远程 Host 再说。 |
| 2 | 渲染 | **Phase 1 只返回 HTML + 三宽溢出报告** | 溢出是硬闸门且比 PNG 便宜 100 倍；PNG 延后到确认有需要。**注意 §1.2：溢出检测必须在 visible 下做。** |
| 3 | AI 面板 | **交给 Host**，BYOK 降级为"无 Host 时的本地模式" | 方案 §5.2 结论正确，照做。编辑器内 AI 与 Host 共用 `tool-client.mjs`。 |
| 4 | design-kit 对接 | **`compose_bundle` 高层工具** | 逐页 `apply_ops` 会让 Host 承担闸门知识（内容槽一致性、12 页唯一性、关系合法性），这些是确定性逻辑，不该让模型每次重新推理。 |
| 5 | `pf-video` / 外链块 | **禁止** | 含 YouTube iframe，实测定为 `safe:false`。 |

---

## 4. 方案里判断正确、值得保留的部分

- §0 "不要把 PageForge 做成 MCP 聊天服务" —— 完全正确，这是全篇最重要的一句。
- §1.2 的 7 条病因 —— 与实测一致。尤其"没有验证闭环"和"只有 12/51 块有 AI 元数据"。
- §2.1 边界原则 —— 工具确定性、AI 在 Host、生成必须过 validate。
- §5.4 视觉反馈是质量最大杠杆 —— 对，但要按 §2 里修订后的顺序做。
- §7 风险表里的 "桌面 1440 vs 候选 390" —— 已经识别到，只是没意识到 canvas 路径会**假通过**。

---

## 5. 结论

**可以做，方向对，但先把 P1/P2/P3 三个前置修完，再按修订后的 §9 顺序做。**

最大的判断是这一条：**PageForge 在粗选环节提供的价值是"响应式块库 + 主题系统 + 内容槽映射"，不是 canvas 画布。** 方案需要明确区分这两条产出路径——canvas 是终选后的精修场地，flow 页才是粗选候选的来源。这一点写清楚，整个方案就顺了。

---

## 附：本次验证的可复跑脚本

全部在 `%TEMP%\pfspike\`：

| 脚本 | 作用 |
|---|---|
| `spike3.mjs` | 真实块 → 12 页 → `init/plan/import/verify` 全链路 |
| `spike4.mjs` | 390/768/1440 三宽溢出实测（含 viewport meta A/B） |
| `themetest2.mjs` | 51 块按色板归类，找换肤失效块 |
| `svgtest.cjs` | 内联 SVG / base64 / 明文 dataURL 过闸门对比 |
| `canvastest2.cjs` | canvas 导出形态过闸门（验证 `<script>` 拒绝） |
| `clip.cjs` | 证明 canvas 页 390px 是裁切而非适配 |

截图：`%TEMP%\pfspike\shots\`（8 页 × 2 宽）
