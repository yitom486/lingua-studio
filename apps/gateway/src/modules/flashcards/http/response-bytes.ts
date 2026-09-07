/**
 * Uint8Array → 可独立传输的 ArrayBuffer（Response BodyInit 口径）。
 * 拷贝后返回底层 buffer，调用方原数组的 byteOffset 不再有影响。
 */
export function toDetachedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  // 新生拷贝的 buffer 即标准 ArrayBuffer（structured、offset 为 0）。
  return copy.buffer as ArrayBuffer;
}
