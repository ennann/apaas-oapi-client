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
        this.log(LoggerLevel.info, '[client] Client initialized successfully');
    }

    /**
     * 设置日志等级
     * @param level LoggerLevel
     */
    setLoggerLevel(level: LoggerLevel) {
        this.loggerLevel = level;
        this.log(LoggerLevel.info, `[logger] Log level set to ${LoggerLevel[level]}`);
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
        this.log(LoggerLevel.info, '[client] Client initialized and ready');
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
            this.log(LoggerLevel.error, `[auth] Failed to fetch access token: ${res.data.msg}`);
            throw new Error(`获取 accessToken 失败: ${res.data.msg}`);
        }

        this.accessToken = res.data.data.accessToken;
        this.expireTime = res.data.data.expireTime;
        this.log(LoggerLevel.info, '[auth] Access token refreshed successfully');
    }

    /**
     * 确保 token 有效, 若过期则刷新
     */
    private async ensureTokenValid() {
        if (this.disableTokenCache) {
            this.log(LoggerLevel.debug, '[auth] Token cache disabled, refreshing token');
            await this.getAccessToken();
            return;
        }

        if (!this.accessToken || !this.expireTime) {
            this.log(LoggerLevel.debug, '[auth] No token cached, fetching new token');
            await this.getAccessToken();
            return;
        }

        const now = dayjs().valueOf();
        if (now + 60 * 1000 > this.expireTime) {
            this.log(LoggerLevel.debug, '[auth] Token expired, refreshing');
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
            this.log(LoggerLevel.warn, '[auth] No valid token available');
            return null;
        }

        const now = dayjs().valueOf();
        const remainMs = this.expireTime - now;

        if (remainMs <= 0) {
            this.log(LoggerLevel.warn, '[auth] Token has expired');
            return 0;
        }

        const remainSeconds = Math.floor(remainMs / 1000);
        this.log(LoggerLevel.debug, `[auth] Token expires in ${remainSeconds} seconds`);
        this.log(LoggerLevel.trace, `[auth] Token expiry details: remaining=${remainSeconds}s, expireTime=${this.expireTime}, now=${now}`);
        return remainSeconds;
    }

    /**
     * 获取当前 namespace
     */
    get currentNamespace() {
        this.log(LoggerLevel.debug, `[namespace] Current namespace: ${this.namespace}`);
        return this.namespace;
    }

    /**
     * 对象模块
     */
    public object = {
        /**
         * 列出所有对象（数据表）
         * @param params 请求参数 { offset, filter?, limit }
         * @returns 接口返回结果
         */
        list: async (params: { offset: number; filter?: { type?: string; quickQuery?: string }; limit: number }): Promise<any> => {
            const { offset, filter, limit } = params;
            await this.ensureTokenValid();
            const url = `/api/data/v1/namespaces/${this.namespace}/meta/objects/list`;

            this.log(LoggerLevel.debug, `[object.list] Fetching objects list: offset=${offset}, limit=${limit}`);

            const requestData: any = { offset, limit };
            if (filter) {
                requestData.filter = filter;
            }

            const res = await this.axiosInstance.post(url, requestData, {
                headers: { Authorization: `${this.accessToken}` }
            });

            this.log(LoggerLevel.debug, `[object.list] Objects list fetched successfully: code=${res.data.code}`);
            this.log(LoggerLevel.trace, `[object.list] Response: ${JSON.stringify(res.data)}`);
            return res.data;
        },

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

                this.log(LoggerLevel.debug, `[object.metadata.field] Fetching field metadata: ${object_name}.${field_name}`);

                const res = await this.axiosInstance.get(url, {
                    headers: { Authorization: `${this.accessToken}` }
                });

                this.log(LoggerLevel.debug, `[object.metadata.field] Field metadata fetched: ${object_name}.${field_name}, code=${res.data.code}`);
                this.log(LoggerLevel.trace, `[object.metadata.field] Response: ${JSON.stringify(res.data)}`);
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

                this.log(LoggerLevel.debug, `[object.metadata.fields] Fetching all fields metadata: ${object_name}`);

                const res = await this.axiosInstance.get(url, {
                    headers: { Authorization: `${this.accessToken}` }
                });

                this.log(LoggerLevel.debug, `[object.metadata.fields] All fields metadata fetched: ${object_name}, code=${res.data.code}`);
                this.log(LoggerLevel.trace, `[object.metadata.fields] Response: ${JSON.stringify(res.data)}`);
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

                this.log(LoggerLevel.info, `[object.search.record] Querying record: ${record_id}`);

                const res = await functionLimiter(async () => {
                    await this.ensureTokenValid();

                    const response = await this.axiosInstance.post(url, { select }, { headers: { Authorization: `${this.accessToken}` } });

                    this.log(LoggerLevel.debug, `[object.search.record] Record queried: ${object_name}.${record_id}, code=${response.data.code}`);
                    this.log(LoggerLevel.trace, `[object.search.record] Response: ${JSON.stringify(response.data)}`);

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

                this.log(LoggerLevel.debug, `[object.search.records] Records queried: ${object_name}, code=${res.data.code}, total=${res.data?.data?.total || 'unknown'}`);
                this.log(LoggerLevel.trace, `[object.search.records] Response: ${JSON.stringify(res.data)}`);
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
                let totalPages = 0;

                const pageSize = data.page_size || 100;

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
                            totalPages = Math.ceil(total / pageSize);
                            this.log(LoggerLevel.info, `[object.search.recordsWithIterator] Starting paginated query: ${object_name}, total=${total}, pages=${totalPages}`);
                        }

                        nextPageToken = res.data.next_page_token;

                        const padLength = totalPages.toString().length;
                        const pageStr = page.toString().padStart(padLength, '0');
                        const totalPagesStr = totalPages.toString().padStart(padLength, '0');

                        this.log(LoggerLevel.info, `[object.search.recordsWithIterator] Page completed: [${pageStr}/${totalPagesStr}]`);
                        this.log(LoggerLevel.debug, `[object.search.recordsWithIterator] Page ${page} details: items=${res.data.items?.length}, nextToken=${nextPageToken || 'none'}`);
                        this.log(LoggerLevel.trace, `[object.search.recordsWithIterator] Page ${page} data: ${JSON.stringify(res.data?.items)}`);

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

                this.log(LoggerLevel.info, `[object.create.record] Creating record in: ${object_name}`);

                const res = await functionLimiter(async () => {
                    await this.ensureTokenValid();

                    const response = await this.axiosInstance.post(
                        url,
                        { record },
                        {
                            headers: { Authorization: `${this.accessToken}` }
                        }
                    );

                    this.log(LoggerLevel.info, `[object.create.record] Record created: ${object_name}`);
                    this.log(LoggerLevel.debug, `[object.create.record] Record created: ${object_name}, code=${response.data.code}`);
                    this.log(LoggerLevel.trace, `[object.create.record] Response: ${JSON.stringify(response.data)}`);

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

                this.log(LoggerLevel.info, `[object.create.records] Creating ${records.length} records in: ${object_name}`);
                this.log(LoggerLevel.debug, `[object.create.records] Records created: ${object_name}, code=${res.data.code}`);
                this.log(LoggerLevel.trace, `[object.create.records] Response: ${JSON.stringify(res.data)}`);
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

                this.log(LoggerLevel.debug, `[object.create.recordsWithIterator] Chunking ${records.length} records into ${chunks.length} groups of ${chunkSize}`);

                for (const [index, chunk] of chunks.entries()) {
                    page += 1;

                    this.log(LoggerLevel.debug, `[object.create.recordsWithIterator] Processing chunk ${index + 1}/${chunks.length}: ${chunk.length} records`);

                    const pageRes = await functionLimiter(async () => {
                        const res = await this.object.create.records({
                            object_name,
                            records: chunk
                        });

                        if (res.data && Array.isArray(res.data.items)) {
                            results = results.concat(res.data.items);
                        }

                        this.log(LoggerLevel.info, `[object.create.recordsWithIterator] Chunk ${page} completed: ${object_name}, created=${res.data.items.length}`);
                        this.log(LoggerLevel.debug, `[object.create.recordsWithIterator] Chunk ${page} result: ${object_name}, code=${res.data.code}`);
                        this.log(LoggerLevel.trace, `[object.create.recordsWithIterator] Chunk ${page} data: ${JSON.stringify(res.data.items)}`);

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

                this.log(LoggerLevel.info, `[object.update.record] Updating record: ${record_id}`);

                const res = await functionLimiter(async () => {
                    await this.ensureTokenValid();

                    const response = await this.axiosInstance.patch(url, { record }, { headers: { Authorization: `${this.accessToken}` } });

                    this.log(LoggerLevel.info, `[object.update.record] Record updated: ${object_name}.${record_id}`);
                    this.log(LoggerLevel.debug, `[object.update.record] Record updated: ${object_name}.${record_id}, code=${response.data.code}`);
                    this.log(LoggerLevel.trace, `[object.update.record] Response: ${JSON.stringify(response.data)}`);
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

                this.log(LoggerLevel.info, `[object.update.records] Updating ${records.length} records`);

                const response = await this.axiosInstance.patch(url, { records }, { headers: { Authorization: `${this.accessToken}` } });

                this.log(LoggerLevel.info, `[object.update.records] Records updated: ${object_name}`);
                this.log(LoggerLevel.debug, `[object.update.records] Records updated: ${object_name}, code=${response.data.code}`);
                this.log(LoggerLevel.trace, `[object.update.records] Response: ${JSON.stringify(response.data)}`);

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

                this.log(LoggerLevel.debug, `[object.update.recordsWithIterator] Chunking ${records.length} records into ${chunks.length} groups of ${chunkSize}`);

                const results: any[] = [];
                for (const [index, chunk] of chunks.entries()) {
                    this.log(LoggerLevel.debug, `[object.update.recordsWithIterator] Processing chunk ${index + 1}/${chunks.length}: ${chunk.length} records`);

                    const res = await functionLimiter(async () => {
                        await this.ensureTokenValid();

                        const response = await this.axiosInstance.patch(url, { records: chunk }, { headers: { Authorization: `${this.accessToken}` } });

                        this.log(LoggerLevel.debug, `[object.update.recordsWithIterator] Chunk ${index + 1} completed: ${object_name}, code=${response.data.code}`);
                        this.log(LoggerLevel.trace, `[object.update.recordsWithIterator] Chunk ${index + 1} response: ${JSON.stringify(response.data)}`);
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

                this.log(LoggerLevel.info, `[object.delete.record] Deleting record: ${object_name}.${record_id}`);

                const res = await functionLimiter(async () => {
                    await this.ensureTokenValid();

                    const response = await this.axiosInstance.delete(url, {
                        headers: { Authorization: `${this.accessToken}` }
                    });

                    this.log(LoggerLevel.info, `[object.delete.record] Record deleted: ${object_name}.${record_id}`);
                    this.log(LoggerLevel.debug, `[object.delete.record] Record deleted: ${object_name}.${record_id}, code=${response.data.code}`);
                    this.log(LoggerLevel.trace, `[object.delete.record] Response: ${JSON.stringify(response.data)}`);
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

                this.log(LoggerLevel.info, `[object.delete.records] Deleting ${ids.length} records from: ${object_name}`);

                const res = await functionLimiter(async () => {
                    await this.ensureTokenValid();

                    const response = await this.axiosInstance.delete(url, {
                        data: { ids },
                        headers: { Authorization: `${this.accessToken}`, 'Content-Type': 'application/json' }
                    });

                    this.log(LoggerLevel.info, `[object.delete.records] Records deleted: ${object_name}, count=${ids.length}`);
                    this.log(LoggerLevel.debug, `[object.delete.records] Records deleted: ${object_name}, count=${ids.length}, code=${response.data.code}`);
                    this.log(LoggerLevel.trace, `[object.delete.records] Response: ${JSON.stringify(response.data)}`);

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

                this.log(LoggerLevel.debug, `[object.delete.recordsWithIterator] Chunking ${ids.length} records into ${chunks.length} groups of ${chunkSize}`);

                const results: any[] = [];
                for (const [index, chunk] of chunks.entries()) {
                    this.log(LoggerLevel.info, `[object.delete.recordsWithIterator] Processing chunk ${index + 1}/${chunks.length}: ${chunk.length} records`);

                    const res = await functionLimiter(async () => {
                        await this.ensureTokenValid();

                        const response = await this.axiosInstance.delete(url, {
                            headers: { Authorization: `${this.accessToken}` },
                            data: { ids: chunk }
                        });

                        this.log(LoggerLevel.debug, `[object.delete.recordsWithIterator] Chunk ${index + 1} completed: code=${response.data.code}`);
                        this.log(LoggerLevel.trace, `[object.delete.recordsWithIterator] Chunk ${index + 1} response: ${JSON.stringify(response.data)}`);
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

            this.log(LoggerLevel.info, `[department.exchange] Exchanging department ID: ${department_id}`);

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

                this.log(LoggerLevel.debug, `[department.exchange] Department ID exchanged: ${department_id}, code=${response.data.code}`);
                this.log(LoggerLevel.trace, `[department.exchange] Response: ${JSON.stringify(response.data)}`);
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

            this.log(LoggerLevel.info, `[department.batchExchange] Chunking ${department_ids.length} department IDs into ${chunks.length} groups of ${chunkSize}`);

            const results: any[] = [];
            for (const [index, chunk] of chunks.entries()) {
                this.log(LoggerLevel.info, `[department.batchExchange] Processing chunk ${index + 1}/${chunks.length}: ${chunk.length} IDs`);

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

                    this.log(LoggerLevel.debug, `[department.batchExchange] Chunk ${index + 1} completed: code=${response.data.code}`);
                    this.log(LoggerLevel.trace, `[department.batchExchange] Chunk ${index + 1} response: ${JSON.stringify(response.data)}`);
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

            this.log(LoggerLevel.info, `[function.invoke] Invoking cloud function: ${name}`);

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

            this.log(LoggerLevel.debug, `[function.invoke] Cloud function invoked: ${name}, code=${res.data.code}`);
            this.log(LoggerLevel.trace, `[function.invoke] Response: ${JSON.stringify(res.data)}`);

            return res.data;
        }
    };
}

export const apaas = {
    Client
};
