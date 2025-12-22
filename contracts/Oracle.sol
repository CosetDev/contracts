// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import "./OracleUtils.sol";
import "./OracleFactory.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Oracle is ReentrancyGuard {
    using OracleUtils for address;

    // variables
    bool public isActive = true;

    bytes private data;

    uint256 public lastUpdateTimestamp;

    uint256 public recommendedUpdateDuration;

    // oracle provider and factory
    address public immutable provider;
    OracleFactory public immutable factory;

    // events
    event Updated(bytes data, uint256 timestamp);

    // errors
    error NoDataAvailable();

    error DataNotUpdatedRecently(uint256 lastUpdateTimestamp, uint256 recommendedUpdateDuration);

    constructor(uint256 _recommendedUpdateDuration, bytes memory _initialData) {
        data = _initialData;
        provider = tx.origin;
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

    function update(bytes calldata _data) external payable nonReentrant onlyWhenActive {
        OracleFactory.FactoryConfig memory config = factory.getConfig();

        if (msg.value < config.dataUpdatePrice) {
            revert OracleUtils.InsufficientPayment(config.dataUpdatePrice, msg.value);
        }

        data = _data;

        uint256 ts = block.timestamp;
        lastUpdateTimestamp = ts;

        address factoryAddress = address(factory);
        uint256 providerShare = config.oracleProviderShare;

        uint256 providerAmount = (msg.value * providerShare) / 100;
        uint256 factoryAmount = msg.value - providerAmount;

        provider.transferAmount(providerAmount);
        factoryAddress.transferAmount(factoryAmount);

        emit Updated(data, ts);
    }

    function _getData() private view returns (bytes memory) {
        if (bytes(data).length == 0) {
            revert NoDataAvailable();
        }

        return data;
    }

    function getData() external view onlyWhenActive returns (bytes memory) {
        if (block.timestamp - lastUpdateTimestamp > recommendedUpdateDuration) {
            revert DataNotUpdatedRecently(lastUpdateTimestamp, recommendedUpdateDuration);
        }
        return _getData();
    }

    function getDataWithoutCheck() external view onlyWhenActive returns (bytes memory) {
        return _getData();
    }

    function getBlockTimestamp() external view returns (uint256) {
        return block.timestamp;
    }

    function getProvider() external view returns (address) {
        return provider;
    }

    function getFactory() external view returns (address) {
        return address(factory);
    }
}
