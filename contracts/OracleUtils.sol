// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

library OracleUtils {
    // global errors
    error OracleIsNotActive();
    error OnlyFactoryCanCall();
    error OnlyProviderCanCall();
    error OnlyFactoryOrProviderCanCall();

    error ZeroAmountProvided();
    error ZeroAddressProvided();
    error AmountTransferFailed();

    error InsufficientPayment(uint256 required, uint256 provided);

    function transferAmount(address _to, uint256 _amount) internal returns (bool) {
        if (_to == address(0)) {
            revert OracleUtils.ZeroAddressProvided();
        }

        if (_amount == 0) {
            revert OracleUtils.ZeroAmountProvided();
        }

        (bool success, ) = _to.call{value: _amount}("");

        if (!success) {
            revert OracleUtils.AmountTransferFailed();
        }

        return true;
    }
}
