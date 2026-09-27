// PageForge vite 配置：构建输出到 dist-web（避免与 electron-builder 的 dist 冲突）
// AI 助手的 DeepSeek Key 只在本地 dev（vite serve）注入，方便本机调试；
// 构建产物（dist-web / dist-single / exe）一律不含 Key，运行时在 AI 面板 ⚙ 里填写
// （.mjs 后缀：vite config 原生 ESM 加载，消除 "ESM syntax loaded as CommonJS" 警告）
// base：GitHub Pages 部署在 /pageforge/ 子路径——用环境变量切换（PF_BASE=/pageforge/ npm run build），
//       本地构建默认 '/'（桌面/本地服务不受影响）
import { defineConfig } from 'vite';
import fs from 'node:fs';

function readAIKey() {
  try {
    const env = fs.readFileSync('C:/Users/simple_pear/AppData/Local/hermes/.env', 'utf8');
    const m = env.match(/DEEPSEEK_API_KEY=(\S+)/);
    return m ? m[1] : '';
  } catch { return ''; }
}

export default defineConfig(({ command }) => ({
  base: process.env.PF_BASE || '/',
  define: {
    __PAGEFORGE_AI_KEY__: JSON.stringify(command === 'serve' ? readAIKey() : ''),
  },
  build: {
    outDir: 'dist-web',
  },
}));
