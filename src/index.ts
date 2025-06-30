import dayjs from 'dayjs';
import axios, { AxiosInstance } from 'axios';
import { LoggerLevel } from './logger';
const { functionLimiter } = require('./limiter');

/**
 * Client 初始化配置
 */
interface ClientOptions {
    /** 命名空间，例如 app_xxx */
    namespace: string;
    /** 应用 clientId */
    clientId: string;
    /** 应用 clientSecret */
    clientSecret: string;
    /** 是否禁用 token 缓存，每次调用强制刷新 token，默认 false */
    disableTokenCache?: boolean;
}

/**
 * 获取 token 接口返回体
 */
interface TokenResponse {
    code: string;
    data: {
        accessToken: string;
        expireTime: number; // 过期时间戳
    };
    msg: string;
}

/**
 * records_query 接口请求参数
 */
interface RecordsQueryParams {
    /** 对象名称，例如 object_store */
    object_name: string;
    /** 请求体数据 */
    data: any;
}

/**
 * aPaaS OpenAPI 客户端
 */
class Client {
    private clientId: string;
    private clientSecret: string;
    private namespace: string;
    private disableTokenCache: boolean;
    private accessToken: string | null = null;
    private expireTime: number | null = null;
    private axiosInstance: AxiosInstance;
    private loggerLevel: LoggerLevel = LoggerLevel.info;

    /**
     * 构造函数
     * @param options ClientOptions
     */
    constructor(options: ClientOptions) {
        this.clientId = options.clientId;
        this.clientSecret = options.clientSecret;
        this.namespace = options.namespace;
        this.disableTokenCache = options.disableTokenCache || false;

        this.axiosInstance = axios.create({
            baseURL: 'https://ae-openapi.feishu.cn',
            headers: { 'Content-Type': 'application/json' }
        });
        this.log(LoggerLevel.info, 'client initialized');
    }

    /**
     * 设置日志等级
     * @param level LoggerLevel
     */
    setLoggerLevel(level: LoggerLevel) {
        this.loggerLevel = level;
        this.log(LoggerLevel.info, `logger level set to ${LoggerLevel[level]}`);
    }

    /**
     * 日志打印方法
     * @param level LoggerLevel
     * @param args 打印内容
     */

    private log(level: LoggerLevel, ...args: any[]) {
        if (this.loggerLevel >= level) {
            const levelStr = LoggerLevel[level];
            const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss:SSS');
            console.log(`[${levelStr}] [${timestamp}]`, ...args);
        }
    }
    /**
     * 初始化 client，自动获取 token
     */
    async init() {
        await this.ensureTokenValid();
        this.log(LoggerLevel.info, 'client ready');
    }

    /**
     * 获取 accessToken
     */
    private async getAccessToken(): Promise<void> {
        const url = '/auth/v1/appToken';
        const res = await this.axiosInstance.post<TokenResponse>(url, {
            clientId: this.clientId,
            clientSecret: this.clientSecret
        });

        if (res.data.code !== '0') {
            this.log(LoggerLevel.error, `[获取认证] 获取 accessToken 失败: ${res.data.msg}`);
            throw new Error(`获取 accessToken 失败: ${res.data.msg}`);
        }

        this.accessToken = res.data.data.accessToken;
        this.expireTime = res.data.data.expireTime;
        this.log(LoggerLevel.info, '[获取认证] accessToken refreshed');
    }

    /**
     * 确保 token 有效，若过期则刷新
     */
    private async ensureTokenValid() {
        if (this.disableTokenCache) {
            this.log(LoggerLevel.debug, '[获取认证] token cache disabled, refreshing token');
            await this.getAccessToken();
            return;
        }

        if (!this.accessToken || !this.expireTime) {
            this.log(LoggerLevel.debug, '[获取认证] no token cached, fetching new token');
            await this.getAccessToken();
            return;
        }

        const now = dayjs().valueOf();
        if (now + 60 * 1000 > this.expireTime) {
            this.log(LoggerLevel.debug, '[获取认证] token expired, refreshing');
            await this.getAccessToken();
        }
    }

