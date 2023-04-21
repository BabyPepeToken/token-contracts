import { ethers, network } from 'hardhat'

const router = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
const deadWallet = "0x000000000000000000000000000000000000dEaD"
const marketing = "0x1146e30A4d44eac8CE23730402c594Fc246e226A"
const BABY_PEPE_CONTRACT = "0x5dD0F5dA07E9C63F2d216179311EF8cB68ABb629"

export async function main(){
    console.log("---------HERE ----------")
    
    const [deployer] = await ethers.getSigners()
    const babyPepe = await ethers.getContractAt("BabyPepe", BABY_PEPE_CONTRACT)
    const totalSupply= await babyPepe.totalSupply()
    const liquidityTokens = totalSupply.mul(831).div(1000)
    const tokensForReserves = totalSupply.div(10)
    const teamTokens = totalSupply.sub(liquidityTokens).sub(tokensForReserves)

    // CHANGE TO MAKE SURE VALUE IS 2K
    const ethForLiquidity = ethers.utils.parseEther("1")
    
    const uniRouter = await ethers.getContractAt("IUniswapV2Router02", router);
    const babyPair = await ethers.getContractAt("IUniswapV2Pair", await babyPepe.uniswapV2Pair());

    await babyPepe.approve(router, liquidityTokens)
    await uniRouter.addLiquidityETH(babyPepe.address, liquidityTokens,  liquidityTokens, ethForLiquidity, deployer.address, Math.floor(Date.now()/1000)+1200, {value: ethForLiquidity})

    await babyPepe.transfer(marketing, tokensForReserves)
    const currentLPTokens = await babyPair.balanceOf(deployer.address)
    await babyPair.transfer(deadWallet, currentLPTokens)
    console.log("TEAM TOKENS TO ADD TO LOCK", teamTokens.toString())

    // OUT OF SCOPE OF THIS SCRIPT:
    // ADD TEAM TOKENS TO LOCK
    // exclude from FEES and REWARDS
    // TRANSFER OWNERSHIP TO MARKETING
}


main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
