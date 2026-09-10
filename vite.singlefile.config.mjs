// 单文件构建配置：v1 编辑器 → dist-single/index.html
// v2 canvas 编辑器另由 vite.singlefile-v2.config.mjs 构建（package.json build:single 串行执行两者）
// 注意：构建产物不注入任何 API Key（防止随 exe/HTML 泄露），AI Key 运行时在界面 ⚙ 里填写
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  define: {
    __PAGEFORGE_AI_KEY__: JSON.stringify(''),
  },
  build: {
    outDir: 'dist-single',
    assetsInlineLimit: 100000000,
    rollupOptions: {
      input: { main: 'index.html' },
    },
  },
});
