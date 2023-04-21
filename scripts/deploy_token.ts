import { ethers, network } from 'hardhat'

const router = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
const deadWallet = "0x000000000000000000000000000000000000dEaD"
const marketing = "0x1146e30A4d44eac8CE23730402c594Fc246e226A"

export async function main(){
    console.log("---------HERE ----------")
    
    const [deployer] = await ethers.getSigners()
    const BabyPepeFactory = await ethers.getContractFactory("BabyPepe", deployer)
    const babyPepe = await BabyPepeFactory.deploy([router, marketing], 5);
    await babyPepe.deployed()
    console.log("BabyPepe deployed to:", babyPepe.address)
}


main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
