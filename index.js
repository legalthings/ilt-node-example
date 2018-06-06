'use strict';
const ILTHelper = require('./lib/ILTHelper');


const seed = 'some ilt seed';
const licenseId = '123456';

(async() => {

  const iltHelper = new ILTHelper();
  const systemkey = await iltHelper.loadSystemKey();

  const iltAccount = iltHelper.createAccount(seed);
  const wasteCompanyAccount = iltHelper.createAccount('seed for the waste company');

  // Trigger the first action of the licenseScenario to instantiate the process
  const licenseInfo = {
    reference: '123456',
    shipments: 3,
    quantity: 20,
    period: {
      from: '2018-01-01',
      to: '2018-12-31'
    },
    license_holder: {
      name: 'Waste BV',
      public_key: wasteCompanyAccount.getPublicSignKey()
    }
  };
  let chain = iltHelper.createLicenseChain(iltAccount, licenseId, systemkey, licenseInfo);
  let res  = await iltHelper.sendChain(iltAccount, chain);

  const transportAccount = iltHelper.createAccount('seed for the transport company');
  const storageAccount = iltHelper.createAccount('seed for the storage company');

  const licenseProcess = await iltHelper.loadMainProcess(iltAccount, licenseId);

  const shipmentInfo = {
    reference: 'SH1234',
    license_process: licenseProcess.id,
    quantity: 6.2,
    transport: {
      name: 'Transport BV',
      public_key: transportAccount.getPublicSignKey()
    },
    recipient: {
      name: 'Storage BV',
      public_key: storageAccount.getPublicSignKey()
    }
  };

  chain = await iltHelper.loadChain(iltAccount, licenseId);

  await iltHelper.startShipment(chain, wasteCompanyAccount, licenseId, shipmentInfo);
  res  = await iltHelper.sendChain(wasteCompanyAccount, chain);

  console.log('Shipment started');

  // Loading the process should be always be done based on the ilt account, because the id of the process is created from it
  const process = await iltHelper.loadShipmentProcess(iltAccount, licenseId);

  // Loading the chain should always be done based on the ilt account, because that signkey is used to create the id
  chain = await iltHelper.loadChain(iltAccount, licenseId);

  chain = iltHelper.startTransport(chain, transportAccount, process.id);
  res  = await iltHelper.sendChain(transportAccount, chain);

  console.log('Transport started');

  const transportInfo = {
    quantity: 6.0
  };

  chain = iltHelper.receiveTransport(chain, storageAccount, process.id, transportInfo);
  res  = await iltHelper.sendChain(storageAccount, chain);

  console.log('Transport received');

  chain = await iltHelper.loadChain(iltAccount, licenseId);

  chain = iltHelper.processShipment(chain, wasteCompanyAccount, process.id);
  res  = await iltHelper.sendChain(wasteCompanyAccount, chain);

  console.log('Shipment completed');
  console.log(res);

})();

