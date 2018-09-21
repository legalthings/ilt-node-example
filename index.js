'use strict';
const ILTHelper = require('./lib/ILTHelper');


const seed = 'some ilt seed';
const licenseId = '123456';

const node1 = 'http://ilt-fullnode-staging.eu-west-1.elasticbeanstalk.com';
// const node1 = 'http://lto-fullnode-staging.eu-west-1.elasticbeanstalk.com';

const timeout = ms => new Promise(res => setTimeout(res, ms));

(async() => {

  //// Initialization - loading all keys (accounts)

  const iltHelper = new ILTHelper(node1);
  const systemkey = await iltHelper.loadSystemKey();
  const nodeAddress = await iltHelper.loadNodeAddress();

  // const iltHelper2 = new ILTHelper(node2);
  // const systemkey2 = await iltHelper2.loadSystemKey();
  // const nodeAddress2 = await iltHelper2.loadNodeAddress();

  const iltAccount = iltHelper.createAccount(seed);
  const wasteCompanyAccount = iltHelper.createAccount('seed for the waste company');
  const enforcerAccount = iltHelper.createAccount('seed for the enforcer');

  const transportAccount = iltHelper.createAccount('seed for the transport company');
  const storageAccount = iltHelper.createAccount('seed for the storage company');

  const iltPublicSignKey = iltAccount.getPublicSignKey();

  // Removing old chains and flows for test purposes

  console.log('Delete previous chain and processes');

  console.log(await iltHelper.deleteMainProcess(iltAccount, licenseId));
  console.log(await iltHelper.deleteShipmentProcess(iltAccount, licenseId, 'SH1234'));
  console.log(await iltHelper.deleteEventChain(iltAccount, licenseId));

  // console.log(await iltHelper2.deleteMainProcess(iltAccount, licenseId));
  // console.log(await iltHelper2.deleteShipmentProcess(iltAccount, licenseId, 'SH1234'));
  // console.log(await iltHelper2.deleteEventChain(iltAccount, licenseId));

  //// ILT generates the license (chain)

  // Trigger the first action of the licenseScenario to instantiate the process
  const licenseInfo = {
    reference: '123456',
    shipments: 3,
    quantity: 20,
    material: 'general garbage',
    period: {
      from: '2018-01-01',
      to: '2018-12-31'
    },
    license_holder: {
      name: 'Waste BV',
      public_key: wasteCompanyAccount.getPublicSignKey(),
      systemkey,
      node: nodeAddress
    },
    enforcer: {
      name: 'Enforcer',
      public_key: enforcerAccount.getPublicSignKey(),
      systemkey,
      node: nodeAddress
    }
  };
  let chain = iltHelper.createLicenseChain(iltAccount, licenseId, systemkey, licenseInfo, nodeAddress);
  let res  = await iltHelper.sendChain(iltAccount, chain);

  console.log(res);

  //// License Holder (Waste BV) initiates a shipment

  const licenseProcess = await iltHelper.loadMainProcess(wasteCompanyAccount, licenseId, iltPublicSignKey, 'live');

  const shipmentInfo = {
    reference: 'SH1234',
    material: 'general garbage',
    package_type: 'plastic',
    shipment_date: '2018-06-01',
    license_process: licenseProcess.id,
    quantity: 6.2,
    transport: {
      name: 'Transport BV',
      public_key: transportAccount.getPublicSignKey(),
      systemkey: systemkey,
      node: nodeAddress
    },
    recipient: {
      name: 'Storage BV',
      public_key: storageAccount.getPublicSignKey(),
      systemkey,
      node: nodeAddress
    },
    processor: {
      name: 'Storage BV',
      public_key: storageAccount.getPublicSignKey(),
      systemkey,
      node: nodeAddress
    },
    "notification": {
      "auth_token": "www.3cd308bf83f700b78fa56b68d4486d02fc3d5ee30e57",
      "url": "http://requestbin.fullcontact.com/11qggts1"
    }
  };

  // Reload the chain because the node will have added extra events to it
  chain = await iltHelper.loadChain(wasteCompanyAccount, licenseId, iltPublicSignKey);

  await iltHelper.startShipment(chain, wasteCompanyAccount, licenseId, shipmentInfo);
  res  = await iltHelper.sendChain(wasteCompanyAccount, chain);

  console.log('Shipment started');

  //// Transporter indicates the start of a transport

  // Loading the process should be always be done based on the ilt account, because the id of the process is created from it
  const shipmentProcess = await iltHelper.loadShipmentProcess(transportAccount, licenseId, shipmentInfo.reference, iltPublicSignKey, 'ready');

  // Loading the chain should always be done based on the ilt account, because that signkey is used to create the id
  chain = await iltHelper.loadChain(transportAccount, licenseId, iltPublicSignKey);

  chain = iltHelper.startTransport(chain, transportAccount, shipmentProcess.id);
  res  = await iltHelper.sendChain(transportAccount, chain);

  await iltHelper.loadShipmentProcess(transportAccount, licenseId, shipmentInfo.reference, iltPublicSignKey, 'transporting');
  console.log('Transport started');

  //// Recipeint indicates the transport is received

  chain = await iltHelper.loadChain(storageAccount, licenseId, iltPublicSignKey);

  const transportInfo = {
    quantity: 6.0
  };

  chain = iltHelper.receiveTransport(chain, storageAccount, shipmentProcess.id, transportInfo);
  res  = await iltHelper.sendChain(storageAccount, chain);

  await iltHelper.loadShipmentProcess(transportAccount, licenseId, shipmentInfo.reference, iltPublicSignKey, 'received');
  console.log('Transport received');

  //// Processor indicates the transport is completed

  chain = await iltHelper.loadChain(storageAccount, licenseId, iltPublicSignKey);

  chain = iltHelper.processShipment(chain, storageAccount, shipmentProcess.id);
  res  = await iltHelper.sendChain(storageAccount, chain);



  await iltHelper.loadShipmentProcess(transportAccount, licenseId, shipmentInfo.reference, iltPublicSignKey, ':success');
  console.log('Shipment completed');


  //// Enforcer loads all the shipment data from the license

  // The enforcer should be able to load all the shipment processes connected to a license
  const shipmentProcesses = await iltHelper.loadAllShipments(enforcerAccount, licenseId, iltPublicSignKey);
  console.log(shipmentProcesses);



})();

