// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import "./Oracle.sol";
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

    IERC20Extended public paymentToken;

    // data structures
    struct OracleInfo {
        address provider;
        uint64 createdAt;
        bool isActive;
    }

    struct FactoryConfig {
        uint128 oracleDeployPrice; // in wei
        uint8 oracleFactoryShare; // percentage
        address paymentTokenAddress;
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

    constructor(address _owner, address _paymentTokenAddress) Ownable(_owner) {
        config = FactoryConfig({
            oracleFactoryShare: 20, // percentage
            oracleDeployPrice: 5 * 10 ** 6, // 5 USDC
            paymentTokenAddress: _paymentTokenAddress
        });
        paymentToken = IERC20Extended(_paymentTokenAddress);
    }

    modifier oracleExists(address oracleAddress) {
        if (oracles[oracleAddress].provider == address(0)) {
            revert OracleErrors.OracleDoesNotExist(oracleAddress);
        }
        _;
    }

    function updateConfig(
        uint128 _oracleDeployPrice,
        uint8 _oracleFactoryShare,
        address _paymentTokenAddress
    ) external onlyOwner {
        config.oracleDeployPrice = _oracleDeployPrice;
        config.oracleFactoryShare = _oracleFactoryShare;
        config.paymentTokenAddress = _paymentTokenAddress;
        paymentToken = IERC20Extended(_paymentTokenAddress);
    }

    function deployOracle(
        uint256 _recommendedUpdateDuration,
        uint256 _dataUpdatePrice,
        bytes calldata _initialData,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        address provider = msg.sender;

        uint256 balance = paymentToken.balanceOf(provider);

        if (balance < config.oracleDeployPrice) {
            revert OracleErrors.InsufficientPayment(config.oracleDeployPrice, balance);
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
            config.oracleDeployPrice,
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
        address oracleAddress,
        bytes calldata _data,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external onlyOwner nonReentrant oracleExists(oracleAddress) {
        Oracle oracle = Oracle(oracleAddress);

        address provider = oracle.provider();
        uint256 dataUpdatePrice = oracle.dataUpdatePrice();
        uint256 factoryAmount = (dataUpdatePrice * config.oracleFactoryShare) / 100;
        uint256 providerAmount = dataUpdatePrice - factoryAmount;

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
