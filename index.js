'use strict';
const ILTHelper = require('./lib/ILTHelper');


const seed = 'some ilt seed';
const licenseId = '12345';
const scenarioId = 'ilt-main';

(async() => {

  const iltHelper = new ILTHelper(scenarioId);

  const iltAccount = iltHelper.createAccount(seed);
  // Trigger the first action of the scenario to instantiate the process
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
      public_key: '9h4qWaJR5u3ZhmhbgNLbm6W3kebn5ZCnE32w11WVYLZt'
    }
  };
  let chain = iltHelper.createChainWithLicenseInfo(iltAccount, licenseId, licenseInfo);
  const res = await iltHelper.sendChain(iltAccount, chain);


  const chainInfo = await iltHelper.loadChain(iltAccount, licenseId);
  console.log(chainInfo);

  const process = await iltHelper.loadProcess(iltAccount, licenseId);
  console.log(process);
})();

