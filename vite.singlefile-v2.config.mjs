// v2 canvas 编辑器的单文件构建：editor-v2.html → dist-single/editor-v2.html（可双击）
// 注意：emptyOutDir 必须为 false，否则会清掉同目录的 v1 index.html
// 构建产物不注入任何 API Key
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  define: {
    __PAGEFORGE_AI_KEY__: JSON.stringify(''),
  },
  build: {
    outDir: 'dist-single',
    emptyOutDir: false,
    assetsInlineLimit: 100000000,
    rollupOptions: {
      input: { editorv2: 'editor-v2.html' },
    },
  },
});
