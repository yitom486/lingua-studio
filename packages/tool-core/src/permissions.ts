/**
 * 工具权限安全等级
 */
export const ToolPermissions = {
  READ: 'READ',                 // 只读操作，零副作用，自动放行
  WRITE: 'WRITE',               // 常规写入，如记录错题，静默允许并审计
  DESTRUCTIVE: 'DESTRUCTIVE',   // 破坏性操作，如清空历史，必须弹窗经用户确认
  SENSITIVE: 'SENSITIVE',       // 涉及隐私或外部系统（录音、摄像头、第三方Token），需客户端授权
} as const;

export type ToolPermission = typeof ToolPermissions[keyof typeof ToolPermissions];

export const ToolLocations = {
  CLIENT: 'CLIENT',             // 客户端本地执行 (如 UI 标注、音视频控制)
  SERVER: 'SERVER',             // 网关服务本地执行 (如 词典、出题、做题判定)
  EXTERNAL: 'EXTERNAL',         // 外部系统代理 (如 MCP 协议对接 Anki/Notion)
} as const;

export type ToolLocation = typeof ToolLocations[keyof typeof ToolLocations];
