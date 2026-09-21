// v2 中文字体预设（A0-8）：与 v1（src/main.js:184 的 FONT_PRESETS）同源。
// 全部为系统字体、零下载；每项带跨平台回退链，Windows / macOS 都有着落。
// v1 仍用自己那份常量（不动已验证的代码）；两边如需统一，改这里即可。

export const FONT_PRESETS = [
  { id: `-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`, label: '系统默认（黑体感）' },
  { id: `"PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif`, label: '苹方（macOS 风）' },
  { id: `"Microsoft YaHei", "PingFang SC", sans-serif`, label: '微软雅黑' },
  { id: `"Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif`, label: '思源黑体' },
  { id: `"Heiti SC", SimHei, "Microsoft YaHei", sans-serif`, label: '黑体' },
  { id: `"Songti SC", SimSun, "Noto Serif SC", serif`, label: '宋体（衬线）' },
  { id: `"Kaiti SC", KaiTi, STKaiti, serif`, label: '楷体' },
  { id: `Arial, "Helvetica Neue", sans-serif`, label: 'Arial（西文）' },
  { id: `Georgia, "Times New Roman", serif`, label: 'Georgia（西文衬线）' },
  { id: `"SF Mono", Menlo, Consolas, "Courier New", monospace`, label: '等宽（代码）' },
];

/** 字重预设（100–900 + 名称；中文用户最常用 400/700） */
export const WEIGHT_PRESETS = [
  { id: '300', label: '细体 300' },
  { id: '400', label: '常规 400' },
  { id: '500', label: '中等 500' },
  { id: '600', label: '半粗 600' },
  { id: '700', label: '粗体 700' },
  { id: '800', label: '特粗 800' },
  { id: '900', label: '黑体 900' },
];
