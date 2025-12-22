// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import "./Oracle.sol";
import "./OracleUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract OracleFactory is Ownable {
    using OracleUtils for address;

    // developer addresses
    address payable private constant DEVELOPER_1 =
        payable(0x3F2e72283f1E29b7cb4402511C41b60FB4900B57);
    address payable private constant DEVELOPER_2 =
        payable(0xf0b5563971c60D2dc4407D1d85C9c3D2Fc06726e);

    // variables
    FactoryConfig public config;

    address[] public oracleList;

    mapping(address => OracleInfo) public oracles;

    mapping(address => address[]) public providerOracles;

    // data structures
    struct OracleInfo {
        address oracleAddress;
        address provider;
        uint256 createdAt;
        bool isActive;
    }

    struct FactoryConfig {
        uint256 dataUpdatePrice; // in wei
        uint256 oracleDeployPrice; // in wei
        uint256 oracleProviderShare; // percentage
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
            dataUpdatePrice: 0.01 ether,
            oracleDeployPrice: 0.05 ether,
            oracleProviderShare: 80 // percentage
        });
    }

    function updateConfig(FactoryConfig memory _config) external onlyOwner {
        config = FactoryConfig({
            dataUpdatePrice: _config.dataUpdatePrice,
            oracleDeployPrice: _config.oracleDeployPrice,
            oracleProviderShare: _config.oracleProviderShare
        });
    }

    function getConfig() external view returns (FactoryConfig memory) {
        return config;
    }

    function shareFundBetweenDevelopers(uint256 amount) private {
        owner().transferAmount(amount);
        // TODO: add transfer to multiple developers
    }

    function deployOracle(
        uint256 _recommendedUpdateDuration,
        string calldata _initialDataHash
    ) external payable {
        if (msg.value < config.oracleDeployPrice) {
            revert OracleUtils.InsufficientPayment(config.oracleDeployPrice, msg.value);
        }

        address provider = msg.sender;

        address oracleAddress = address(new Oracle(_recommendedUpdateDuration, _initialDataHash));

        oracles[oracleAddress] = OracleInfo({
            oracleAddress: oracleAddress,
            provider: provider,
            createdAt: block.timestamp,
            isActive: true
        });

        oracleList.push(oracleAddress);
        providerOracles[provider].push(oracleAddress);

        emit OracleDeployed(oracleAddress, provider, block.timestamp);
    }

    function setOracleStatus(address oracleAddress, bool _isActive) external onlyOwner {
        if (!oracles[oracleAddress].isActive) {
            revert OracleUtils.OracleIsNotActive();
        }

        oracles[oracleAddress].isActive = _isActive;

        Oracle(oracleAddress).setOracleStatus(_isActive);

        emit OracleStatusChanged(
            oracleAddress,
            oracles[oracleAddress].provider,
            _isActive,
            block.timestamp
        );
    }

    function getAllOracles() external view returns (address[] memory) {
        return oracleList;
    }

    function getProviderOracles(address provider) external view returns (address[] memory) {
        return providerOracles[provider];
    }

    function getActiveOracleCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < oracleList.length; i++) {
            if (oracles[oracleList[i]].isActive) {
                count++;
            }
        }
        return count;
    }

    function getTotalOracleCount() external view returns (uint256) {
        return oracleList.length;
    }

    function getOracleInfo(
        address oracleAddress
    ) external view returns (address provider, uint256 createdAt, bool isActive) {
        OracleInfo memory info = oracles[oracleAddress];
        return (info.provider, info.createdAt, info.isActive);
    }

    receive() external payable {
        shareFundBetweenDevelopers(msg.value);
    }
}
