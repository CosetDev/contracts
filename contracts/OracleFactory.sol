// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import "./Oracle.sol";
import "hardhat/console.sol";
import "./OracleErrors.sol";
import "./IERC20Extended.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Coset Oracle Factory
/// @author Halil Beycan
/// @notice Official oracle factory implementation by Halil Beycan for Coset
contract OracleFactory is Ownable, ReentrancyGuard {
    // variables
    FactoryConfig public config;

    address[] public oracleList;

    uint256 public activeOracleCount;

    mapping(address => OracleInfo) public oracles;

    mapping(address => address[]) public providerOracles;

    Oracle public cstPriceOracle; // 1 USDC = X CST

    // data structures
    struct OracleInfo {
        address provider;
        uint64 createdAt;
        bool isActive;
    }

    struct FactoryConfig {
        uint128 oracleDeployPrice; // in wei
        uint8 oracleFactoryShare; // percentage
        address usdcTokenAddress;
        address cstTokenAddress;
    }

    // events
    event OracleDeployed(
        address indexed oracleAddress,
        address indexed provider,
        uint256 timestamp
    );

    event OracleStatusChanged(
        address indexed oracleAddress,
        address indexed provider,
        bool newOracleStatus,
        uint256 timestamp
    );

    constructor(
        address _owner,
        address _usdcTokenAddress,
        address _cstTokenAddress
    ) Ownable(_owner) {
        config = FactoryConfig({
            oracleFactoryShare: 20, // percentage
            oracleDeployPrice: 5 * 10 ** 6, // 5 USDC
            cstTokenAddress: _cstTokenAddress,
            usdcTokenAddress: _usdcTokenAddress
        });
    }

    modifier oracleExists(address oracleAddress) {
        if (oracles[oracleAddress].provider == address(0)) {
            revert OracleErrors.OracleDoesNotExist(oracleAddress);
        }
        _;
    }

    modifier validPaymentToken(address paymentTokenAddress) {
        if (
            paymentTokenAddress != config.usdcTokenAddress &&
            paymentTokenAddress != config.cstTokenAddress
        ) {
            revert OracleErrors.InvalidPaymentToken();
        }
        if (
            paymentTokenAddress == config.cstTokenAddress && address(cstPriceOracle) == address(0)
        ) {
            revert OracleErrors.CSTPriceOracleNotSet();
        }
        _;
    }

    function updateConfig(
        uint128 _oracleDeployPrice,
        uint8 _oracleFactoryShare,
        address _usdcTokenAddress,
        address _cstTokenAddress
    ) external onlyOwner {
        config.oracleDeployPrice = _oracleDeployPrice;
        config.oracleFactoryShare = _oracleFactoryShare;
        config.usdcTokenAddress = _usdcTokenAddress;
        config.cstTokenAddress = _cstTokenAddress;
    }

    function updateCstPriceOracle(address _cstPriceOracle) external onlyOwner {
        cstPriceOracle = Oracle(_cstPriceOracle);
    }

    function _bytesToUint(bytes memory b) internal pure returns (uint256 result) {
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);

            // '0' = 48, '9' = 57
            require(c >= 48 && c <= 57, "Invalid digit");

            result = result * 10 + (c - 48);
        }
    }

    function _convertAmountIfNeeded(
        address paymentTokenAddress,
        uint256 amount
    ) internal view returns (uint256) {
        if (paymentTokenAddress == config.cstTokenAddress) {
            bytes memory priceData = cstPriceOracle.getDataWithoutCheck();
            uint256 oneUsdcInCst = _bytesToUint(priceData);
            return (amount * oneUsdcInCst) / 1e6;
        } else {
            return amount;
        }
    }

    function deployOracle(
        address paymentTokenAddress,
        uint256 _recommendedUpdateDuration,
        uint256 _dataUpdatePrice,
        bytes calldata _initialData,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant validPaymentToken(paymentTokenAddress) {
        address provider = msg.sender;

        IERC20Extended paymentToken = IERC20Extended(paymentTokenAddress);
        uint256 balance = paymentToken.balanceOf(provider);

        uint256 requiredAmount = _convertAmountIfNeeded(
            paymentTokenAddress,
            config.oracleDeployPrice
        );

        if (balance < requiredAmount) {
            revert OracleErrors.InsufficientPayment(requiredAmount, balance);
        }

        address oracleAddress = address(
            new Oracle(
                _recommendedUpdateDuration,
                _dataUpdatePrice,
                _initialData,
                provider,
                address(this)
            )
        );

        oracles[oracleAddress] = OracleInfo({
            provider: provider,
            createdAt: uint64(block.timestamp),
            isActive: true
        });

        activeOracleCount++;
        oracleList.push(oracleAddress);
        providerOracles[provider].push(oracleAddress);

        paymentToken.transferWithAuthorization(
            provider,
            owner(),
            requiredAmount,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );

        emit OracleDeployed(oracleAddress, provider, block.timestamp);
    }

    function setOracleStatus(
        address oracleAddress,
        bool _isActive
    ) external onlyOwner oracleExists(oracleAddress) {
        bool old = oracles[oracleAddress].isActive;

        if (old != _isActive) {
            oracles[oracleAddress].isActive = _isActive;
            _isActive ? activeOracleCount++ : activeOracleCount--;

            Oracle(oracleAddress).setOracleStatus(_isActive);

            emit OracleStatusChanged(
                oracleAddress,
                oracles[oracleAddress].provider,
                _isActive,
                block.timestamp
            );
        } else {
            revert OracleErrors.NoStatusChange();
        }
    }

    function setOracleDataUpdatePrice(
        address oracleAddress,
        uint256 _dataUpdatePrice
    ) external onlyOwner oracleExists(oracleAddress) {
        Oracle(oracleAddress).setDataUpdatePrice(_dataUpdatePrice);
    }

    function updateOracleData(
        address paymentTokenAddress,
        address oracleAddress,
        bytes calldata _data,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        external
        onlyOwner
        nonReentrant
        oracleExists(oracleAddress)
        validPaymentToken(paymentTokenAddress)
    {
        Oracle oracle = Oracle(oracleAddress);

        address provider = oracle.provider();
        uint256 dataUpdatePrice = oracle.dataUpdatePrice();
        uint256 factoryAmount = (dataUpdatePrice * config.oracleFactoryShare) / 100;
        uint256 providerAmount = _convertAmountIfNeeded(
            paymentTokenAddress,
            dataUpdatePrice - factoryAmount
        );

        IERC20Extended paymentToken = IERC20Extended(paymentTokenAddress);
        uint256 balance = paymentToken.balanceOf(owner());

        if (balance < providerAmount) {
            revert OracleErrors.InsufficientPayment(providerAmount, balance);
        }

        Oracle(oracleAddress).updateData(_data);

        paymentToken.transferWithAuthorization(
            owner(),
            provider,
            providerAmount,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );
    }

    function getAllOracles(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory, uint256 total) {
        total = oracleList.length;

        if (offset >= total) {
            return (new address[](0), total);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        uint256 size = end - offset;
        address[] memory result = new address[](size);

        for (uint256 i = 0; i < size; i++) {
            result[i] = oracleList[offset + i];
        }

        return (result, total);
    }

    function getProviderOracles(
        address provider,
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory, uint256 total) {
        address[] storage userOracles = providerOracles[provider];
        total = userOracles.length;

        if (offset >= total) {
            return (new address[](0), total);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        uint256 size = end - offset;
        address[] memory result = new address[](size);

        for (uint256 i = 0; i < size; i++) {
            result[i] = userOracles[offset + i];
        }

        return (result, total);
    }

    function getOracleInfo(
        address oracleAddress
    )
        external
        view
        oracleExists(oracleAddress)
        returns (address provider, uint64 createdAt, bool isActive)
    {
        OracleInfo memory info = oracles[oracleAddress];
        return (info.provider, info.createdAt, info.isActive);
    }
}
