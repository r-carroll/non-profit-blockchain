'use strict';
const shim = require('fabric-shim');
const util = require('util');


/************************************************************************************************
 * 
 * GENERAL FUNCTIONS 
 * 
 ************************************************************************************************/

/**
 * Executes a query using a specific key
 * 
 * @param {*} key - the key to use in the query
 */
 async function queryByKey(stub, key) {
    console.log('============= START : queryByKey ===========');
    console.log('##### queryByKey key: ' + key);
  
    let resultAsBytes = await stub.getState(key); 
    if (!resultAsBytes || resultAsBytes.toString().length <= 0) {
      throw new Error('##### queryByKey key: ' + key + ' does not exist');
    }
    console.log('##### queryByKey response: ' + resultAsBytes);
    console.log('============= END : queryByKey ===========');
    return resultAsBytes;
  }
  
  /**
   * Executes a query based on a provided queryString
   * 
   * I originally wrote this function to handle rich queries via CouchDB, but subsequently needed
   * to support LevelDB range queries where CouchDB was not available.
   * 
   * @param {*} queryString - the query string to execute
   */
  async function queryByString(stub, queryString) {
    console.log('============= START : queryByString ===========');
    console.log("##### queryByString queryString: " + queryString);
  
    // CouchDB Query
    // let iterator = await stub.getQueryResult(queryString);
  
    // Equivalent LevelDB Query. We need to parse queryString to determine what is being queried
    // In this chaincode, all queries will either query ALL records for a specific docType, or
    // they will filter ALL the records looking for a specific NGO, Donor, Donation, etc. So far, 
    // in this chaincode there is a maximum of one filter parameter in addition to the docType.
    let docType = "";
    let startKey = "";
    let endKey = "";
    let jsonQueryString = JSON.parse(queryString);
    if (jsonQueryString['selector'] && jsonQueryString['selector']['docType']) {
      docType = jsonQueryString['selector']['docType'];
      startKey = docType + "0";
      endKey = docType + "z";
    }
    else {
      throw new Error('##### queryByString - Cannot call queryByString without a docType element: ' + queryString);   
    }
  
    let iterator = await stub.getStateByRange(startKey, endKey);
  
    // Iterator handling is identical for both CouchDB and LevelDB result sets, with the 
    // exception of the filter handling in the commented section below
    let allResults = [];
    while (true) {
      let res = await iterator.next();
  
      if (res.value && res.value.value.toString()) {
        let jsonRes = {};
        console.log('##### queryByString iterator: ' + res.value.value.toString('utf8'));
  
        jsonRes.Key = res.value.key;
        try {
          jsonRes.Record = JSON.parse(res.value.value.toString('utf8'));
        } 
        catch (err) {
          console.log('##### queryByString error: ' + err);
          jsonRes.Record = res.value.value.toString('utf8');
        }
        // ******************* LevelDB filter handling ******************************************
        // LevelDB: additional code required to filter out records we don't need
        // Check that each filter condition in jsonQueryString can be found in the iterator json
        // If we are using CouchDB, this isn't required as rich query supports selectors
        let jsonRecord = jsonQueryString['selector'];
        // If there is only a docType, no need to filter, just return all
        console.log('##### queryByString jsonRecord - number of JSON keys: ' + Object.keys(jsonRecord).length);
        if (Object.keys(jsonRecord).length == 1) {
          allResults.push(jsonRes);
          continue;
        }
        for (var key in jsonRecord) {
          if (jsonRecord.hasOwnProperty(key)) {
            console.log('##### queryByString jsonRecord key: ' + key + " value: " + jsonRecord[key]);
            if (key == "docType") {
              continue;
            }
            console.log('##### queryByString json iterator has key: ' + jsonRes.Record[key]);
            if (!(jsonRes.Record[key] && jsonRes.Record[key] == jsonRecord[key])) {
              // we do not want this record as it does not match the filter criteria
              continue;
            }
            allResults.push(jsonRes);
          }
        }
        // ******************* End LevelDB filter handling ******************************************
        // For CouchDB, push all results
        // allResults.push(jsonRes);
      }
      if (res.done) {
        await iterator.close();
        console.log('##### queryByString all results: ' + JSON.stringify(allResults));
        console.log('============= END : queryByString ===========');
        return Buffer.from(JSON.stringify(allResults));
      }
    }
  }

