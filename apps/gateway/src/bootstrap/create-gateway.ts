import { DrizzleLearnerRepository } from '../repository/drizzle-learner-repository.js';
import { GatewayServer } from '../server.js';
import { dbPath } from './config.js';

/**
 * 网关装配根（G2）：生产只创建一套依赖。
 * 测试可直接调用并传入自有实例（显式注入），不得依赖本模块单例。
 */
export function createGateway(db: string = dbPath) {
  const repo = new DrizzleLearnerRepository(db);
  const server = new GatewayServer(repo);
  return { repo, server };
}

export type CreatedGateway = ReturnType<typeof createGateway>;
