// 撤销栈的纯函数：条数 + 字节双预算。
// 背景：快照是全量 JSON（含 base64 图片），200 帧条数上限挡不住内存爆炸——
// 3 张 3MB 图 = 单帧 ~12MB，200 帧 ≈ 2.4GB。故按总字节再设一道预算，超了丢最老的帧。
// 单独成模块：无 DOM 依赖，回归可在 Node 侧直接单测。
export const DEFAULT_MAX_FRAMES = 200;
export const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
// UTF-16 内存粗估（V8 双字节字符串）；JSON 含中文时接近真实占用
export const frameBytes = (s) => String(s).length * 2;

export function pushFrame(stack, json, { maxFrames = DEFAULT_MAX_FRAMES, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  stack.push(json);
  if (stack.length > maxFrames) stack.shift();
  let total = 0;
  for (const s of stack) total += frameBytes(s);
  // 至少保留 1 帧：单帧就超预算时也要能撤销回"上一态"
  while (total > maxBytes && stack.length > 1) total -= frameBytes(stack.shift());
  return stack;
}