    /**
     * 获取当前 accessToken
     */
    get token() {
        return this.accessToken;
    }

    /**
     * 获取当前 namespace
     */
    get currentNamespace() {
        this.log(LoggerLevel.debug, `[获取命名空间] 当前命名空间: ${this.namespace}`);
        return this.namespace;
    }

    /**
     * 对象模块
     */
    public object = {
        search: {
            /**
             * 单条记录查询
             * @param params 请求参数
             * @returns 接口返回结果
             */
            record: async (params: { object_name: string; record_id: string; select: string[] }): Promise<any> => {
                const { object_name, record_id, select } = params;
                const url = `/v1/data/namespaces/${this.namespace}/objects/${object_name}/records/${record_id}`;

                this.log(LoggerLevel.info, `[单条查询记录] 🔍 开始查询 record_id: ${record_id}`);

                const res = await functionLimiter(async () => {
                    await this.ensureTokenValid();

                    const response = await this.axiosInstance.post(url, { select }, { headers: { Authorization: `${this.accessToken}` } });

                    this.log(LoggerLevel.info, `[单条查询记录] 🔍 record_id: ${record_id} 查询完成，返回 code: ${response.data.code}`);
                    return response.data;
                });

                return res;
            },

            /**
             * records_query 接口
             * @param params 请求参数
             * @returns 接口返回结果
             */
            records: async (params: RecordsQueryParams): Promise<any> => {
                const { object_name, data } = params;
                await this.ensureTokenValid();

                const url = `/v1/data/namespaces/${this.namespace}/objects/${object_name}/records_query`;

                const res = await this.axiosInstance.post(url, data, {
                    headers: { Authorization: `${this.accessToken}` }
                });

                this.log(LoggerLevel.debug, `[批量查询记录] 🔍 records_query 调用完成，object_name: ${object_name}`);
                return res.data;
            },

            /**
             * 分页查询所有记录
             * @param params 请求参数
             * @returns { total, items }
             */
            recordsWithIterator: async (params: RecordsQueryParams): Promise<{ total: number; items: any[] }> => {
                const { object_name, data } = params;

                let results: any[] = [];
                let nextPageToken: string | undefined = '';
                let total = 0;
                let page = 0;

                do {
                    const pageRes = await functionLimiter(async () => {
                        const mergedData = { ...data, page_token: nextPageToken || '' };

                        const res = await this.object.search.records({
                            object_name,
                            data: mergedData
                        });

                        page += 1;

                        if (res.data && Array.isArray(res.data.items)) {
                            results = results.concat(res.data.items);
                        }

                        if (page === 1) {
                            total = res.data.total || 0;
                            this.log(LoggerLevel.info, '[批量查询记录] 🔍 接口返回 total:', total);
                        }

                        nextPageToken = res.data.next_page_token;

                        this.log(LoggerLevel.debug, `[批量查询记录] 🔍 第 ${page} 页查询完成，items.length: ${res.data.items.length}`);
                        return res;
                    });
                } while (nextPageToken);

                return { total, items: results };
            }
        },

