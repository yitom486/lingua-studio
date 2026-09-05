import type { DrizzleLearnerRepository } from '../../repository/drizzle-learner-repository.js';
import type { GatewayServer } from '../../server.js';

/**
 * 网关依赖束（G2）：路由只经 deps 访问仓储与运行时，
 * 不得 import index.ts 单例或自行创建 DB/Adapter。
 */
export interface GatewayDeps {
  repo: DrizzleLearnerRepository;
  server: GatewayServer;
  /** 健康检查回显用端口；仅展示，不决定监听 */
  port: number;
}