let InsuranceChaincode = class {
  /**
   * Initialize the state when the chaincode is either instantiated or upgraded
   *
   * @param {*} stub
   */
  async Init(stub) {
    console.log(
      "=========== Init: Instantiated / Upgraded insurance chaincode ==========="
    );
    return shim.success();
  }

  /**
   * The Invoke method will call the methods below based on the method name passed by the calling
   * program.
   *
   * @param {*} stub
   */
  async Invoke(stub) {
    console.log("============= START : Invoke ===========");
    let ret = stub.getFunctionAndParameters();
    console.log("##### Invoke args: " + JSON.stringify(ret));

    let method = this[ret.fcn];
    if (!method) {
      console.error(
        "##### Invoke - error: no chaincode function with name: " +
          ret.fcn +
          " found"
      );
      throw new Error("No chaincode function with name: " + ret.fcn + " found");
    }
    try {
      let response = await method(stub, ret.params);
      console.log("##### Invoke response payload: " + response);
      return shim.success(response);
    } catch (err) {
      console.log("##### Invoke - error: " + err);
      return shim.error(err);
    }
  }

  /**
   * Creates a new insured
   *
   * @param {*} stub
   * @param {*} args - JSON as follows:
   * {
   *    "insuredUserName":"edge",
   *    "email":"edge@abc.com",
   *    "company":"ABC Logistics"
   *    "registeredDate":"2020-10-22T11:52:20.182Z"
   * }
   */
  async createInsured(stub, args) {
    console.log("============= START : createInsured ===========");
    console.log("##### createInsured arguments: " + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let key = "insured" + json["insuredUserName"];
    json["docType"] = "insured";

    console.log("##### createInsured payload: " + JSON.stringify(json));

    // Check if the insured already exists
    let insuredQuery = await stub.getState(key);
    if (insuredQuery.toString()) {
      throw new Error(
        "##### createDonor - This donor already exists: " +
          json["donorUserName"]
      );
    }

    await stub.putState(key, Buffer.from(JSON.stringify(json)));
    console.log("============= END : createInsured ===========");
  }

  /**
   * Retrieves a specific insured
   *
   * @param {*} stub
   * @param {*} args
   */
  async queryInsured(stub, args) {
    console.log("============= START : queryInsured ===========");
    console.log("##### queryInsured arguments: " + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let key = "insured" + json["insuredUserName"];
    console.log("##### queryInsured key: " + key);

    return queryByKey(stub, key);
  }

  /**
   * Retrieves all insured
   *
   * @param {*} stub
   * @param {*} args
   */
  async queryAllInsureds(stub, args) {
    console.log("============= START : queryAllInsureds ===========");
    console.log("##### queryAllInsureds arguments: " + JSON.stringify(args));

    let queryString = '{"selector": {"docType": "insured"}}';
    return queryByString(stub, queryString);
  }

  /************************************************************************************************
   *
   * Carrier functions
   *
   ************************************************************************************************/

  /**
   * Creates a new Carrier
   *
   * @param {*} stub
   * @param {*} args - JSON as follows:
   * {
   *    "carrierNumber":"123456"
   *    "carrierName":"InsurTech",
   *    "carrierDescription":"Meeting your insurance needs with new and exciting technology",
   *    "address":"One Insurtech Blvd",
   *    "contactNumber":"82372837",
   *    "contactEmail":"info@insurtech.com"
   * }
   */
  async createCarrier(stub, args) {
    console.log("============= START : createCarrier ===========");
    console.log("##### createCarrier arguments: " + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let key = "carrier" + json["carrierNumber"];
    json["docType"] = "carrier";

    console.log("##### createCarrier payload: " + JSON.stringify(json));

    // Check if the carrier already exists
    let carrierQuery = await stub.getState(key);
    if (carrierQuery.toString()) {
      throw new Error(
        "##### createCarrier - This carrier already exists: " +
          json["carrierNumber"]
      );
    }

    await stub.putState(key, Buffer.from(JSON.stringify(json)));
    console.log("============= END : createCarrier ===========");
  }

  /**
   * Retrieves a specific carrier
   *
   * @param {*} stub
   * @param {*} args
   */
  async queryCarrier(stub, args) {
    console.log("============= START : queryCarrier ===========");
    console.log("##### queryCarrier arguments: " + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let key = "carrier" + json["carrierNumber"];
    console.log("##### queryCarrier key: " + key);

    return queryByKey(stub, key);
  }

  /**
   * Retrieves all carriers
   *
   * @param {*} stub
   * @param {*} args
   */
  async queryAllCarriers(stub, args) {
    console.log("============= START : queryAllCarriers ===========");
    console.log("##### queryAllCarriers arguments: " + JSON.stringify(args));

    let queryString = '{"selector": {"docType": "carriers"}}';
    return queryByString(stub, queryString);
  }

  /**
   * Creates a new policy
   * 
   * @param {*} stub 
   * @param {*} args - JSON as follows:
   * {
   *    "policyId":"2211",
   *    "policyPayout":100,
   *    "rainfallAmount":
   *    "insuredUserName":"edge",
   *    "carrierNumber":"6322"
   * }
   */
   async createPolicy(stub, args) {
    console.log('============= START : createPolicy ===========');
    console.log('##### createPolicy arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let key = 'policy' + json['policyId'];
    json['docType'] = 'policy';

    console.log('##### createPolicy policy: ' + JSON.stringify(json));

    // Confirm the policy exists
    let carrierKey = 'carrier' + json['carrierNumber'];
    let carrierQuery = await stub.getState(carrierKey);
    if (!carrierQuery.toString()) {
      throw new Error('##### createPolicy - Cannot create policy as the carrier does not exist: ' + json['carrierNumber']);
    }

    // Confirm the insured exists
    let insuredKey = 'insured' + json['insuredUserName'];
    let insuredQuery = await stub.getState(insuredKey);
    if (!insuredQuery.toString()) {
      throw new Error('##### createPolicy - Cannot create policy as the insured does not exist: ' + json['insuredUserName']);
    }

    // Check if the policy already exists
    let policyQuery = await stub.getState(key);
    if (policyQuery.toString()) {
      throw new Error('##### createPolicy - This policy already exists: ' + json['policyId']);
    }

    await stub.putState(key, Buffer.from(JSON.stringify(json)));
    console.log('============= END : createPolicy ===========');
  }

  async evaluatePolicy(stub, args) {
    console.log('============= START : evaluatePolicy ===========');
    console.log('##### evaluatePolicy arguments: ' + JSON.stringify(args));

    // args is passed as a JSON string
    let json = JSON.parse(args);
    let policyId = 'policy' + json['policyId'];
    let carrierNumber = 'carrier' + json['carrierNumber'];
    let insuredUserName = "insured" + json["insuredUserName"];
  }
};