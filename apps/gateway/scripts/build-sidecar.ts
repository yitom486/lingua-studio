/**
 * 编译 Gateway 为 Tauri sidecar 独立二进制。
 * 运行：bun scripts/build-sidecar.ts
 * 产物：apps/desktop/src-tauri/binaries/study-studio-gateway-<target-triple>[.exe]
 * （与 tauri.conf.json `bundle.externalBin` 的 `binaries/study-studio-gateway` 对应；
 * 运行时由桌面壳经 STUDY_STUDIO_DB / GATEWAY_PORT 环境变量指定库路径与端口）。
 */
const TRIPLES: Record<string, string> = {
  'win32-x64': 'x86_64-pc-windows-msvc',
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
};

const key = `${process.platform}-${process.arch}`;
const triple = TRIPLES[key];
if (!triple) {
  console.error(`unsupported platform for sidecar build: ${key}`);
  process.exit(1);
}

const ext = process.platform === 'win32' ? '.exe' : '';
const outfile = Bun.fileURLToPath(
  new URL(`../../desktop/src-tauri/binaries/study-studio-gateway-${triple}${ext}`, import.meta.url)
);

const result = await Bun.build({
  entrypoints: [Bun.fileURLToPath(new URL('../src/sidecar.ts', import.meta.url))],
  compile: { outfile },
  minify: false,
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log(`study-studio-gateway sidecar built: ${outfile}`);
