// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import "./Oracle.sol";
import "./OracleUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract OracleFactory is Ownable {
    using OracleUtils for address;

    uint256 public constant VERSION = 1;

    uint256 public dataUpdatePrice = 0.01 ether;

    uint256 public oracleCreationPrice = 0.05 ether;

    uint256 public oracleProviderShare = 80; // percentage

    struct OracleInfo {
        address oracleAddress;
        address provider;
        uint256 createdAt;
        bool isActive;
    }

    address[] public oracleList;
    mapping(address => OracleInfo) public oracles;
    mapping(address => address[]) public providerOracles;

    // events
    event OracleDeployed(
        address indexed oracleAddress,
        address indexed provider,
        uint256 timestamp
    );

    event OracleDeactivated(
        address indexed oracleAddress,
        address indexed provider,
        uint256 timestamp
    );

    constructor(address payable _owner) Ownable(_owner) {}

    function shareFundBetweenOwners(uint256 amount) internal {
        owner().transferAmount(amount);
    }

    function deployOracle(
        uint256 _recommendedUpdateDuration,
        string calldata _initialDataHash
    ) external payable {
        if (msg.value < oracleCreationPrice) {
            revert OracleUtils.InsufficientPayment(oracleCreationPrice, msg.value);
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

    function deactivateOracle(address oracleAddress) external onlyOwner {
        if (!oracles[oracleAddress].isActive) {
            revert OracleUtils.OracleIsNotActive();
        }

        oracles[oracleAddress].isActive = false;

        Oracle(oracleAddress).setOracleStatus(false);

        emit OracleDeactivated(oracleAddress, oracles[oracleAddress].provider, block.timestamp);
    }

    function getAllOracles() external view returns (address[] memory) {
        return oracleList;
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
        shareFundBetweenOwners(msg.value);
    }
}