        update: {
            /**
             * 单条更新
             * @param params 请求参数
             * @returns 接口返回结果
             */
            record: async (params: { object_name: string; record_id: string; record: any }): Promise<any> => {
                const { object_name, record_id, record } = params;
                const url = `/v1/data/namespaces/${this.namespace}/objects/${object_name}/records/${record_id}`;

                this.log(LoggerLevel.info, `[单条更新记录] 💾 开始更新 record_id: ${record_id}`);

                const res = await functionLimiter(async () => {
                    await this.ensureTokenValid();

                    const response = await this.axiosInstance.patch(url, { record }, { headers: { Authorization: `${this.accessToken}` } });

                    this.log(LoggerLevel.info, `[单条更新记录] 💾 record_id: ${record_id} 更新完成，返回 code: ${response.data.code}`);
                    return response.data;
                });

                return res;
            },

            /**
             * 批量更新
             * @param params 请求参数
             * @returns 所有子请求的返回结果数组
             */
            recordsBatchUpdate: async (params: { object_name: string; records: any[] }): Promise<any[]> => {
                const { object_name, records } = params;
                const url = `/v1/data/namespaces/${this.namespace}/objects/${object_name}/records_batch`;

                const chunkSize = 100;
                const chunks: any[][] = [];
                for (let i = 0; i < records.length; i += chunkSize) {
                    chunks.push(records.slice(i, i + chunkSize));
                }

                this.log(LoggerLevel.info, `[批量更新记录] 💾 总共 ${records.length} 条记录，拆分为 ${chunks.length} 组，每组最多 ${chunkSize} 条`);

                const results: any[] = [];
                for (const [index, chunk] of chunks.entries()) {
                    this.log(LoggerLevel.info, `[批量更新记录] 💾 开始更新第 ${index + 1} 组，共 ${chunk.length} 条`);

                    const res = await functionLimiter(async () => {
                        await this.ensureTokenValid();

                        const response = await this.axiosInstance.patch(url, { records: chunk }, { headers: { Authorization: `${this.accessToken}` } });

                        this.log(LoggerLevel.info, `[批量更新记录] 💾 第 ${index + 1} 组更新完成，返回 code: ${response.data.code}`);
                        return response.data;
                    });

                    results.push(res);
                }

                return results;
            }
        },

        delete: {
            /**
             * 单条删除
             * @param params 请求参数
             * @returns 接口返回结果
             */
            record: async (params: { object_name: string; record_id: string }): Promise<any> => {
                const { object_name, record_id } = params;
                const url = `/v1/data/namespaces/${this.namespace}/objects/${object_name}/records/${record_id}`;

                this.log(LoggerLevel.info, `[单条删除记录] 🗑️ 开始删除 record_id: ${record_id}`);

                const res = await functionLimiter(async () => {
                    await this.ensureTokenValid();

                    const response = await this.axiosInstance.delete(url, {
                        headers: { Authorization: `${this.accessToken}` }
                    });

                    this.log(LoggerLevel.info, `[单条删除记录] 🗑️ record_id: ${record_id} 删除完成，返回 code: ${response.data.code}`);
                    return response.data;
                });

                return res;
            },

            /**
             * 批量删除
             * @param params 请求参数
             * @returns 所有子请求的返回结果数组
             */
            recordsBatchDelete: async (params: { object_name: string; ids: string[] }): Promise<any[]> => {
                const { object_name, ids } = params;
                const url = `/v1/data/namespaces/${this.namespace}/objects/${object_name}/records_batch`;

                const chunkSize = 100;
                const chunks: string[][] = [];
                for (let i = 0; i < ids.length; i += chunkSize) {
                    chunks.push(ids.slice(i, i + chunkSize));
                }

                this.log(LoggerLevel.info, `[批量删除记录] 🗑️ 总共 ${ids.length} 条记录，拆分为 ${chunks.length} 组，每组最多 ${chunkSize} 条`);

                const results: any[] = [];
                for (const [index, chunk] of chunks.entries()) {
                    this.log(LoggerLevel.info, `[批量删除记录] 🗑️ 开始删除第 ${index + 1} 组，共 ${chunk.length} 条`);

                    const res = await functionLimiter(async () => {
                        await this.ensureTokenValid();

                        const response = await this.axiosInstance.delete(url, {
                            headers: { Authorization: `${this.accessToken}` },
                            data: { ids: chunk }
                        });

                        this.log(LoggerLevel.info, `[批量删除记录] 🗑️ 第 ${index + 1} 组删除完成，返回 code: ${response.data.code}`);
                        return response.data;
                    });

                    results.push(res);
                }

                return results;
            }
        }
    };
}

export const apaas = {
    Client
};
