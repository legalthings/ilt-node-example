const LTO = require('lto-api').LTO;
const Event = require('lto-api').Event;
const EventChain = require('lto-api').EventChain;
const HTTPSignature = require('lto-api').HTTPSignature;
const request = require('request-promise');
const UUID = require('node-uuid');

class ILTHelper {

  constructor() {
    this.url = 'http://ilt.legalthings.one';
    this.lto = new LTO();
  }

  createAccount(seed) {
    return this.lto.createAccountFromExistingPhrase(seed);
  }

  async loadSystemKey() {
    const systemInfo = await request({url: `${this.url}/api/events/`, json: true});
    return systemInfo.signkey;
  }


  createLicenseChain(account, licenseId, signkey, licenseInfo) {

    // Create a chain based on the ilt account and the license id
    const chain = account.createEventChain(licenseId);

    // Add ILT identity to the chain via the first event
    const identityEvent = this.createIdentity(account, 'ILT', signkey);
    identityEvent.addTo(chain).signWith(account);

    // Add the licenseScenario we are going to run to the chain
    const scenario = require(`../scenarios/ilt-main.json`);
    const scenarioEvent = new Event(scenario);
    scenarioEvent.addTo(chain).signWith(account);

    const key = scenario.actions['issue'].default_response || 'ok';

    const processId = chain.createProjectionId('main');

    // Perform action to the issue license
    const response = {
      '$schema': 'https://specs.livecontracts.io/v0.1.0/response/schema.json#',
      process: {
        id: `lt:/processes/${processId}`,
        scenario: {
          id: scenario.id + `?v=${scenarioEvent.getResourceVersion()}`
        },
      },
      action: {
        key: 'issue'
      },
      actor: {
        key: 'issuer',
        id: account.id
      },
      key,
      data: licenseInfo
    };

    const issueEvent = new Event(response);
    issueEvent.addTo(chain).signWith(account);
    return chain;
  }

  addIdentity(account, name, iltAccount, chain) {
    const event = this.createIdentity(account, name);
    event.addTo(chain).signWith(iltAccount);

    return chain;
  }

  async startShipment(chain, account, licenseId, shipmentInfo) {
    // Add the licenseScenario we are going to run to the chain
    const scenario = require(`../scenarios/ilt-shipment.json`);
    const scenarioEvent = new Event(scenario);
    scenarioEvent.addTo(chain).signWith(account);

    const res = await this.sendChain(account, chain);

    const key = scenario.actions['start'].default_response || 'ok';

    const processId = chain.createProjectionId(shipmentInfo.reference);

    // Perform action to start the shipment
    const response = {
      '$schema': 'https://specs.livecontracts.io/v0.1.0/response/schema.json#',
      process: {
        id: `lt:/processes/${processId}`,
        scenario: {
          id: scenario.id + `?v=${scenarioEvent.getResourceVersion()}`
        },
      },
      action: {
        key: 'start'
      },
      actor: {
        key: 'license_holder',
        id: account.id
      },
      key,
      data: shipmentInfo
    };

    const startEvent = new Event(response);
    startEvent.addTo(chain).signWith(account);

    return chain;
  }

  startTransport(chain, account, processId) {

    // Perform action to start the shipment
    const response = {
      '$schema': 'https://specs.livecontracts.io/v0.1.0/response/schema.json#',
      process: {
        id: `lt:/processes/${processId}`,
      },
      action: {
        key: 'transport'
      },
      actor: {
        key: 'transport',
        id: account.id
      },
      key: 'ok'
    };

    const event = new Event(response);
    event.addTo(chain).signWith(account);

    return chain;
  }

  receiveTransport(chain, account, processId, data) {
    // Perform action to start the shipment
    const response = {
      '$schema': 'https://specs.livecontracts.io/v0.1.0/response/schema.json#',
      process: {
        id: `lt:/processes/${processId}`,
      },
      action: {
        key: 'receive'
      },
      actor: {
        key: 'recipient',
        id: account.id
      },
      key: 'ok',
      data
    };

    const event = new Event(response);
    event.addTo(chain).signWith(account);

    return chain;
  }

