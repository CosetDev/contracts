// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

/// @title Coset Oracle Errors
/// @author Halil Beycan
/// @notice Utility library for Coset contracts
library OracleErrors {
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
    error InsufficientPayment(uint256 required, uint256 balance);
    error DataSizeExceedsLimit(uint256 providedSize, uint256 maxSize);
}
