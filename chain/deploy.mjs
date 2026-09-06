import { TvmClient } from "@tvmsdk/core";
import { libNode } from "@tvmsdk/lib-node";
import { readFileSync } from "fs";

TvmClient.useBinaryLibrary(libNode);

const ENDPOINT = "https://shellnet.ackinacki.org/graphql";
const KEYS = JSON.parse(readFileSync("./deploy.keys.json", "utf8"));

async function deployContract(client, tvcPath, abiPath, constructorParams, value) {
  const tvc = readFileSync(tvcPath);
  const abi = JSON.parse(readFileSync(abiPath, "utf8"));
  
  const deployResult = await client.contracts.deploy({
    tvc: tvc.toString("base64"),
    abi: abi,
    constructorParams: constructorParams,
    signer: { type: "Keys", keys: KEYS },
    value: value,
    deployOptions: {
      dappId: "c8f43f24be0fb530d4752b68421c5d3dfd377ebc9459ee5442c5f3cf7719fc72",
    },
  });
  
  console.log("Deploy result:", deployResult);
  return deployResult;
}

async function main() {
  const client = new TvmClient({ network: { endpoints: [ENDPOINT] } });
  
  try {
    console.log("Deploying PerimeterProfiles...");
    await deployContract(client, "./PerimeterProfiles.tvc", "./PerimeterProfiles.abi.json", { value: 10000000000 }, 10000000000);
    
    console.log("Deploying PerimeterItems...");
    await deployContract(client, "./PerimeterItems.tvc", "./PerimeterItems.abi.json", { ownerKey: "0xc8f43f24be0fb530d4752b68421c5d3dfd377ebc9459ee5442c5f3cf7719fc72" }, 10000000000);
    
    console.log("Deploying PerimeterArena...");
    await deployContract(client, "./PerimeterArena.tvc", "./PerimeterArena.abi.json", {}, 10000000000);
    
    console.log("All contracts deployed!");
  } catch (e) {
    console.error("Error:", e);
  } finally {
    client.close();
  }
}

main();