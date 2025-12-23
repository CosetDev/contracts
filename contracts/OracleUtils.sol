// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

/// @title Coset Oracle Utilities
/// @author Halil Beycan
/// @notice Utility library for Coset contracts
library OracleUtils {
    // global errors
    error NoStatusChange();
    error OracleIsNotActive();
    error OnlyFactoryCanCall();
    error OnlyProviderCanCall();

    error ZeroAmountProvided();
    error ZeroAddressProvided();
    error AmountTransferFailed();
    error YouCantSetEmptyData();
    error ProviderShouldBeEOA();
    error FactoryShouldBeContract();

    error OracleIsNotExist(address oracleAddress);
    error ExcessivePayment(uint256 required, uint256 provided);
    error InsufficientPayment(uint256 required, uint256 provided);
    error DataSizeExceedsLimit(uint256 providedSize, uint256 maxSize);

    function transferAmount(address _to, uint256 _amount) internal {
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
    }
}
