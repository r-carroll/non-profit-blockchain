package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/hyperledger/fabric/core/chaincode/shim"
	pb "github.com/hyperledger/fabric/protos/peer"
)

type SmartContract struct {
	contractapi.Contract
}

type TripDetails struct {
	ObjectType       string          `json:"docType"` // docType is used to distinguish the various types of objects in state database
	tripId           string          `json:"tripId"`
	payoutStatus     string          `json:"payoutStatus"`
	tripStatus       TripStatus      `json:"tripStatus"`
	startingPoint    Point           `json:"startingPoint"`
	finalDestination Point           `json:"finalDestination"`
	vehicleDetails   VehicleDetails  `json:"vehicleDetails"`
	coverageDetails  CoverageDetails `json:"coverageDetails"`
	userDetails      UserDetails     `json:"userDetails"`
	policyDetails    PolicyDetails   `json:"policyDetails"`
	invoiceDetails   InvoiceDetails  `json:"invoiceDetails"`
	// TODO: add events
}

type Point struct {
	name            string `json:"name"`
	address         string `json:"address"`
	city            string `json:"city"`
	state           string `json:"city/province"`
	country         string `json:"country"`
	zipcode         string `json:"zipcode"`
	saveAddressFlag bool   `json"saveAddressFlag"`
}

type TripStatus struct {
	plannedStartTimestamp string  `json:"plannedStartTimestamp"`
	projectedEndTimestamp string  `json:"projectedEndTimestamp"`
	estimatedDistance     float32 `json:"estimatedDistance"`
	distanceMeasurement   string  `json:"distanceMeasurement"`
	estimatedDuration     string  `json:"estimatedDuration"`
}

type VehicleDetails struct {
	identificationNumber string `json:"identificationNumber"`
	vehicleType          string `json:"vehicleType"`
	driverName           string `json:"driverName"`
	driverLicenseId      string `json:"driverLicenseId"`
}

type UserDetails struct {
	accessID       string `json:"accessID"`
	orgName        string `json:"orgName"`
	billingAddress string `json:"billingAddress"`
}

type PolicyDetails struct {
	masterPolicyId string `json:"masterPolicyId"`
	effectiveDate  string `json:"effectiveDate"`
	expiryDate     string `json:"expiryDate"`
}

type InvoiceDetails struct {
	number int    `json:"number"`
	date   string `json:"date"`
}

type CoverageInfo struct {
	ObjectType      string          `json:"docType"`
	tripId          string          `json:"tripId"`
	coverageDetails CoverageDetails `json:"coverageDetails"`
	userDetails     UserDetails     `json:"userDetails"`
	policyDetails   PolicyDetails   `json:"policyDetails"`
	invoiceDetails  InvoiceDetails  `json:"invoiceDetails"`
}

type CoverageDetails struct {
	coverageStatus         string   `json:"coverageStatus"`
	coverageType           string   `json:"coverageType"`
	premium                int      `json:"premium"`
	coverageAmount         float32  `json:"coverageAmount"`
	coverageThresholdValue int      `json:"coverageThresholdValue"`
	factorsCovered         []string `json:"factorsCovered"`
}

func (s *SmartContract) Init(stub shim.ChaincodeStubInterface) pb.Response {
	fmt.Println("Initializing chaincode")
	return shim.Success(nil)
}

func (s *SmartContract) QueryTrip(ctx contractapi.TransactionContextInterface, tripId string) (*TripDetails, error) {
	tripAsBytes, err := ctx.GetStub().GetState(tripId)

	if err != nil {
		return nil, fmt.Errorf("Failed to read from world state. %s", err.Error())
	}

	if tripAsBytes == nil {
		return nil, fmt.Errorf("%s does not exist", tripId)
	}

	tripDetails := new(TripDetails)
	_ = json.Unmarshal(tripAsBytes, tripDetails)

	return tripDetails, nil
}

func (s *SmartContract) initTrip(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	fmt.Println("- start init trip details")
	jsonFile, err := os.Open("tripInfo.json") // TODO: replace with API call or however we are retrieving the JSON

	if err != nil {
		fmt.Println(err)
		return shim.Error(err)
	}
	fmt.Println("Successfully load trip details")
	defer jsonFile.Close()
	tripJSONBytes, _ := ioutil.ReadAll(jsonFile)
	var tripDetails TripDetails
	json.Unmarshal(tripJSONBytes, &tripDetails)

	// TODO: what error handling do we want to add?

	existingTripDetails, err := stub.GetPrivateData("tripDetails", tripDetails.tripId)
	if err != nil {
		return shim.Error("Failed to get trip details: " + err.Error())
	} else if existingTripDetails != nil {
		fmt.Println("This trip already exists: " + tripDetails.tripId)
		return shim.Error("This trip already exists: " + tripDetails.tripId)
	}

	err = stub.PutPrivateData("tripDetails", tripDetails.tripId, tripJSONBytes)
	if err != nil {
		return shim.Error(err.Error())
	}

	fmt.Println("- end init trip details")
	return shim.Success(nil)
}

func (s *SmartContract) addCoverageDetails(ctx contractapi.TransactionContextInterface, coverageInfo CoverageInfo, args []string) pb.Response {
	fmt.Println("- start init coverage details")
	tripDetails, err := s.QueryTrip(ctx, coverageInfo.tripId)

	if err != nil {
		return err
	}

	tripDetails.coverageDetails = coverageInfo.coverageDetails
	tripAsBytes, _ := json.Marshal(tripDetails)
	return ctx.GetStub().PutState(tripDetails.tripId, tripAsBytes)
}
