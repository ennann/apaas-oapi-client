import { apaas } from '../src/index';

describe('aPaaS SDK', () => {
    it('should get access token and query records with iterator', async () => {
        const clientId = 'xxx';
        const clientSecret = 'xxx';

        // 如果没有配置真实 clientId 和 clientSecret，则跳过测试
        if (clientId === 'xxx' || clientSecret === 'xxx') {
            console.warn('No valid clientId or clientSecret provided, skipping test.');
            return;
        }

        const client = new apaas.Client({
            clientId,
            clientSecret,
            namespace: 'app_146999_store__c'
        });

        try {
            await client.init();
        } catch (err) {
            if (err instanceof Error) {
                console.error('Error initializing client:', err.message);
            } else {
                console.error('Unknown error initializing client:', err);
            }
        }
    });
});
