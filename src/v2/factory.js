// v2 元素工厂（从 store.js 抽出：store.js 与 starters.js 都需要它，避免循环依赖）
//
// ⚠️ 必须用函数声明，不能用 `const T = (...) => ({...})`：
// rollup 会把这种 const 箭头函数判定为可内联对象工厂，压缩时删除定义却留下裸调用，
// 导致构建产物运行时报 "T is not defined"（v2 编辑器整体打不开）。

export function elId() {
  // 元素 ID 非加密用途；统一 crypto 生成（目标运行时均为 secure context，randomUUID 必可用）
  return 'el_' + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

/** 构造一个画布元素（字段与 docs/v2/canvas-schema-draft.md §2 一致） */
export function T(type, x, y, w, h, z, style, html) {
  return {
    id: elId(), type, x, y, width: w, height: h, z,
    rotation: 0, opacity: 1, locked: false, style, html, overrides: {},
  };
}
