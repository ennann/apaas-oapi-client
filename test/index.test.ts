import { apaas } from '../src/index';

describe('aPaaS SDK', () => {
    it('should get access token and query records with iterator', async () => {
        const client = new apaas.Client({
            clientId: 'xxx',
            clientSecret: 'xxx',
            namespace: 'app_146999_store__c'
        });

        await client.init();

    });
});
