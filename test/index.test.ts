import { apaas } from '../src/index';

describe('aPaaS SDK', () => {
    it('should get access token and query records with iterator', async () => {
        const client = new apaas.Client({
            clientId: 'xxx',
            clientSecret: 'xxx',
            namespace: 'app_146999_store__c'
        });

        await client.init();

        const { total, items } = await client.object.search.recordsWithIterator({
            object_name: 'object_store',
            data: {
                need_total_count: true,
                page_size: 100,
                offset: 0,
                select: ['_id', 'store_code', 'store_name', 'store_department', 'store_type', 'store_manager', 'store_manager_id', 'store_chat_group', '_createdAt'],
                filter: {
                    conditions: [
                        {
                            operator: 'greaterThan',
                            left: {
                                type: 'metadataVariable',
                                settings: JSON.stringify({
                                    fieldPath: [
                                        {
                                            fieldApiName: '_createdAt',
                                            objectApiName: 'object_store'
                                        }
                                    ]
                                })
                            },
                            right: {
                                type: 'constant',
                                settings: JSON.stringify({
                                    data: 1751040000000
                                })
                            }
                        }
                    ]
                },
                use_page_token: true,
                order_by: [
                    {
                        field: '_createdAt',
                        direction: 'desc'
                    }
                ]
            }
        });

        console.info('接口返回 total:', total);
        console.info('实际获取 items.length:', items.length);

        expect(items).toBeDefined();
        expect(items.length).toBe(total); // 验证一致性
    });
});
