import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter"
import "solidity-coverage"
import "@nomiclabs/hardhat-etherscan"
import { config as dotenvConfig } from "dotenv"
dotenvConfig()

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.18",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
    },
  },
  networks:{
    hardhat:{
      forking:{
        url: "https://eth.public-rpc.com",
        blockNumber: 17085000
      }
    },
    mainnet:{
      url: "https://eth.public-rpc.com",
      accounts: [process.env.DEPLOYER_KEY || ""]
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS? true : false, // set to true of false when necessary
  },
  etherscan:{
    apiKey: process.env.ETHERSCAN
  }
};

export default config;
