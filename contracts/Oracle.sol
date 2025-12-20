// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract Oracle {
    address public owner;
    uint256 public lastUpdateTimestamp;
    uint256 public recommendedUpdateDuration;

    event Updated(bytes data, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(uint256 _recommendedUpdateDuration) {
        recommendedUpdateDuration = _recommendedUpdateDuration;
        owner = msg.sender;
    }

    function update(bytes calldata data) external onlyOwner {
        uint256 ts = block.timestamp;
        lastUpdateTimestamp = ts;

        emit Updated(data, ts);
    }
}
