// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import "./OracleUtils.sol";
import "./OracleFactory.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Coset Oracle
/// @author Halil Beycan
/// @notice Official oracle implementation by Halil Beycan for Coset
contract Oracle is ReentrancyGuard {
    using OracleUtils for address;

    uint256 public constant MAX_DATA_SIZE = 5120; // 5 KB

    // variables
    bool public isActive = true;

    bytes private data;

    uint256 public dataUpdatePrice;

    uint256 public lastUpdateTimestamp;

    uint256 public recommendedUpdateDuration;

    // oracle provider and factory
    address public immutable provider;
    OracleFactory public immutable factory;

    struct DataSnapshot {
        bytes data;
        uint256 timestamp;
    }

    DataSnapshot[100] public history;
    uint256 private historyIndex;
    uint256 public historyCount;

    // events
    event DataUpdated(bytes data, uint256 timestamp);

    // errors
    error NoDataAvailable();

    error DataNotUpdatedRecently(uint256 lastUpdateTimestamp, uint256 recommendedUpdateDuration);

    constructor(
        uint256 _recommendedUpdateDuration,
        uint256 _dataUpdatePrice,
        bytes memory _initialData,
        address _provider,
        address _factory
    ) {
        if (_provider == address(0) || _factory == address(0)) {
            revert OracleUtils.ZeroAddressProvided();
        }
        if (_provider.code.length != 0) {
            revert OracleUtils.ProviderShouldBeEOA();
        }
        if (_factory.code.length == 0) {
            revert OracleUtils.FactoryShouldBeContract();
        }
        provider = _provider;
        dataUpdatePrice = _dataUpdatePrice;
        lastUpdateTimestamp = block.timestamp;
        factory = OracleFactory(payable(_factory));
        recommendedUpdateDuration = _recommendedUpdateDuration;
        _setData(_initialData, lastUpdateTimestamp);
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

    modifier onlyWhenActive() {
        if (!isActive) {
            revert OracleUtils.OracleIsNotActive();
        }
        _;
    }

    function setRecommendedUpdateDuration(uint256 _duration) external onlyProvider {
        recommendedUpdateDuration = _duration;
    }

    function setDataUpdatePrice(uint256 _price) external onlyFactory {
        dataUpdatePrice = _price;
    }

    function setOracleStatus(bool _isActive) external onlyFactory {
        isActive = _isActive;
    }

    function updateData(
        bytes calldata _data
    ) external payable nonReentrant onlyWhenActive onlyProvider {
        (, uint256 factoryShare) = factory.config();
        uint256 factoryAmount = (dataUpdatePrice * factoryShare) / 100;

        if (msg.value < factoryAmount) {
            revert OracleUtils.InsufficientPayment(factoryAmount, msg.value);
        }

        if (msg.value > factoryAmount) {
            revert OracleUtils.ExcessivePayment(factoryAmount, msg.value);
        }

        uint256 ts = block.timestamp;
        lastUpdateTimestamp = ts;

        _setData(_data, ts);

        address(factory).transferAmount(factoryAmount);

        emit DataUpdated(data, ts);
    }

    function _setData(bytes memory _data, uint256 _timestamp) private {
        if (_data.length == 0) {
            revert OracleUtils.YouCantSetEmptyData();
        }

        if (_data.length > MAX_DATA_SIZE) {
            revert OracleUtils.DataSizeExceedsLimit(_data.length, MAX_DATA_SIZE);
        }

        history[historyIndex] = DataSnapshot({data: _data, timestamp: _timestamp});

        historyIndex = (historyIndex + 1) % 100;

        if (historyCount < 100) {
            historyCount++;
        }

        data = _data;
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

    function getProvider() external view returns (address) {
        return provider;
    }
}
