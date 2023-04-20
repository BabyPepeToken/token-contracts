import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: "0.8.18",
  networks:{
    hardhat:{
      forking:{
        url: "https://eth.public-rpc.com",
        blockNumber: 17085000
      }
    }
  }
};

export default config;
