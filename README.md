# PageForge · 可视化网页设计器

> 拼乐高一样做网页：拖块、AI 帮拼、一键导出 HTML——不用写一行代码。

![开屏](docs/shots/welcome.png)

**PageForge** 是一个面向非程序员的中文可视化网页编辑器：左侧 51 个现成组件块，中间画布拖拽拼装，右侧即时改样式，AI 助手能听懂"加个页脚""整页换配色"并直接动手。做完一键导出**独立的单文件 HTML**，放哪都能打开，零锁定。

![编辑器](docs/shots/editor-guide.png)

## 在线试用

- **流式编辑器（v1）**：https://yifeng123589.github.io/pageforge/
- **自由画布（v2）**：https://yifeng123589.github.io/pageforge/editor-v2.html

不填 API Key 也能用全部本地编辑功能。要用 AI，点右上角 ⚙ / AI 助手设置，填一次 Key（推荐免费的智谱 `glm-4-flash`）。Key 与页面数据都只存在本浏览器，换浏览器需重填；AI 请求发往你自己填的服务商。

## 特性

- 🧱 **51 个组件块**：布局 / 内容 / 表单 / 定价表 / 时间线 / 苹果风设计块 / 电商块，拖进画布即用
- 🤖 **AI 三级拼装管线**（省 token 的关键设计）：
  1. 规则层零 token 直取——"加个页脚"类高频请求不调用模型
  2. 模型按块目录选块填槽（~30 token）——不写 HTML，样式永远是库里调好的
  3. 目录没有才自由生成，自动记入缺口日志供模块库进化
- 🌐 **多模型适配**：DeepSeek / 智谱 GLM（有免费模型）/ Kimi / 通义 / 硅基流动 / OpenAI / 自定义端点，OpenAI 兼容协议一键切换
- 🎨 **智能配色 + 一键换肤**：5 套主题皮肤、AI 配色生成、对比度自动修正
- 📄 **多页面**：站内锚点跳转，一键导出整站
- 🗂 **模板库 + 素材库**：起步模板、39 图标 + 22 插画 + 文案库，全部离线内置
- 📤 **单文件导出**：独立 HTML、favicon + Open Graph 分享卡，发微信有预览
- 🖥 **三种形态**：在线网页版 / 桌面 exe（免安装）/ 本地 dev

## 快速开始

**方式一（最简单）**：打开上面的[在线试用](#在线试用)，或下载 `PageForge.exe` / `PageForge.html`（浏览器直接打开）。

**方式二（开发模式）**：

```bash
npm install
npm run dev        # 打开 http://localhost:5173 （画布版：/editor-v2.html）
npm run regression # 端到端回归（自起 headless 浏览器，当前 127 项）
```

### 配置 AI（可选）

点编辑器右上角 **⚙**，选服务商、填 API Key。推荐**智谱 GLM** 的 `glm-4-flash-250414`——[免费](https://open.bigmodel.cn)，调试零成本。不配置也能用全部手动功能。

## 它是怎么工作的

```
用户说"加个页脚" ──► 规则层命中？──是──► 直接插入（0 token）
                        │否
                        ▼
                 模型按块目录选块填槽（~30 token）
                        │目录里没有
                        ▼
                 自由生成 + 记入缺口日志 ──► 高频缺口结晶为新块
```

模块库就是 AI 的工具集：每加一个块，人和 AI 都能用。完整思路见 [docs/模块飞轮.html](docs/模块飞轮.html)。

![起步模板](docs/shots/starter.png)

## 隐私

- 工程数据、AI 配置存在浏览器 **localStorage**（本机、本浏览器），不上传到 PageForge 服务器（也没有账号系统）。
- 启用 AI 时，请求直接发往**你填写的服务商端点**；我们不中转、不存对话。
- 构建产物**不含** API Key。

## 技术栈

原生 JS + [GrapesJS](https://github.com/GrapesJS/grapesjs) + Vite + Electron（桌面版）+ html2canvas。零框架依赖，构建产物可为单文件 HTML。

## 路线图

- [x] 公开网页版（GitHub Pages）
- [ ] 缺口日志查看/导出（模块库进化的人工审入口）
- [ ] 高频块 canvas 原生适配扩容
- [ ] 任务模式（AI 多步编排，做一步看一步）
- [ ] 全局设计令牌 / ARIA 无障碍（有真实用户后再做）

## License

MIT —— 见 [LICENSE](LICENSE)。
