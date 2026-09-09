// 单文件构建配置：把 PageForge 打包成双击即用的独立 HTML
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
  },
});
