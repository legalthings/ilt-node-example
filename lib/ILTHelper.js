const LTO = require('lto-api').LTO;
const Event = require('lto-api').Event;
const HTTPSignature = require('lto-api').HTTPSignature;
const request = require('request-promise');
const UUID = require('node-uuid');

class ILTHelper {

  constructor(scenarioId) {
    this.url = 'http://localhost:3000';
    this.scenario = require(`../scenarios/${scenarioId}.json`);
    this.lto = new LTO();
  }

  createAccount(seed) {
    return this.lto.createAccountFromExistingPhrase(seed);
  }


  createChainWithLicenseInfo(account, licenseId, licenseInfo) {

    // Create a chain based on the ilt account and the license id
    const chain = account.createEventChain(licenseId);

    this.chainId = chain.id;

    // Add ILT identity to the chain via the first event
    const identityEvent = this.createIdentity(account, 'ILT');
    identityEvent.addTo(chain).signWith(account);

    // Add the scenario we are going to run to the chain
    const scenarioEvent = new Event(this.scenario);
    scenarioEvent.addTo(chain).signWith(account);

    const key = this.scenario.actions['issue'].default_response || 'ok';

    this.processId = chain.createProjectionId(licenseId);

    // Perform action to the issue license
    const response = {
      '$schema': 'https://specs.livecontracts.io/v0.1.0/response/schema.json#',
      process: {
        id: `lt:/processes/${this.processId}`,
        scenario: {
          id: this.scenario.id + `?v=${scenarioEvent.getResourceVersion()}`
        },
      },
      action: {
        key: 'issue'
      },
      actor: {
        key: 'ilt',
        id: account.id
      },
      key,
      data: licenseInfo
    };

    const issueEvent = new Event(response);
    issueEvent.addTo(chain).signWith(account);
    return chain;
  }

  createIdentity(account, name) {
    account.id = UUID.v4();

    const signKey = account.getPublicSignKey();

    return new Event({
      $schema: 'https://specs.livecontracts.io/v0.1.0/identity/schema.json#',
      id: account.id,
      info: {
        name
      },
      node: 'amqps://localhost',
      signkeys: {
        user: signKey,
        system: signKey
      },
      encryptkey: account.getPublicEncryptKey()
    });
  }

  loadChain(account, licenseId) {
    // To load the chain we will need to generate the chain id based on the ilt account key and the licenseId
    const chainId = account.createEventChain(licenseId).id;

    const path = `/api/events/event-chains/${chainId}`;
    const method = 'get';

    return this.sendRequest(account, path, method);
  }

  async loadProcess(account, licenseId) {
    // To load the chain
    const chain = account.createEventChain(licenseId);
    const processId = chain.createProjectionId(licenseId);

    const path = `/api/flow/processes/${processId}`;
    const method = 'get';

    return this.sendRequest(account, path, method);
  }

  sendChain(account, chain) {

    const path = '/api/events/event-chains';
    const method = 'post';

    return this.sendRequest(account, path, method, chain);
  }

  sendRequest(account, path, method, data) {
    const date = (new Date()).toUTCString();

    const signature = new HTTPSignature({ '(request-target)': `${method} ${path}`, date});
    const signatureHeader = signature.signWith(account).getSignature();

    const requestOptions = {
      method,
      url: this.url + path,
      headers: {
        authorization: `signature ${signatureHeader}`,
        date
      }
    };

    if (data) {
      requestOptions.json = data;
    }

    return request(requestOptions);
  }
}

module.exports = ILTHelper;