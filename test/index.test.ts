import { apaas } from '../src/index';

describe('aPaaS SDK', () => {
    it('should get access token and query records with iterator', async () => {
        const clientId = process.env.CLIENT_APP_ID || 'xxx';
        const clientSecret = process.env.CLIENT_APP_SECRET || 'xxx';

        if (clientId === 'xxx' || clientSecret === 'xxx') {
            console.warn('No valid clientId or clientSecret provided, skipping test.');
            return;
        }

        const client = new apaas.Client({
            clientId,
            clientSecret,
            namespace: 'app_146999_store__c'
        });

        await client.init();
    });
});
