// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import "./Oracle.sol";
import "./OracleUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Coset Oracle Factory
/// @author Halil Beycan
/// @notice Official oracle factory implementation by Halil Beycan for Coset
contract OracleFactory is Ownable, ReentrancyGuard {
    using OracleUtils for address;

    // developer addresses
    address private constant DEVELOPER_1 = 0x3F2e72283f1E29b7cb4402511C41b60FB4900B57;
    address private constant DEVELOPER_2 = 0xf0b5563971c60D2dc4407D1d85C9c3D2Fc06726e;

    // variables
    FactoryConfig public config;

    address[] public oracleList;

    uint256 public activeOracleCount;

    mapping(address => OracleInfo) public oracles;

    mapping(address => address[]) public providerOracles;

    // data structures
    struct OracleInfo {
        address oracleAddress;
        address provider;
        uint64 createdAt;
        bool isActive;
    }

    struct FactoryConfig {
        uint128 oracleDeployPrice; // in wei
        uint8 oracleFactoryShare; // percentage
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

    constructor(address payable _owner) Ownable(_owner) {
        config = FactoryConfig({
            oracleDeployPrice: 0.05 ether,
            oracleFactoryShare: 20 // percentage
        });
    }

    modifier isOracleExists(address oracleAddress) {
        if (oracles[oracleAddress].oracleAddress == address(0)) {
            revert OracleUtils.OracleIsNotExist();
        }
        _;
    }

    function updateConfig(
        uint128 _oracleDeployPrice,
        uint8 _oracleFactoryShare
    ) external onlyOwner {
        config.oracleDeployPrice = _oracleDeployPrice;
        config.oracleFactoryShare = _oracleFactoryShare;
    }

    function shareFundBetweenDevelopers(uint256 amount) private {
        uint256 share = amount / 2;
        DEVELOPER_1.transferAmount(share);
        DEVELOPER_2.transferAmount(share);
    }

    function deployOracle(
        uint256 _recommendedUpdateDuration,
        uint256 _dataUpdatePrice,
        bytes calldata _initialData
    ) external payable nonReentrant {
        if (msg.value < config.oracleDeployPrice) {
            revert OracleUtils.InsufficientPayment(config.oracleDeployPrice, msg.value);
        }

        if (msg.value > config.oracleDeployPrice) {
            revert OracleUtils.ExcessivePayment(config.oracleDeployPrice, msg.value);
        }

        address provider = msg.sender;

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
            oracleAddress: oracleAddress,
            provider: provider,
            createdAt: uint64(block.timestamp),
            isActive: true
        });

        activeOracleCount++;
        oracleList.push(oracleAddress);
        providerOracles[provider].push(oracleAddress);

        shareFundBetweenDevelopers(msg.value);

        emit OracleDeployed(oracleAddress, provider, block.timestamp);
    }

    function setOracleStatus(
        address oracleAddress,
        bool _isActive
    ) external onlyOwner isOracleExists(oracleAddress) {
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
            revert OracleUtils.NoStatusChange();
        }
    }

    function setOracleDataUpdatePrice(
        address oracleAddress,
        uint256 _dataUpdatePrice
    ) external onlyOwner isOracleExists(oracleAddress) {
        Oracle(oracleAddress).setDataUpdatePrice(_dataUpdatePrice);
    }

    function getAllOracles() external view returns (address[] memory) {
        return oracleList;
    }

    function getProviderOracles(address provider) external view returns (address[] memory) {
        return providerOracles[provider];
    }

    function getActiveOracleCount() external view returns (uint256) {
        return activeOracleCount;
    }

    function getTotalOracleCount() external view returns (uint256) {
        return oracleList.length;
    }

    function getOracleInfo(
        address oracleAddress
    )
        external
        view
        isOracleExists(oracleAddress)
        returns (address provider, uint64 createdAt, bool isActive)
    {
        OracleInfo memory info = oracles[oracleAddress];
        return (info.provider, info.createdAt, info.isActive);
    }

    receive() external payable {
        if (msg.value > 0) {
            shareFundBetweenDevelopers(msg.value);
        }
    }
}
