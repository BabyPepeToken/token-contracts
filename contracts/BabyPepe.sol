// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./PepeDividendTracker.sol";

contract BabyPepe is ERC20, Ownable {
    IUniswapV2Router02 public uniswapV2Router;
    address public uniswapV2Pair;

    bool private swapping;

    TokenDividendTracker public dividendTracker;

    address public rewardToken;

    uint256 public swapTokensAtAmount;

    uint public marketingFee;
    uint public liquidityFee;
    uint public pepeFee;
    uint256 public AmountLiquidityFee;
    uint256 public AmountTokenRewardsFee;
    uint256 public AmountMarketingFee;

    address public _marketingWalletAddress;
    address private liquidityHolder;

    address public deadWallet = 0x000000000000000000000000000000000000dEaD;
    mapping(address => bool) public _isEnemy;

    uint256 public gasForProcessing;

    // exlcude from fees and max transaction amount
    mapping(address => bool) private _isExcludedFromFees;

    // store addresses that a automatic market maker pairs. Any transfer *to* these addresses
    // could be subject to a maximum transfer amount
    mapping(address => bool) public automatedMarketMakerPairs;
    // Only PAIR and owner are whitelisted from cooldown. If there are any more wallets, we definitely need to add them before hand. e.g PINKSALE
    mapping(address => bool) public cooldownWhitelist;

    event UpdateDividendTracker(
        address indexed newAddress,
        address indexed oldAddress
    );

    event UpdateUniswapV2Router(
        address indexed newAddress,
        address indexed oldAddress
    );

    event ExcludeFromFees(address indexed account, bool isExcluded);
    event ExcludeMultipleAccountsFromFees(address[] accounts, bool isExcluded);

    event SetAutomatedMarketMakerPair(address indexed pair, bool indexed value);

    event LiquidityWalletUpdated(
        address indexed newLiquidityWallet,
        address indexed oldLiquidityWallet
    );

    event GasForProcessingUpdated(
        uint256 indexed newValue,
        uint256 indexed oldValue
    );

    event SwapAndLiquify(
        uint256 tokensSwapped,
        uint256 ethReceived,
        uint256 tokensIntoLiqudity
    );

    event SendDividends(uint256 tokensSwapped, uint256 amount);

    event ProcessedDividendTracker(
        uint256 iterations,
        uint256 claims,
        uint256 lastProcessedIndex,
        bool indexed automatic,
        uint256 gas,
        address indexed processor
    );

    ///@notice CONSTRUCTOR
    ///@param addrs Addresses Array
    ///@param fee_ Single fee for all
    /// addrs[0] - rewardToken
    /// addrs[1] - router
    /// addrs[2] - marketing wallet
    constructor(
        address[4] memory addrs,
        uint256 fee_
    ) ERC20("Baby Pepe", "BPEPE") {
        rewardToken = addrs[0];
        _marketingWalletAddress = addrs[2];

        pepeFee = fee_;
        marketingFee = fee_;
        liquidityFee = fee_;

        uint256 totalSupply_ = 210_000_000_000_000 ether;
        swapTokensAtAmount = (totalSupply_ * 2) / 10 ** 6; // 0.0002%
        uint tokenBalanceForReward_ = totalSupply / 10 ** 4; // 0.01%

        // use by default 300,000 gas to process auto-claiming dividends
        gasForProcessing = 300000;

        liquidityHolder = addrs[3];
        dividendTracker = new TokenDividendTracker(
            rewardToken,
            tokenBalanceForReward_
        );

        IUniswapV2Router02 _uniswapV2Router = IUniswapV2Router02(addrs[1]);
        address _uniswapV2Pair = IUniswapV2Factory(_uniswapV2Router.factory())
            .createPair(address(this), _uniswapV2Router.WETH());

        uniswapV2Router = _uniswapV2Router;
        uniswapV2Pair = _uniswapV2Pair;

        _setAutomatedMarketMakerPair(_uniswapV2Pair, true);

        // exclude from receiving dividends
        dividendTracker.excludeFromDividends(address(dividendTracker));
        dividendTracker.excludeFromDividends(address(this));
        dividendTracker.excludeFromDividends(owner());
        dividendTracker.excludeFromDividends(deadWallet);
        dividendTracker.excludeFromDividends(address(_uniswapV2Router));

        // exclude from paying fees or having max transaction amount
        excludeFromFees(owner(), true);
        excludeFromFees(_marketingWalletAddress, true);
        excludeFromFees(address(this), true);
        excludeFromFees(liquidityHolder, true);

        _cast(owner(), totalSupply);
    }

    receive() external payable {}

    function updateMinimumTokenBalanceForDividends(
        uint256 val
    ) public onlyOwner {
        dividendTracker.setMinimumTokenBalanceForDividends(val);
    }

    function updateUniswapV2Router(address newAddress) public onlyOwner {
        require(newAddress != address(uniswapV2Router), "duplicate router");
        emit UpdateUniswapV2Router(newAddress, address(uniswapV2Router));
        uniswapV2Router = IUniswapV2Router02(newAddress);
        address _uniswapV2Pair = IUniswapV2Factory(uniswapV2Router.factory())
            .createPair(address(this), uniswapV2Router.WETH());
        uniswapV2Pair = _uniswapV2Pair;
    }

    function excludeFromFees(address account, bool excluded) public onlyOwner {
        if (_isExcludedFromFees[account] != excluded) {
            _isExcludedFromFees[account] = excluded;
            emit ExcludeFromFees(account, excluded);
        }
    }

    function excludeMultipleAccountsFromFees(
        address[] calldata accounts,
        bool excluded
    ) public onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            _isExcludedFromFees[accounts[i]] = excluded;
        }

        emit ExcludeMultipleAccountsFromFees(accounts, excluded);
    }

    function setMarketingWallet(address payable wallet) external onlyOwner {
        _marketingWalletAddress = wallet;
    }

    function setAutomatedMarketMakerPair(
        address pair,
        bool value
    ) public onlyOwner {
        require(pair != uniswapV2Pair, "main pair");
        _setAutomatedMarketMakerPair(pair, value);
    }

    function EnemyAddress(address account, bool value) external onlyOwner {
        _isEnemy[account] = value;
    }

    function _setAutomatedMarketMakerPair(address pair, bool value) private {
        require(automatedMarketMakerPairs[pair] != value, "same value");
        automatedMarketMakerPairs[pair] = value;

        if (value) {
            dividendTracker.excludeFromDividends(pair);
        }
        emit SetAutomatedMarketMakerPair(pair, value);
    }

    function updateGasForProcessing(uint256 newValue) public onlyOwner {
        require(
            newValue >= 200000 && newValue <= 500000,
            "gas => 200,000 >= or <= 500,000"
        );
        require(newValue != gasForProcessing, "same value");
        emit GasForProcessingUpdated(newValue, gasForProcessing);
        gasForProcessing = newValue;
    }

    function updateClaimWait(uint256 claimWait) external onlyOwner {
        dividendTracker.updateClaimWait(claimWait);
    }

    function getClaimWait() external view returns (uint256) {
        return dividendTracker.claimWait();
    }

    function getTotalDividendsDistributed() external view returns (uint256) {
        return dividendTracker.totalDividendsDistributed();
    }

    function isExcludedFromFees(address account) public view returns (bool) {
        return _isExcludedFromFees[account];
    }

    function withdrawableDividendOf(
        address account
    ) public view returns (uint256) {
        return dividendTracker.withdrawableDividendOf(account);
    }

    function dividendTokenBalanceOf(
        address account
    ) public view returns (uint256) {
        return dividendTracker.balanceOf(account);
    }

    function excludeFromDividends(address account) external onlyOwner {
        dividendTracker.excludeFromDividends(account);
    }

    function isExcludedFromDividends(
        address account
    ) public view returns (bool) {
        return dividendTracker.isExcludedFromDividends(account);
    }

    function getAccountDividendsInfo(
        address account
    )
        external
        view
        returns (
            address,
            int256,
            int256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return dividendTracker.getAccount(account);
    }

    function getAccountDividendsInfoAtIndex(
        uint256 index
    )
        external
        view
        returns (
            address,
            int256,
            int256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return dividendTracker.getAccountAtIndex(index);
    }

    function processDividendTracker(uint256 gas) external {
        (
            uint256 iterations,
            uint256 claims,
            uint256 lastProcessedIndex
        ) = dividendTracker.process(gas);
        emit ProcessedDividendTracker(
            iterations,
            claims,
            lastProcessedIndex,
            false,
            gas,
            tx.origin
        );
    }

    function claim() external {
        dividendTracker.processAccount(payable(msg.sender), false);
    }

    function getLastProcessedIndex() external view returns (uint256) {
        return dividendTracker.getLastProcessedIndex();
    }

    function getNumberOfDividendTokenHolders() external view returns (uint256) {
        return dividendTracker.getNumberOfTokenHolders();
    }

    function swapManual() public onlyOwner {
        uint256 contractTokenBalance = balanceOf(address(this));
        require(contractTokenBalance > 0, "balance zero");
        swapping = true;
        if (AmountLiquidityFee > 0) swapAndLiquify(AmountLiquidityFee);
        if (AmountTokenRewardsFee > 0)
            swapAndSendDividends(AmountTokenRewardsFee);
        if (AmountMarketingFee > 0) swapAndSendToFee(AmountMarketingFee);
        swapping = false;
    }

    function setSwapTokensAtAmount(uint256 amount) public onlyOwner {
        swapTokensAtAmount = amount;
    }

    function setDeadWallet(address addr) public onlyOwner {
        deadWallet = addr;
    }

    function setTaxes(
        uint256 _liquidity,
        uint256 _reward,
        uint256 _marketing
    ) external onlyOwner {
        require(_liquidity + _reward + _marketing <= 25, "buy fee > 25%");
        pepeFee = _reward;
        liquidityFee = _liquidity;
        marketingFee = _marketing;
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        require(from != address(0) || to != address(0), "ERC20: 0 address");
        require(!_isEnemy[from] && !_isEnemy[to], "Enemy address");

        if (amount == 0) {
            super._transfer(from, to, 0);
            return;
        }

        uint256 contractTokenBalance = balanceOf(address(this));

        bool canSwap = contractTokenBalance >= swapTokensAtAmount;

        if (
            canSwap &&
            !swapping &&
            !automatedMarketMakerPairs[from] &&
            from != owner() &&
            to != owner()
        ) {
            swapping = true;
            if (AmountMarketingFee > 0) swapAndSendToFee(AmountMarketingFee);
            if (AmountLiquidityFee > 0) swapAndLiquify(AmountLiquidityFee);
            if (AmountTokenRewardsFee > 0)
                swapAndSendDividends(AmountTokenRewardsFee);
            swapping = false;
        }

        bool takeFee = !swapping;

        // if any account belongs to _isExcludedFromFee account then remove the fee
        if (_isExcludedFromFees[from] || _isExcludedFromFees[to]) {
            takeFee = false;
        }

        if (takeFee) {
            uint256 fees;
            uint256 LFee;
            uint256 RFee;
            uint256 MFee;
            if (
                automatedMarketMakerPairs[from] || automatedMarketMakerPairs[to]
            ) {
                LFee = (amount * liquidityFee) / 100;
                AmountLiquidityFee += LFee;
                RFee = (amount * pepeFee) / 100;
                AmountTokenRewardsFee += RFee;
                MFee = (amount * marketingFee) / 100;
                AmountMarketingFee += MFee;
                fees = LFee + RFee + MFee;
            }
            amount -= fees;
            super._transfer(from, address(this), fees - DFee);
        }

        super._transfer(from, to, amount);

        try dividendTracker.setBalance(from, balanceOf(from)) {} catch {}
        try dividendTracker.setBalance(to, balanceOf(to)) {} catch {}

        if (!swapping) {
            uint256 gas = gasForProcessing;

            try dividendTracker.process(gas) returns (
                uint256 iterations,
                uint256 claims,
                uint256 lastProcessedIndex
            ) {
                emit ProcessedDividendTracker(
                    iterations,
                    claims,
                    lastProcessedIndex,
                    true,
                    gas,
                    tx.origin
                );
            } catch {}
        }
    }

    function swapAndSendToFee(uint256 tokens) private {
        uint256 initialCAKEBalance = address(this).balance;
        swapTokensForEth(tokens);
        uint256 newBalance = (address(this).balance) - initialCAKEBalance;
        (bool succ, ) = payable(_marketingWalletAddress).call{
            value: newBalance
        }("");
        require(succ);
        AmountMarketingFee = AmountMarketingFee - tokens;
    }

    function swapAndLiquify(uint256 tokens) private {
        // split the contract balance into halves
        uint256 half = tokens / 2;
        uint256 otherHalf = tokens - half;

        uint256 initialBalance = address(this).balance;

        // swap tokens for ETH
        swapTokensForEth(half); // <- this breaks the ETH -> HATE swap when swap+liquify is triggered

        // how much ETH did we just swap into?
        uint256 newBalance = address(this).balance - initialBalance;

        // add liquidity to uniswap
        addLiquidity(otherHalf, newBalance);
        AmountLiquidityFee = AmountLiquidityFee - tokens;
        emit SwapAndLiquify(half, newBalance, otherHalf);
    }

    function swapTokensForEth(uint256 tokenAmount) private {
        // generate the uniswap pair path of token -> weth
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = uniswapV2Router.WETH();

        _approve(address(this), address(uniswapV2Router), tokenAmount);

        // make the swap
        uniswapV2Router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount,
            0, // accept any amount of ETH
            path,
            address(this),
            block.timestamp
        );
    }

    function addLiquidity(uint256 tokenAmount, uint256 ethAmount) private {
        // approve token transfer to cover all possible scenarios
        _approve(address(this), address(uniswapV2Router), tokenAmount);
        // add the liquidity
        uniswapV2Router.addLiquidityETH{value: ethAmount}(
            address(this),
            tokenAmount,
            0, // slippage is unavoidable
            0, // slippage is unavoidable
            liquidityHolder,
            block.timestamp
        );
    }

    //@audit-issue THIS FUCKING THINGS NEEDS TO SWAP ETH FOR PEPE
    function swapAndSendDividends(uint256 tokens) private {
        swapTokensForEth(tokens);
        AmountTokenRewardsFee = AmountTokenRewardsFee - tokens;
        uint256 dividends = address(this).balance;
        (bool success, ) = payable(address(dividendTracker)).call{
            value: dividends
        }("");
        if (success) {
            dividendTracker.distributePepeDividends(dividends);
            emit SendDividends(tokens, dividends);
        }
    }

    function setLiquidityHolder(address _liquidityHolder) external onlyOwner {
        liquidityHolder = _liquidityHolder;
    }
}
