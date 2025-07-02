import dayjs from 'dayjs';
import axios, { AxiosInstance } from 'axios';
import { LoggerLevel } from './logger';
import { functionLimiter } from './limiter';

/**
 * Client 初始化配置
 */
interface ClientOptions {
    /** 命名空间, 例如 app_xxx */
    namespace: string;
    /** 应用 clientId */
    clientId: string;
    /** 应用 clientSecret */
    clientSecret: string;
    /** 是否禁用 token 缓存, 每次调用强制刷新 token, 默认 false */
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
        this.log(LoggerLevel.info, '[client] initialized');
    }

    /**
     * 设置日志等级
     * @param level LoggerLevel
     */
    setLoggerLevel(level: LoggerLevel) {
        this.loggerLevel = level;
        this.log(LoggerLevel.info, `[logger] logger level set to ${LoggerLevel[level]}`);
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
     * 初始化 client, 自动获取 token
     */
    async init() {
        await this.ensureTokenValid();
        this.log(LoggerLevel.info, '[client] ready');
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
            this.log(LoggerLevel.error, `[fetch token] 获取 accessToken 失败: ${res.data.msg}`);
            throw new Error(`获取 accessToken 失败: ${res.data.msg}`);
        }

        this.accessToken = res.data.data.accessToken;
        this.expireTime = res.data.data.expireTime;
        this.log(LoggerLevel.info, '[client] token refreshed');
    }

    /**
     * 确保 token 有效, 若过期则刷新
     */
    private async ensureTokenValid() {
        if (this.disableTokenCache) {
            this.log(LoggerLevel.debug, '[client] token cache disabled, refreshing token');
            await this.getAccessToken();
            return;
        }

        if (!this.accessToken || !this.expireTime) {
            this.log(LoggerLevel.debug, '[client] no token cached, fetching new token');
            await this.getAccessToken();
            return;
        }

        const now = dayjs().valueOf();
        if (now + 60 * 1000 > this.expireTime) {
            this.log(LoggerLevel.debug, '[client] token expired, refreshing');
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
     * 获取当前 token 剩余过期时间（单位：秒）
     * @returns 剩余秒数，若无 token 则返回 null
     */
    get tokenExpireTime() {
        if (!this.accessToken || !this.expireTime) {
            this.log(LoggerLevel.warn, '[client] no valid token');
            return null;
        }

        const now = dayjs().valueOf();
        const remainMs = this.expireTime - now;

        if (remainMs <= 0) {
            this.log(LoggerLevel.warn, '[client] token expired');
            return 0;
        }

        const remainSeconds = Math.floor(remainMs / 1000);
        this.log(LoggerLevel.debug, `[client] token expire time: ${remainSeconds} seconds remaining`);
        this.log(LoggerLevel.trace, `[client] token expire time: ${remainSeconds} seconds remaining, expireTime=${this.expireTime}, now=${now}`);
        return remainSeconds;
    }

    /**
     * 获取当前 namespace
     */
    get currentNamespace() {
        this.log(LoggerLevel.debug, `🏷️ [获取命名空间] 当前命名空间: ${this.namespace}`);
        return this.namespace;
    }

    /**
     * 对象模块
     */
    public object = {
        metadata: {
            /**
             * 获取指定对象下指定字段的元数据
             * @description 查询指定对象下的单个字段元数据
             * @param params 请求参数 { object_name, field_name }
             * @returns 接口返回结果
             */
            field: async (params: { object_name: string; field_name: string }): Promise<any> => {
                const { object_name, field_name } = params;
                await this.ensureTokenValid();
                const url = `/api/data/v1/namespaces/${this.namespace}/meta/objects/${object_name}/fields/${field_name}`;

                this.log(LoggerLevel.debug, `[对象字段查询] 📄 开始获取字段元数据, object_name=${object_name}, field_name=${field_name}`);

                const res = await this.axiosInstance.get(url, {
                    headers: { Authorization: `${this.accessToken}` }
                });

                this.log(LoggerLevel.debug, `[对象字段查询] 📄 object_name=${object_name}, field_name=${field_name}, 调用完成, 返回状态=${res.data.code}`);
                this.log(LoggerLevel.trace, `[对象字段查询] 📄 object_name=${object_name}, field_name=${field_name}, 返回信息=${JSON.stringify(res.data)}`);
                return res.data;
            },

            /**
             * 获取指定对象的所有字段信息
             * @description 查询指定对象下的所有字段元数据
             * @param params 请求参数 { object_name }
             * @returns 接口返回结果
             */
            fields: async (params: { object_name: string }): Promise<any> => {
                const { object_name } = params;
                await this.ensureTokenValid();
                const url = `/api/data/v1/namespaces/${this.namespace}/meta/objects/${object_name}`;

                this.log(LoggerLevel.debug, `[对象字段查询] 📄 开始获取对象字段元数据 object_name=${object_name}`);

                const res = await this.axiosInstance.get(url, {
                    headers: { Authorization: `${this.accessToken}` }
                });

                this.log(LoggerLevel.debug, `[对象字段查询] 📄 object_name=${object_name}, 调用完成, 返回状态=${res.data.code}`);
                this.log(LoggerLevel.trace, `[对象字段查询] 📄 object_name=${object_name}, 调用完成, 返回信息=${JSON.stringify(res.data)}`);
                return res.data;
            }
        },

        search: {
            /**
             * 单条记录查询
             * @description 查询指定对象下的单条记录
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

                    this.log(LoggerLevel.debug, `[单条查询记录] 🔍 查询 object_name=${object_name}, record_id: ${record_id} 调用完成, 返回状态: ${response.data.code}`);
                    this.log(LoggerLevel.trace, `[单条查询记录] 🔍 查询 object_name=${object_name}, record_id: ${record_id} 调用完成, 返回信息: ${JSON.stringify(response.data)}`);

                    return response.data;
                });

                return res;
            },

            /**
             * 多条记录查询 - 最多传入 100 条
             * @description 查询指定对象下的多条记录
             * @param params 请求参数
             * @returns 接口返回结果
             */
            records: async (params: { object_name: string; data: any }): Promise<any> => {
                const { object_name, data } = params;
                await this.ensureTokenValid();

                const url = `/v1/data/namespaces/${this.namespace}/objects/${object_name}/records_query`;

                const res = await this.axiosInstance.post(url, data, {
                    headers: { Authorization: `${this.accessToken}` }
                });

                this.log(LoggerLevel.info, `[批量查询记录] 🔍 接口调用完成`);
                this.log(LoggerLevel.debug, `[批量查询记录] 🔍 查询 object_name=${object_name}, 调用完成, 返回状态: ${res.data.code}, 返回数据总数${res.data?.data?.total || 'unknown'}`);
                this.log(LoggerLevel.trace, `[批量查询记录] 🔍 查询 object_name=${object_name}, 调用完成, 返回信息: ${JSON.stringify(res.data)}`);
                return res.data;
            },

            /**
             * 查询所有记录 - 支持超过 100 条数据，自动分页查询
             * @description 该方法会自动处理分页，直到没有更多数据为止
             * @param params 请求参数
             * @returns { total, items }
             */
            recordsWithIterator: async (params: { object_name: string; data: any }): Promise<{ total: number; items: any[] }> => {
                const { object_name, data } = params;

                let results: any[] = [];
                let nextPageToken: string | undefined = '';
                let total = 0;
                let page = 0;

                const url = `/v1/data/namespaces/${this.namespace}/objects/${object_name}/records_query`;

                do {
                    const pageRes = await functionLimiter(async () => {
                        const mergedData = { ...data, page_token: nextPageToken || '' };

                        await this.ensureTokenValid();

                        const res = await this.axiosInstance.post(url, mergedData, {
                            headers: { Authorization: `${this.accessToken}` }
                        });

                        page += 1;

                        if (res.data && Array.isArray(res.data.items)) {
                            results = results.concat(res.data.items);
                        }

                        if (page === 1) {
                            total = res.data.total || 0;
                            this.log(LoggerLevel.info, `[批量查询记录] 🔍 object_name=${object_name}, 接口返回 total: ${total}`);
                        }

                        const totalPages = Math.ceil(total / (data.page_size || 100));
                        const padLength = String(totalPages).length;

                        this.log(LoggerLevel.info, `[批量查询记录] 🔍 [${String(page).padStart(padLength, '0')}/${totalPages}] 接口调用完成`);
                        this.log(LoggerLevel.debug, `[批量查询记录] 🔍 第 ${page} 页查询, nextPageToken: ${res.data.next_page_token || ''}`);
                        this.log(LoggerLevel.debug, `[批量查询记录] 🔍 第 ${page} 页查询完成, items.length: ${res.data.items.length}`);
                        this.log(LoggerLevel.trace, `[批量查询记录] 🔍 第 ${page} 页查询结果: ${JSON.stringify(res.data.items)}`);

                        nextPageToken = res.data.next_page_token;

                        return res;
                    });
                } while (nextPageToken);

                return { total, items: results };
            }
        },

        create: {
            /**
             * 单条记录创建
             * @description 创建单条记录到指定对象中
             * @param params 请求参数 { object_name, record }
             * @returns 接口返回结果
             */
            record: async (params: { object_name: string; record: any }): Promise<any> => {
                const { object_name, record } = params;
                const url = `/v1/data/namespaces/${this.namespace}/objects/${object_name}/records`;

                this.log(LoggerLevel.info, `[单条创建记录] ➕ 开始向对象 ${object_name} 创建记录`);

                const res = await functionLimiter(async () => {
                    await this.ensureTokenValid();

                    const response = await this.axiosInstance.post(
                        url,
                        { record },
                        {
                            headers: { Authorization: `${this.accessToken}` }
                        }
                    );

                    this.log(LoggerLevel.info, `[单条创建记录] ➕ 向对象 ${object_name} 内创建记录, 调用完成`);
                    this.log(LoggerLevel.debug, `[单条创建记录] ➕ 向对象 ${object_name} 内创建数据, 调用完成, 返回状态: ${response.data.code}`);
                    this.log(LoggerLevel.trace, `[单条创建记录] ➕ 向对象 ${object_name} 内创建数据, 调用完成, 返回信息: ${JSON.stringify(response.data)}`);

                    return response.data;
                });

                return res;
            },

            /**
             * 批量创建记录 - 最多传入 100 条
             * @description 创建多条记录到指定对象中
             * @param params 请求参数 { object_name, records }
             * @returns 接口返回结果
             */
            records: async (params: { object_name: string; records: any[] }): Promise<any> => {
                const { object_name, records } = params;
                await this.ensureTokenValid();

                const url = `/v1/data/namespaces/${this.namespace}/objects/${object_name}/records_batch`;

                const res = await this.axiosInstance.post(
                    url,
                    { records },
                    {
                        headers: { Authorization: `${this.accessToken}` }
                    }
                );

                this.log(LoggerLevel.info, `[批量创建记录] ➕ 开始向对象 ${object_name} 批量创建记录`);
                this.log(LoggerLevel.debug, `[批量创建记录] ➕ 向对象 ${object_name} 批量创建记录, 调用完成, 返回状态: ${res.data.code}`);
                this.log(LoggerLevel.trace, `[批量创建记录] ➕ 向对象 ${object_name} 批量创建记录, 调用完成, 返回信息: ${JSON.stringify(res.data)}`);
                return res.data;
            },

            /**
             * 分批创建所有记录 - 支持超过 100 条数据，自动拆分
             * @description 创建多条记录到指定对象中，超过 100 条数据会自动拆分为多次请求
             * @param params 请求参数 { object_name, records }
             * @returns { total, items }
             */
            recordsWithIterator: async (params: { object_name: string; records: any[] }): Promise<{ total: number; items: any[] }> => {
                const { object_name, records } = params;

                let results: any[] = [];
                let total = records.length;
                const chunkSize = 100;
                let page = 0;

                const chunks: any[][] = [];
                for (let i = 0; i < records.length; i += chunkSize) {
                    chunks.push(records.slice(i, i + chunkSize));
                }

                this.log(LoggerLevel.debug, `[批量创建记录] ➕ 总共 ${records.length} 条记录, 拆分为 ${chunks.length} 组, 每组最多 ${chunkSize} 条`);
                this.log(LoggerLevel.trace, `[批量创建记录] ➕ 总共 ${records.length} 条记录, 拆分为 ${chunks.length} 组, 每组最多 ${chunkSize} 条`);

                for (const [index, chunk] of chunks.entries()) {
                    page += 1;

                    this.log(LoggerLevel.debug, `[批量创建记录] ➕ 开始创建第 ${index + 1} 组, 共 ${chunk.length} 条`);
                    this.log(LoggerLevel.trace, `[批量创建记录] ➕ 开始创建第 ${index + 1} 组, 共 ${chunk.length} 条`);

                    const pageRes = await functionLimiter(async () => {
                        const res = await this.object.create.records({
                            object_name,
                            records: chunk
                        });

                        if (res.data && Array.isArray(res.data.items)) {
                            results = results.concat(res.data.items);
                        }

                        this.log(LoggerLevel.info, `[批量创建记录] ➕ 创建 object_name=${object_name}, 第 ${page} 页数据, 调用完成, 创建数量: ${res.data.items.length}`);
                        this.log(LoggerLevel.debug, `[批量创建记录] ➕ 创建 object_name=${object_name}, 第 ${page} 页页数据, 调用完成, 返回状态: ${res.data.code}`);
                        this.log(LoggerLevel.trace, `[批量创建记录] ➕ 创建 object_name=${object_name}, 第 ${page} 页页数据, 调用结果: ${JSON.stringify(res.data.items)}`);

                        return res;
                    });
                }

                return { total, items: results };
            }
        },

        update: {
            /**
             * 单条更新
             * @description 更新指定对象下的单条记录
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

                    this.log(LoggerLevel.info, `[单条更新记录] 💾 更新 object_name=${object_name}, record_id: ${record_id} 调用完成`);
                    this.log(LoggerLevel.debug, `[单条更新记录] 💾 更新 object_name=${object_name}, record_id: ${record_id} 调用完成, 返回状态: ${response.data.code}`);
                    this.log(LoggerLevel.trace, `[单条更新记录] 💾 更新 object_name=${object_name}, record_id: ${record_id} 调用完成, 返回信息: ${JSON.stringify(response.data)}`);
                    return response.data;
                });

                return res;
            },

            /**
             * 多条更新 - 最多传入 100 条
             * @description 更新指定对象下的多条记录
             * @param params 请求参数
             * @returns 接口返回结果
             */
            records: async (params: { object_name: string; records: any[] }): Promise<any> => {
                const { object_name, records } = params;
                const url = `/v1/data/namespaces/${this.namespace}/objects/${object_name}/records/records_batch`;

                this.log(LoggerLevel.info, `[多条更新记录] 💾 开始更新 ${records.length} 条数据`);

                const response = await this.axiosInstance.patch(url, { records }, { headers: { Authorization: `${this.accessToken}` } });

                this.log(LoggerLevel.info, `[多条更新记录] 💾 更新 object_name=${object_name}, 调用完成`);
                this.log(LoggerLevel.debug, `[多条更新记录] 💾 更新 object_name=${object_name}, 调用完成, 返回状态: ${response.data.code}`);
                this.log(LoggerLevel.trace, `[多条更新记录] 💾 更新 object_name=${object_name}, 调用完成, 返回信息: ${JSON.stringify(response.data)}`);

                return response.data;
            },

            /**
             * 批量更新 - 支持超过 100 条数据，自动拆分
             * @description 更新指定对象下的多条记录，超过 100 条数据会自动拆分为多次请求
             * @param params 请求参数
             * @returns 所有子请求的返回结果数组
             */
            recordsWithIterator: async (params: { object_name: string; records: any[] }): Promise<any[]> => {
                const { object_name, records } = params;
                const url = `/v1/data/namespaces/${this.namespace}/objects/${object_name}/records_batch`;

                const chunkSize = 100;
                const chunks: any[][] = [];
                for (let i = 0; i < records.length; i += chunkSize) {
                    chunks.push(records.slice(i, i + chunkSize));
                }

                this.log(LoggerLevel.debug, `[批量更新记录] 💾 总共 ${records.length} 条记录, 拆分为 ${chunks.length} 组, 每组最多 ${chunkSize} 条`);
                this.log(LoggerLevel.trace, `[批量更新记录] 💾 总共 ${records.length} 条记录, 拆分为 ${chunks.length} 组, 每组最多 ${chunkSize} 条`);

                const results: any[] = [];
                for (const [index, chunk] of chunks.entries()) {
                    this.log(LoggerLevel.debug, `[批量更新记录] 💾 开始更新第 ${index + 1} 组, 共 ${chunk.length} 条`);
                    this.log(LoggerLevel.trace, `[批量更新记录] 💾 开始更新第 ${index + 1} 组, 共 ${chunk.length} 条`);

                    const res = await functionLimiter(async () => {
                        await this.ensureTokenValid();

                        const response = await this.axiosInstance.patch(url, { records: chunk }, { headers: { Authorization: `${this.accessToken}` } });

                        this.log(LoggerLevel.debug, `[批量更新记录] 💾 更新 object_name=${object_name}, 第 ${index + 1} 组调用完成, 返回状态: ${JSON.stringify(response.data)}`);
                        this.log(LoggerLevel.trace, `[批量更新记录] 💾 更新 object_name=${object_name}, 第 ${index + 1} 组调用完成, 返回信息: ${response.data}`);
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
             * @description 删除指定对象下的单条记录
             * @param params 请求参数
             * @returns 接口返回结果
             */
            record: async (params: { object_name: string; record_id: string }): Promise<any> => {
                const { object_name, record_id } = params;
                const url = `/v1/data/namespaces/${this.namespace}/objects/${object_name}/records/${record_id}`;

                this.log(LoggerLevel.trace, `[单条删除记录] 🗑️ object_name=${object_name}, 开始删除 record_id: ${record_id}`);

                const res = await functionLimiter(async () => {
                    await this.ensureTokenValid();

                    const response = await this.axiosInstance.delete(url, {
                        headers: { Authorization: `${this.accessToken}` }
                    });

                    this.log(LoggerLevel.info, `[单条删除记录] 🗑️ 删除 object_name=${object_name}, record_id: ${record_id} 调用完成, 返回信息: ${JSON.stringify(response.data)}`);
                    return response.data;
                });

                return res;
            },

            /**
             * 多条删除 - 最多传入 100 条
             * @description 删除指定对象下的多条记录
             * @param params 请求参数
             * @returns 接口返回结果
             */
            records: async (params: { object_name: string; ids: string[] }): Promise<any> => {
                const { object_name, ids } = params;
                const url = `/v1/data/namespaces/${this.namespace}/objects/${object_name}/records_batch`;

                this.log(LoggerLevel.info, `[批量删除记录] 🗑️ 开始删除对象 ${object_name} 的 ${ids.length} 条记录`);

                const res = await functionLimiter(async () => {
                    await this.ensureTokenValid();

                    const response = await this.axiosInstance.delete(url, {
                        data: { ids },
                        headers: { Authorization: `${this.accessToken}`, 'Content-Type': 'application/json' }
                    });

                    this.log(LoggerLevel.info, `[批量删除记录] 🗑️ 删除对象 ${object_name} 的 ${ids.length} 条记录记录, 调用完成`);
                    this.log(LoggerLevel.debug, `[批量删除记录] 🗑️ 删除对象 ${object_name} 的 ${ids.length} 条记录记录, 调用完成，返回状态: ${response.data.code}`);
                    this.log(LoggerLevel.trace, `[批量删除记录] 🗑️ 删除对象 ${object_name} 的 ${ids.length} 条记录记录, 调用完成，返回信息: ${JSON.stringify(response.data)}`);

                    return response.data;
                });

                return res;
            },

            /**
             * 批量删除
             * @description 删除指定对象下的多条记录，超过 100 条数据会自动拆分为多次请求
             * @param params 请求参数
             * @returns 所有子请求的返回结果数组
             */
            recordsWithIterator: async (params: { object_name: string; ids: string[] }): Promise<any[]> => {
                const { object_name, ids } = params;
                const url = `/v1/data/namespaces/${this.namespace}/objects/${object_name}/records_batch`;

                const chunkSize = 100;
                const chunks: string[][] = [];
                for (let i = 0; i < ids.length; i += chunkSize) {
                    chunks.push(ids.slice(i, i + chunkSize));
                }

                this.log(LoggerLevel.debug, `[批量删除记录] 🗑️ 总共 ${ids.length} 条记录, 拆分为 ${chunks.length} 组, 每组最多 ${chunkSize} 条`);

                const results: any[] = [];
                for (const [index, chunk] of chunks.entries()) {
                    this.log(LoggerLevel.info, `[批量删除记录] 🗑️ 开始删除第 ${index + 1} 组, 共 ${chunk.length} 条`);

                    const res = await functionLimiter(async () => {
                        await this.ensureTokenValid();

                        const response = await this.axiosInstance.delete(url, {
                            headers: { Authorization: `${this.accessToken}` },
                            data: { ids: chunk }
                        });

                        this.log(LoggerLevel.debug, `[批量删除记录] 🗑️ 第 ${index + 1} 组删除完成, 返回状态: ${response.data.code}`);
                        this.log(LoggerLevel.trace, `[批量删除记录] 🗑️ 第 ${index + 1} 组删除完成, 返回信息: ${JSON.stringify(response.data)}`);
                        return response.data;
                    });

                    results.push(res);
                }

                return results;
            }
        }
    };

    /**
     * 部门 ID 交换模块
     */
    public department = {
        /**
         * 单个部门 ID 交换
         * @param params 请求参数
         * @returns 单个部门映射结果
         */
        exchange: async (params: { department_id_type: 'department_id' | 'external_department_id' | 'external_open_department_id'; department_id: string }): Promise<any> => {
            const { department_id_type, department_id } = params;
            // department_id_type 可选值：
            // - 'department_id' (如 "1758534140403815")
            // - 'external_department_id' (外部平台 department_id, 无固定格式)
            // - 'external_open_department_id' (以 'oc_' 开头的 open_department_id)

            const url = '/api/integration/v2/feishu/getDepartments';

            this.log(LoggerLevel.info, `[部门ID交换] 🔄 开始交换单个部门 ID: ${department_id}`);

            const res = await functionLimiter(async () => {
                await this.ensureTokenValid();

                const response = await this.axiosInstance.post(
                    url,
                    {
                        department_id_type,
                        department_ids: [department_id]
                    },
                    {
                        headers: { Authorization: `${this.accessToken}` }
                    }
                );

                this.log(LoggerLevel.debug, `[部门ID交换] 🔄 交换部门 ID: ${department_id} 调用完成, 返回状态: ${response.data.code}`);
                this.log(LoggerLevel.debug, `[部门ID交换] 🔄 交换部门 ID: ${department_id} 调用完成, 返回信息: ${JSON.stringify(response.data)}`);
                return response.data.data[0]; // 返回第一个元素
            });

            return res;
        },

        /**
         * 批量部门 ID 交换
         * @param params 请求参数
         * @returns 所有子请求的返回结果数组
         */
        batchExchange: async (params: { department_id_type: 'department_id' | 'external_department_id' | 'external_open_department_id'; department_ids: string[] }): Promise<any[]> => {
            const { department_id_type, department_ids } = params;
            // department_id_type 可选值：
            // - 'department_id' (如 "1758534140403815")
            // - 'external_department_id' (外部平台 department_id, 无固定格式)
            // - 'external_open_department_id' (以 'oc_' 开头的 open_department_id)

            const url = '/api/integration/v2/feishu/getDepartments';

            const chunkSize = 100;
            const chunks: string[][] = [];
            for (let i = 0; i < department_ids.length; i += chunkSize) {
                chunks.push(department_ids.slice(i, i + chunkSize));
            }

            this.log(LoggerLevel.info, `[批量部门ID交换] 🔄 总共 ${department_ids.length} 个部门 ID, 拆分为 ${chunks.length} 组, 每组最多 ${chunkSize} 个`);

            const results: any[] = [];
            for (const [index, chunk] of chunks.entries()) {
                this.log(LoggerLevel.info, `[批量部门ID交换] 🔄 开始交换第 ${index + 1} 组, 共 ${chunk.length} 个`);

                const res = await functionLimiter(async () => {
                    await this.ensureTokenValid();

                    const response = await this.axiosInstance.post(
                        url,
                        {
                            department_id_type,
                            department_ids: chunk
                        },
                        {
                            headers: { Authorization: `${this.accessToken}` }
                        }
                    );

                    this.log(LoggerLevel.debug, `[批量部门ID交换] 🔄 交换第 ${index + 1} 组调用完成, 返回状态: ${response.data.code}`);
                    this.log(LoggerLevel.trace, `[批量部门ID交换] 🔄 交换第 ${index + 1} 组调用完成, 返回信息: ${JSON.stringify(response.data)}`);
                    return response.data.data;
                });

                results.push(...res);
            }

            return results;
        }
    };

    /**
     * 云函数模块
     */
    public function = {
        /**
         * 调用云函数
         * @param params 请求参数 { name: string; params: any }
         * @returns 接口返回结果
         */
        invoke: async (params: { name: string; params: any }): Promise<any> => {
            const { name, params: functionParams } = params;
            await this.ensureTokenValid();

            const url = `/api/cloudfunction/v1/namespaces/${this.namespace}/invoke/${name}`;

            this.log(LoggerLevel.info, `[调用云函数] ☁️ 云函数 ${name} 开始调用`);

            const res = await this.axiosInstance.post(
                url,
                { params: functionParams },
                {
                    headers: {
                        Authorization: `${this.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            this.log(LoggerLevel.debug, `[调用云函数] ☁️ 云函数 ${name} 调用完成, 返回状态: code=${res.data.code}`);
            this.log(LoggerLevel.trace, `[调用云函数] ☁️ 云函数 ${name} 调用完成, 返回信息: code=${JSON.stringify(res.data)}`);

            return res.data;
        }
    };
}

export const apaas = {
    Client
};
