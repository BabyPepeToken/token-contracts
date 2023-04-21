import { expect } from "chai";
import  hre, { ethers } from 'hardhat';
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const UniswapV2Router = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const deadWallet = "0x000000000000000000000000000000000000dEaD"

describe("Baby PEPE", () => {

  const setup = async () => {
    const [owner, marketingWallet, user1, user2, user3] = await ethers.getSigners();
    const Baby = await ethers.getContractFactory("BabyPepe", owner);
    const baby = await Baby.deploy([UniswapV2Router, marketingWallet.address], 5);
    await baby.deployed();
    return { baby, owner, marketingWallet, user1, user2, user3 };
  
  }

  describe("Deployment", () => {

    describe("Metadata", ()=>{
      it("Should return the correct name", async()=>{
        const { baby } = await loadFixture(setup);
        expect(await baby.name()).to.equal("Baby Pepe");
      });
      it("Should return the correct symbol", async()=>{
        const { baby } = await loadFixture(setup);
        expect(await baby.symbol()).to.equal("BBPP");
      });
      it("Should return the correct decimals", async() =>{
        const { baby } = await loadFixture(setup);
        expect(await baby.decimals()).to.equal(18);
      });
    })

    describe("Initial values",  ()=>{
      it("Should return the correct owner", async ()=> {
        const { baby, owner } = await loadFixture(setup);
        expect(await baby.owner()).to.equal(owner.address);
      });
      it("Should return the correct total supply", async() => {
        const { baby, owner } = await loadFixture(setup);
        const maxSupply = ethers.utils.parseEther("210000000000000")
        expect(await baby.totalSupply()).to.equal(maxSupply);
        expect(await baby.balanceOf(owner.address)).to.equal(maxSupply);
      });
      it("Should have created the token tracker successfully", async()=>{
        const { baby } = await loadFixture(setup);
        const tracker = await ethers.getContractAt("TokenDividendTracker",  await baby.dividendTracker());
        expect( await tracker.owner()).to.equal(baby.address)
      });
      it("Should have created the initial pair", async () => {
        const { baby } = await loadFixture(setup);
        const pair = await ethers.getContractAt("IUniswapV2Pair", await baby.uniswapV2Pair());
        const token0 = await pair.token0();
        const token1 = await pair.token1();
        if(token0 !== baby.address && token1 !== baby.address){
          throw new Error("Pair was not created correctly");
        }
      })
    });
    
  })

  describe("ERC20 functionalities", () => {


    describe("Allowance Tests", ()=>{
      it("Should approve allowance", async () => {
        const { baby, owner, user1 } = await loadFixture(setup);
        
        expect(await baby.allowance(owner.address, user1.address)).to.equal(0);
        
        const allowedAmount = ethers.utils.parseEther("100");
        await baby.connect(owner).approve(user1.address, allowedAmount);

        expect(await baby.allowance(owner.address, user1.address)).to.equal(allowedAmount);
        expect(await baby.allowance(user1.address, owner.address)).to.equal(0);
      });
      it("Should increase allowance",  async () => {
        const { baby, owner, user1 } = await loadFixture(setup);
        expect(await baby.allowance(owner.address, user1.address)).to.equal(0);
        
        const allowedAmount = ethers.utils.parseEther("100");
        
        await baby.connect(owner).increaseAllowance(user1.address, allowedAmount);
        
        expect(await baby.allowance(owner.address, user1.address)).to.equal(allowedAmount);
        expect(await baby.allowance(user1.address, owner.address)).to.equal(0);
      
      });
      it("Should decrease allowance",  async () => {
        const { baby, owner, user1 } = await loadFixture(setup);
        expect(await baby.allowance(owner.address, user1.address)).to.equal(0);
        const allowedAmount = ethers.utils.parseEther("100");
        await baby.connect(owner).increaseAllowance(user1.address, allowedAmount);
        const decreaseAmount = ethers.utils.parseEther("50");

        await baby.connect(owner).decreaseAllowance(user1.address, decreaseAmount);

        expect(await baby.allowance(owner.address, user1.address)).to.equal(allowedAmount.sub(decreaseAmount));
        expect(await baby.allowance(user1.address, owner.address)).to.equal(0);
      
      });
    })

    describe("Burn tests", () => {
      it("Should burn tokens", async() => {
        const {baby, owner} = await loadFixture(setup);

        const burnAmount = ethers.utils.parseEther("100");
        const totalSupply = await baby.totalSupply();

        await baby.connect(owner).burn(burnAmount);

        expect(await baby.totalSupply()).to.equal(totalSupply.sub(burnAmount));
        expect(await baby.balanceOf(owner.address)).to.equal(totalSupply.sub(burnAmount));
        
      });
      it("Should fail if not enough tokens",async ()=> {
        const {baby, owner} = await loadFixture(setup);
  
        const totalSupply = await baby.totalSupply();
        const burnAmount = totalSupply.add(1);
  
        await expect(baby.connect(owner).burn(burnAmount)).to.be.revertedWith("ERC20: burn amount exceeds balance");
      });
      it("Should remove reward if tokens fall under threshold", async () => {
        const {baby, owner, user1} = await loadFixture(setup);
        // send tokens to user1
        const transferAmount = (await baby.totalSupply()).div(10000); // minimum for divideds to be allocated;
        const burnAmount = transferAmount.sub(1);
        await baby.connect(owner).transfer(user1.address, transferAmount);
        // burn user1 tokens
        await baby.connect(user1).burn(burnAmount);

        expect(await baby.balanceOf(user1.address)).to.equal(transferAmount.sub(burnAmount));
        expect(await baby.dividendTokenBalanceOf(user1.address)).to.equal(0);

      });

      
    })

    describe("Transfer Tests", ()=>{
      it("Should allow transfer without any tax", async () =>{
        const { baby, owner, user1, user2 } = await loadFixture(setup);
        const transferAmount = ethers.utils.parseEther("100");
        const transferAmount2 = (await baby.totalSupply()).div(10000); // minimum for divideds to be allocated
        await baby.connect(owner).transfer(user1.address, transferAmount);
        await baby.connect(owner).transfer(user2.address, transferAmount2);
        expect(await baby.balanceOf(user1.address)).to.equal(transferAmount);
        expect(await baby.balanceOf(user2.address)).to.equal(transferAmount2);
        expect(await baby.dividendTokenBalanceOf(user1.address)).to.equal(0);
        expect(await baby.dividendTokenBalanceOf(user2.address)).to.equal(transferAmount2);
      });
      it("Should allow transfer from", async () => {

        const {baby, owner, user1, user2,user3} = await loadFixture(setup);
        const transferAmount = ethers.utils.parseEther("100")
        const transferAmount2 = (await baby.totalSupply()).div(10000); // minimum for divideds to be allocated
        const transferAmount3 = transferAmount2.mul(4); // minimum for divideds to be allocated

        // Approve user1 to spend owner tokens
        await baby.connect(owner).approve(user1.address, transferAmount3);

        // Transfer from user1 to user2
        await baby.connect(user1).transferFrom(owner.address, user2.address, transferAmount3);

        expect(await baby.balanceOf(user1.address)).to.equal(0);
        expect(await baby.balanceOf(user2.address)).to.equal(transferAmount3);
        expect(await baby.dividendTokenBalanceOf(user1.address)).to.equal(0);
        expect(await baby.dividendTokenBalanceOf(user2.address)).to.equal(transferAmount3);

        // Approve user1 to spend transferAmount3 tokens
        await baby.connect(user2).approve(user1.address, transferAmount2);
        await baby.connect(user1).transferFrom(user2.address, user3.address, transferAmount2);
        expect(await baby.balanceOf(user2.address)).to.equal(transferAmount3.sub(transferAmount2));
        expect(await baby.balanceOf(user3.address)).to.equal(transferAmount2);
        expect(await baby.dividendTokenBalanceOf(user2.address)).to.equal(transferAmount3.sub(transferAmount2));
        expect(await baby.dividendTokenBalanceOf(user3.address)).to.equal(transferAmount2);
      });

      it("Should have a cooldown if not whitelisted", async () => {
        const { baby, owner, user1 } = await loadFixture(setup);
        
        const transferAmount = ethers.utils.parseEther("100")
        const transferAmount2 = transferAmount.div(2);
        // Owner is fine since he's whitelisted but user1 is not
        await baby.connect(owner).transfer(user1.address, transferAmount);

        await baby.connect(user1).transfer(owner.address, transferAmount2);
        await expect(baby.connect(user1).transfer(owner.address, transferAmount2)).to.be.revertedWith("Cooldown");
        // advance 3 blocks and try again
        await hre.network.provider.send("hardhat_mine", ["0x3"]);
        await baby.connect(user1).transfer(owner.address, transferAmount2);
        expect(await baby.balanceOf(user1.address)).to.equal(0);
        expect(await baby.balanceOf(owner.address)).to.equal(await baby.totalSupply());
      });
      
    })
  })

  describe("Liquidity add/remove tests", () => {
    it("Should add liquidity", async () => {
      const { baby, owner } = await loadFixture(setup);
      const tokenAmount = (await baby.totalSupply()).mul(83).div(100); //83% of total supply
      const ethAmount = ethers.utils.parseEther("2");

      const router = await ethers.getContractAt("IUniswapV2Router02", UniswapV2Router);
      const pair = await baby.uniswapV2Pair();
      const pairContract = await ethers.getContractAt("IUniswapV2Pair", pair);
      await baby.connect(owner).approve(router.address, tokenAmount);

      await router.connect(owner).addLiquidityETH(baby.address, tokenAmount, tokenAmount, ethAmount, owner.address, await time.latest() + 3600, { value: ethAmount })

      expect(await baby.balanceOf(pair)).to.equal(tokenAmount);
      const token0 = await pairContract.token0();
      const token1 = await pairContract.token1();
      
      const baseToken = await ethers.getContractAt("IERC20", token0 === baby.address ? token1 : token0);
      expect(await baseToken.balanceOf(pair)).to.equal(ethAmount);

      expect(await pairContract.totalSupply()).to.be.gt(ethers.utils.parseEther("1"));
    });
    
    it("Should remove liquidity", async () => {
      const { baby, owner } = await loadFixture(setup);
      const tokenAmount = (await baby.totalSupply()).mul(83).div(100); //83% of total supply
      const ethAmount = ethers.utils.parseEther("2");

      const router = await ethers.getContractAt("IUniswapV2Router02", UniswapV2Router);
      const pair = await baby.uniswapV2Pair();
      const pairContract = await ethers.getContractAt("IUniswapV2Pair", pair);
      await baby.connect(owner).approve(router.address, tokenAmount);

      await router.connect(owner).addLiquidityETH(baby.address, tokenAmount, tokenAmount, ethAmount, owner.address, await time.latest() + 3600, { value: ethAmount })

      const ownerLiquidity = await pairContract.balanceOf(owner.address);
      
      await pairContract.connect(owner).approve(router.address, ownerLiquidity);
      // THIS SHOULD WORK SINCE OWNER IS FEE EXEMPT
      await router.connect(owner).removeLiquidityETH(baby.address, ownerLiquidity, 0, 0, owner.address, await time.latest() + 3600 )
      // await router.connect(owner).removeLiquidityETHSupportingFeeOnTransferTokens(baby.address, ownerLiquidity, 0, 0, owner.address, await time.latest() + 3600 )
      expect(await pairContract.balanceOf(owner.address)).to.equal(0);
      expect(await pairContract.totalSupply()).to.be.lt(ethers.utils.parseEther("1"));
    })

  })

  const liquiditySetup = async () => {
    const [owner, marketingWallet, user1, user2, user3] = await ethers.getSigners();
    const Baby = await ethers.getContractFactory("BabyPepe", owner);
    const baby = await Baby.deploy([UniswapV2Router, marketingWallet.address], 5);
      await baby.deployed();

      const tokenAmount = (await baby.totalSupply()).mul(83).div(100); //83% of total supply
      const ethAmount = ethers.utils.parseEther("2");

      const router = await ethers.getContractAt("IUniswapV2Router02", UniswapV2Router);
      const pair = await baby.uniswapV2Pair();
      const pairContract = await ethers.getContractAt("IUniswapV2Pair", pair);
      const WETH = await router.WETH();
      await baby.connect(owner).approve(router.address, tokenAmount);

      await router.connect(owner).addLiquidityETH(baby.address, tokenAmount, tokenAmount, ethAmount, owner.address, await time.latest() + 3600, { value: ethAmount })
      return { baby, owner, marketingWallet, user1, user2, user3, router, pairContract, WETH };
  }

  describe("Swap tests", () => {

    it("Should allow buy of tokens", async ()=> {

      const { baby, user1, router, WETH } = await loadFixture(liquiditySetup);

      const amountToBUY = ethers.utils.parseEther("1");

      await router.connect(user1).swapExactETHForTokensSupportingFeeOnTransferTokens(0, [ WETH, baby.address], user1.address, await time.latest() + 3600, { value: amountToBUY })

      expect( await baby.balanceOf(user1.address)).to.be.gt(0);
    });
    it("Should take tax on buys", async ()=> {
      const { baby, user1, router, WETH } = await loadFixture(liquiditySetup);

      const amountToBUY = ethers.utils.parseEther("1");

      const amounts = await router.getAmountsOut(amountToBUY, [WETH, baby.address]);

      await router.connect(user1).swapExactETHForTokensSupportingFeeOnTransferTokens(0,[WETH, baby.address], user1.address, await time.latest() + 3600, { value: amountToBUY })
      // Amounts will diverge a bit due to by amount
      const amountToGet = amounts[1].mul(985).div(1000);
      const amountInToken = amounts[1].sub(amountToGet);

      expect((await baby.balanceOf(user1.address)).sub(amountToGet)).to.be.lt(1000);
      expect((await baby.balanceOf(baby.address)).sub(amountInToken)).to.be.lt(1000);

      expect(await baby.AmountLiquidityFee()).to.equal(amountInToken.div(3))
      expect(await baby.AmountMarketingFee()).to.equal(amountInToken.div(3))
      expect(await baby.AmountTokenRewardsFee()).to.equal(amountInToken.div(3))

      expect(await baby.dividendTokenBalanceOf(user1.address)).to.gt(0);
    });
    it("Should allow consecutive buys", async () => {
      const { baby, user1, router, WETH } = await loadFixture(liquiditySetup);

      const amountToBUY = ethers.utils.parseEther("1");

      const amounts = await router.getAmountsOut(amountToBUY, [WETH, baby.address]);
      
      await router.connect(user1).swapExactETHForTokensSupportingFeeOnTransferTokens(0,[WETH, baby.address], user1.address, await time.latest() + 3600, { value: amountToBUY })
      
      const amounts2 = await router.getAmountsOut(amountToBUY, [WETH, baby.address]);
      await router.connect(user1).swapExactETHForTokensSupportingFeeOnTransferTokens(0,[WETH, baby.address], user1.address, await time.latest() + 3600, { value: amountToBUY })

      expect((await baby.balanceOf(user1.address)).sub(amounts[1].add(amounts2[1]).mul(985).div(1000))).to.be.lt(1000);
    });
    it("Should allow sell of tokens and take tax", async () => {
      const { baby, user1, router, WETH } = await loadFixture(liquiditySetup);

      const amountToSell = ethers.utils.parseEther("1");
      await baby.transfer(user1.address, amountToSell);
      await baby.connect(user1).approve(router.address, amountToSell);

      const amounts = await router.getAmountsOut(amountToSell, [ baby.address, WETH]);
      const ethToGet = amounts[1].mul(985).div(1000);
      let user1ETH = await user1.getBalance();
      let tx = await router.connect(user1).swapExactTokensForETHSupportingFeeOnTransferTokens(amountToSell, 0, [ baby.address, WETH], user1.address, await time.latest() + 3600)
      let rc = await tx.wait()
      let gasFee = rc.gasUsed;
      if(tx.gasPrice)
        gasFee = gasFee.mul(tx.gasPrice)
      user1ETH = user1ETH.sub(gasFee)
      console.log("GAS USED", ethers.utils.formatEther(gasFee))
      expect(await baby.balanceOf(user1.address)).to.be.eq(0);
      const user1ETH_s =  await user1.getBalance();

      expect(user1ETH_s).to.be.gt(user1ETH);
      expect(user1ETH_s).to.be.eq(user1ETH.add(ethToGet));
      expect(await baby.balanceOf(baby.address)).to.equal(amountToSell.mul(15).div(1000))
      expect(await baby.AmountLiquidityFee()).to.equal(amountToSell.mul(5).div(1000))
      expect(await baby.AmountMarketingFee()).to.equal(amountToSell.mul(5).div(1000))
      expect(await baby.AmountTokenRewardsFee()).to.equal(amountToSell.mul(5).div(1000))
    });
    ;
    it("Should allow consecutive sells with a cooldown", async () => {
      const { baby, user1, router, WETH } = await loadFixture(liquiditySetup);
      const gasPrice = ethers.utils.parseUnits("80", "gwei")
      const amountToSell = ethers.utils.parseEther("1");
      await baby.transfer(user1.address, amountToSell.mul(2));
      await baby.connect(user1).approve(router.address, amountToSell.mul(2));
      let tx;
      let rc;
      tx = await router.connect(user1).swapExactTokensForETHSupportingFeeOnTransferTokens(amountToSell, 0, [ baby.address, WETH], user1.address, await time.latest() + 3600)
      rc = await tx.wait()
      const gasFee = rc.gasUsed.mul(gasPrice);
      // REVERTED WITH TRANSFER_FROM_FAILED because of Cooldown
      await expect(router.connect(user1).swapExactTokensForETHSupportingFeeOnTransferTokens(amountToSell, 0, [ baby.address, WETH], user1.address, await time.latest() + 3600)).to.be.revertedWith("TransferHelper: TRANSFER_FROM_FAILED")
      await hre.network.provider.send("hardhat_mine", ["0x3"]);
      tx = await router.connect(user1).swapExactTokensForETHSupportingFeeOnTransferTokens(amountToSell, 0, [ baby.address, WETH], user1.address, await time.latest() + 3600)
      rc = await tx.wait()
      const gasFee2 = rc.gasUsed.mul(gasPrice);
      console.log({
        gasFee, gasFee2,
        sell1: ethers.utils.formatEther(gasFee),
        usd: 1945 * parseFloat(ethers.utils.formatEther(gasFee)),
        sell2: ethers.utils.formatEther(gasFee2),
        usd2: 1945 * parseFloat(ethers.utils.formatEther(gasFee2)),
      })
      expect(await baby.balanceOf(user1.address)).to.be.eq(0);
    });
    it("Should allow non exempt users to add liquidity", async () => {
      const { baby, user1, router, owner, WETH, pairContract} = await loadFixture(liquiditySetup);
      const amountToAddBbpp = ethers.utils.parseEther("1000000");
      const reserves = await pairContract.getReserves();
      const ethAmount = await router.quote(amountToAddBbpp, reserves[0], reserves[1]);
      
      await baby.connect(owner).transfer(user1.address, amountToAddBbpp);
      await baby.connect(user1).approve(router.address, ethers.constants.MaxUint256);
      const currentLiquidity = await pairContract.totalSupply()

      await router.connect(user1).addLiquidityETH(baby.address, amountToAddBbpp, 0, 0, user1.address, await time.latest() + 3600, { value: ethAmount });

      expect(await pairContract.totalSupply()).to.be.gt(currentLiquidity)
    });
    it("Should allow users that add liquidity to remove it", async () => {
      const { baby, user1, router, owner, WETH, pairContract} = await loadFixture(liquiditySetup);
      const amountToAddBbpp = ethers.utils.parseEther("1000000");
      const reserves = await pairContract.getReserves();
      const ethAmount = await router.quote(amountToAddBbpp, reserves[0], reserves[1]);
      
      await baby.connect(owner).transfer(user1.address, amountToAddBbpp);
      await baby.connect(user1).approve(router.address, ethers.constants.MaxUint256);
      
      await router.connect(user1).addLiquidityETH(baby.address, amountToAddBbpp, 0, 0, user1.address, await time.latest() + 3600, { value: ethAmount });
      const currentLiquidity = await pairContract.totalSupply()
      const liquidityAdded =( await pairContract.balanceOf(user1.address))
      await pairContract.connect(user1).approve(router.address, liquidityAdded)
      
      await router.connect(user1).removeLiquidityETHSupportingFeeOnTransferTokens(baby.address, liquidityAdded, 0, 0, user1.address, await time.latest() + 3600);
      expect(await pairContract.totalSupply()).to.be.equal(currentLiquidity.sub(liquidityAdded))
      expect(await pairContract.balanceOf(user1.address)).to.be.equal(0)
    });
  });

  describe("Dividend Tests", () => {
    it("Should distribute dividends to all allowed users", async () => {
      const { baby, user1, user2, router, marketingWallet, WETH, pairContract} = await loadFixture(liquiditySetup);

      // need two 1ETH buys from user1 and user2
      const amountToBUY = ethers.utils.parseEther("1");
      await router.connect(user1).swapExactETHForTokensSupportingFeeOnTransferTokens(0,[WETH, baby.address], user1.address, await time.latest() + 3600, { value: amountToBUY })
      await router.connect(user2).swapExactETHForTokensSupportingFeeOnTransferTokens(0,[WETH, baby.address], user2.address, await time.latest() + 3600, { value: amountToBUY })

      // All fees should be equal
      expect(await baby.AmountLiquidityFee()).to.equal(await baby.AmountMarketingFee())
      // automatic trigger on sell
      const amountToSell = ethers.utils.parseEther("1000");
      const initLiquidity = await pairContract.totalSupply();
      const initMarketingFunds = await marketingWallet.getBalance();
      const pepe = await ethers.getContractAt("IERC20", await baby.rewardToken())
      const distributor = await baby.dividendTracker()
      await baby.connect(user1).approve(router.address, amountToSell);
      const tx = await router.connect(user1).swapExactTokensForETHSupportingFeeOnTransferTokens(amountToSell, 0, [ baby.address, WETH], user1.address, await time.latest() + 3600)
      const rc = await tx.wait()
      
      // Check that liquidity was added
      expect(await pairContract.totalSupply()).to.be.gt(initLiquidity)
      expect(await pairContract.balanceOf(deadWallet)).to.be.gt(0)
      // Check that marketing wallet got funds
      expect(await marketingWallet.getBalance()).to.be.gt(initMarketingFunds)
      // Check that token rewards were sent to distributor
      expect(await pepe.balanceOf(distributor)).to.be.gt(0)

      expect(await baby.AmountLiquidityFee()).to.equal(amountToSell.mul(5).div(1000))
      expect(await baby.AmountMarketingFee()).to.equal(amountToSell.mul(5).div(1000))
      expect(await baby.AmountTokenRewardsFee()).to.equal(amountToSell.mul(5).div(1000))
      console.log({
        gasForSaleAndDistribute: rc.gasUsed,
        pepeU1: await pepe.balanceOf(user1.address),
        pepeU2: await pepe.balanceOf(user2.address),
        pepeDiv: await pepe.balanceOf(distributor)
      })
      // Since it's only a few users, the distribution happened automagically
    });
  });
});