  processShipment(chain, account, processId) {
    // Perform action to start the shipment
    const response = {
      '$schema': 'https://specs.livecontracts.io/v0.1.0/response/schema.json#',
      process: {
        id: `lt:/processes/${processId}`,
      },
      action: {
        key: 'process'
      },
      actor: {
        key: 'processor',
        id: account.id
      },
      key: 'ok'
    };

    const event = new Event(response);
    event.addTo(chain).signWith(account);

    return chain;
  }

  createIdentity(account, name, signkey) {
    account.id = UUID.v4();

    //const userKey = account.getPublicSignKey();

    return new Event({
      $schema: 'https://specs.livecontracts.io/v0.1.0/identity/schema.json#',
      id: account.id,
      info: {
        name
      },
      node: 'amqps://localhost',
      signkeys: {
        user: account.getPublicSignKey(),
        system: signkey
      },
      encryptkey: account.getPublicEncryptKey()
    });
  }

  async loadChain(account, licenseId, iltPublicKey) {
    // To load the chain we will need to generate the chain id based on the ilt account key and the licenseId
    const chainId = this.lto.createEventChainId(iltPublicKey, licenseId);

    const path = `/api/events/event-chains/${chainId}`;
    const method = 'get';

    const chain = new EventChain();
    const chainData = await this.sendRequest(account, path, method);

    return chain.setValues(chainData);
  }

  async loadAllShipments(account, licenseId, iltPublicKey) {
    const mainprocess = await this.loadMainProcess(account, licenseId, iltPublicKey);
    return this.loadProcessesByMainProcess(account, mainprocess.id);
  }

  loadMainProcess(account, licenseId, iltPublicKey) {
    return this.loadProcess(account, licenseId, 'main', iltPublicKey);
  }

  loadShipmentProcess(account, licenseId, shipmentId, iltPublicKey) {
    return this.loadProcess(account, licenseId, shipmentId, iltPublicKey);
  }

  loadProcess(account, licenseId, process, iltPublicKey) {
    // To load the chain
    const chainId = this.lto.createEventChainId(iltPublicKey, licenseId);
    const chain = new EventChain(chainId);
    const processId = chain.createProjectionId(process);

    const path = `/api/flow/processes/${processId}`;
    const method = 'get';

    return this.sendRequest(account, path, method);
  }

  loadProcessesByMainProcess(account, processId) {
    const path = `/api/flow/processes`;
    const method = 'get';
    const qs = {
      'assets[license_process][id]': processId,
      full: true
    };

    return this.sendRequest(account, path, method, null, qs);
  }

  deleteEventChain(account, licenseId, publicKey) {
    if (!publicKey) {
      publicKey = account.getPublicSignKey();
    }
    const chainId = this.lto.createEventChainId(publicKey, licenseId);

    const path = `/api/events/event-chains/${chainId}`;
    const method = 'delete';

    return this.sendRequest(account, path, method);
  }

  deleteMainProcess(account, licenseId, publicKey) {
    return this.deleteProcess(account, licenseId, 'main', publicKey);
  }

  deleteShipmentProcess(account, licenseId, shipmentId, publicKey) {
    return this.deleteProcess(account, licenseId, shipmentId, publicKey);
  }

  deleteProcess(account, licenseId, process, publicKey) {
    if (!publicKey) {
      publicKey = account.getPublicSignKey();
    }
    // To load the chain
    const chainId = this.lto.createEventChainId(publicKey, licenseId);
    const chain = new EventChain(chainId);
    const processId = chain.createProjectionId(process);

    const path = `/api/flow/processes/${processId}`;
    const method = 'delete';

    return this.sendRequest(account, path, method);
  }

  sendChain(account, chain) {

    const path = '/api/events/event-chains';
    const method = 'post';

    return this.sendRequest(account, path, method, chain);
  }

  sendRequest(account, path, method, data, qs) {
    const date = (new Date()).toUTCString();

    const signature = new HTTPSignature({ '(request-target)': `${method} ${path}`, date});
    const signatureHeader = signature.signWith(account).getSignature();

    const requestOptions = {
      method,
      url: this.url + path,
      headers: {
        authorization: `signature ${signatureHeader}`,
        date
      },
      json: true
    };

    if (data) {
      requestOptions.json = data;
    }

    if (qs) {
      requestOptions.qs = qs;
    }

    return request(requestOptions);
  }
}

module.exports = ILTHelper;