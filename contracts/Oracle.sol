// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import "./OracleUtils.sol";
import "./OracleFactory.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Oracle is ReentrancyGuard {
    using OracleUtils for address;

    bool public isActive = true;

    string private dataHash;

    address public immutable provider;

    OracleFactory public immutable factory;

    uint256 public lastUpdateTimestamp;

    uint256 public recommendedUpdateDuration;

    event Updated(string data, uint256 timestamp);

    error NoDataAvailable();

    error DataNotUpdatedRecently(uint256 lastUpdateTimestamp, uint256 recommendedUpdateDuration);

    constructor(uint256 _recommendedUpdateDuration, string memory _initialDataHash) {
        provider = tx.origin;
        dataHash = _initialDataHash;
        lastUpdateTimestamp = block.timestamp;
        factory = OracleFactory(payable(msg.sender));
        recommendedUpdateDuration = _recommendedUpdateDuration;
    }

    modifier onlyProvider() {
        if (msg.sender != provider) {
            revert OracleUtils.OnlyProviderCanCall();
        }
        _;
    }

    modifier onlyFactory() {
        if (msg.sender != address(factory)) {
            revert OracleUtils.OnlyFactoryCanCall();
        }
        _;
    }

    modifier factoryOrProvider() {
        if (msg.sender != address(factory) && msg.sender != provider) {
            revert OracleUtils.OnlyFactoryOrProviderCanCall();
        }
        _;
    }

    modifier onlyWhenActive() {
        if (!isActive) {
            revert OracleUtils.OracleIsNotActive();
        }
        _;
    }

    function setOracleStatus(bool _isActive) external factoryOrProvider {
        isActive = _isActive;
    }

    function setRecommendedUpdateDuration(uint256 _duration) external onlyProvider {
        recommendedUpdateDuration = _duration;
    }

    function update(string calldata _dataHash) external payable nonReentrant onlyWhenActive {
        if (msg.value < factory.dataUpdatePrice()) {
            revert OracleUtils.InsufficientPayment(factory.dataUpdatePrice(), msg.value);
        }

        uint256 ts = block.timestamp;
        lastUpdateTimestamp = ts;

        dataHash = _dataHash;

        address factoryAddress = address(factory);
        uint256 providerShare = factory.oracleProviderShare();

        uint256 providerAmount = (msg.value * providerShare) / 100;
        uint256 factoryAmount = msg.value - providerAmount;

        provider.transferAmount(providerAmount);
        factoryAddress.transferAmount(factoryAmount);

        emit Updated(dataHash, ts);
    }

    function _getDataHash() internal view onlyWhenActive returns (string memory) {
        if (bytes(dataHash).length == 0) {
            revert NoDataAvailable();
        }

        return dataHash;
    }

    function getDataHash() external view returns (string memory) {
        if (block.timestamp - lastUpdateTimestamp > recommendedUpdateDuration) {
            revert DataNotUpdatedRecently(lastUpdateTimestamp, recommendedUpdateDuration);
        }
        return _getDataHash();
    }

    function getDataHashWithoutCheck() external view returns (string memory) {
        return _getDataHash();
    }

    function getBlockTimestamp() external view returns (uint256) {
        return block.timestamp;
    }

    function getProvider() external view returns (address) {
        return provider;
    }
}
