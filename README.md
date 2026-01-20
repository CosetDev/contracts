# Contracts

This package contains the on-chain contracts that power Coset’s oracle network:

- [`contracts/contracts/OracleFactory.sol`](contracts/contracts/OracleFactory.sol) deploys and manages provider oracles.
- [`contracts/contracts/Oracle.sol`](contracts/contracts/Oracle.sol) stores the provider’s latest payload (`bytes`) on-chain.

Canonical docs:

- https://docs.coset.dev/contracts/oracle-factory
- https://docs.coset.dev/contracts/oracle

## Contracts overview

### OracleFactory

The factory is owned by Coset’s relayer node (the `owner()` from OpenZeppelin `Ownable`). In practice, the owner uses the factory to:

- deploy new provider oracles (paid)
- update oracle data (paid; provider receives rewards)
- activate/deactivate oracles

#### Factory config

The factory stores a `config` struct (see [`OracleFactory.FactoryConfig`](contracts/contracts/OracleFactory.sol)):

- `oracleDeployPrice` (default: **5 USDC**, expressed with 6 decimals)
- `oracleFactoryShare` (default: **20%**)
- `usdcTokenAddress`
- `cstTokenAddress`

Owner can update these via `updateConfig(...)`.

#### Payments (USDC / CST)

The factory accepts **USDC** and **CST** as payment tokens.

Important:

- Both tokens are expected to support **EIP-3009** (`transferWithAuthorization`) via [`contracts/contracts/IERC20Extended.sol`](contracts/contracts/IERC20Extended.sol).
- If paying with **CST**, the factory must have a `cstPriceOracle` configured.

#### CST price oracle

To accept CST payments, the factory needs `cstPriceOracle` (set by owner via `updateCstPriceOracle(address)`).

The factory interprets the CST price oracle’s data as an ASCII base-10 integer string (digits only) representing:

> **1 USDC = X CST**

and converts USDC-denominated amounts into CST using:

`cstAmount = (usdcAmount * oneUsdcInCst) / 1e6`

#### Deploying an oracle (`deployOracle`)

Providers deploy their oracle by calling `deployOracle(...)` with:

- chosen payment token (USDC or CST)
- `recommendedUpdateDuration` (seconds)
- `dataUpdatePrice` (denominated in USDC; converted to CST when paying in CST)
- `initialData` (`bytes`, non-empty, max 5120 bytes)
- an **EIP-3009** authorization signature so the factory can pull the deploy fee

What happens:

1. Factory checks the provider has enough token balance.
2. Deploys a new [`Oracle`](contracts/contracts/Oracle.sol).
3. Stores metadata in:
   - `oracleList`
   - `oracles[oracleAddress]` → `(provider, createdAt, isActive)`
   - `providerOracles[provider]`
4. Transfers the deploy fee to the factory `owner()` using `transferWithAuthorization(...)`.
5. Emits `OracleDeployed(oracleAddress, provider, timestamp)`.

#### Updating oracle data (`updateOracleData`)

Only the factory **owner** can push updates via `updateOracleData(...)`:

- Writes the payload to the oracle (`Oracle.updateData(bytes)`).
- Pays the provider using `transferWithAuthorization(...)`.
- Splits the `dataUpdatePrice` using `oracleFactoryShare`:
  - provider earns: `dataUpdatePrice - (dataUpdatePrice * oracleFactoryShare / 100)`
  - platform share remains with the owner

When paying with CST, provider earnings are converted using `cstPriceOracle`.

#### Admin / management

- `setOracleStatus(oracle, isActive)` toggles an oracle’s active state and maintains `activeOracleCount`.
- `setOracleDataUpdatePrice(oracle, price)` updates the per-update price stored on the oracle.

#### Querying deployed oracles

All list endpoints are paginated:

- `getAllOracles(offset, limit)`
- `getProviderOracles(provider, offset, limit)`
- `getOracleInfo(oracle)` → `(provider, createdAt, isActive)`

### Oracle

Each oracle stores a provider’s latest payload on-chain as raw `bytes`.

Key properties (see [`contracts/contracts/Oracle.sol`](contracts/contracts/Oracle.sol)):

- provider is an **EOA** and is stored immutably (`provider`). Contract providers are rejected at construction time.
- `MAX_DATA_SIZE` is **5120 bytes** (5 KB); empty payloads are rejected.

#### Reading data

The oracle provides two read methods:

- `getData()` (strict)
  - reverts if `block.timestamp - lastUpdateTimestamp > recommendedUpdateDuration`
- `getDataWithoutCheck()` (non-strict)
  - returns the latest stored data without a staleness check

Both reads require the oracle to be **active** (`isActive == true`).

#### Updating data

Oracles are updated through the factory (not directly by requesters):

- `updateData(bytes)`
  - only callable by the factory
  - updates `lastUpdateTimestamp`
  - stores the payload
  - emits `DataUpdated(data, timestamp)`

#### Access control

- Provider can call:
  - `setRecommendedUpdateDuration(uint256)`
- Factory can call:
  - `updateData(bytes)`
  - `setDataUpdatePrice(uint256)`
  - `setOracleStatus(bool)`

#### History

The oracle keeps the last **100** data snapshots in a ring buffer (`history`) and exposes `historyCount`.

## Development

### Install

```bash
npm install
```

### Compile

```bash
npm run compile
```

### Run tests

```bash
npm test
```

Tests cover deploy/update flows, access control, staleness logic, data size limits, and EIP-3009 signature validation (see [`contracts/test/Oracle.test.ts`](contracts/test/Oracle.test.ts)).

### Deploy

```bash
npm run deploy
```

Deployment scripts live under [`contracts/scripts`](contracts/scripts).
