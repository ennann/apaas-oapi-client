import Bottleneck from 'bottleneck';

/**
 * 默认 apaas 限流配置
 */
export const apaasLimiterOptions = {
    minTime: 200, // 每秒最多发起 5 个数据库操作
    reservoir: 20, // 最多同时查询 50 个数据库操作
    reservoirRefreshAmount: 20, // 每次查询完毕后，重置为 50 个数据库操作
    reservoirRefreshInterval: 1000 // 重置时间间隔为 1 秒
};

/**
 * 创建限流器
 * @param fn 被限流函数
 * @param options 自定义限流配置
 * @returns 包装后的限流函数
 */
export async function functionLimiter<T>(fn: () => Promise<T>, options: Partial<Bottleneck.ConstructorOptions> = {}): Promise<T> {
    const limiter = new Bottleneck({
        minTime: options.minTime || apaasLimiterOptions.minTime,
        reservoir: options.reservoir || apaasLimiterOptions.reservoir,
        reservoirRefreshAmount: options.reservoirRefreshAmount || apaasLimiterOptions.reservoirRefreshAmount,
        reservoirRefreshInterval: options.reservoirRefreshInterval || apaasLimiterOptions.reservoirRefreshInterval
    });

    const wrapped = limiter.wrap(fn);
    return wrapped();
}
