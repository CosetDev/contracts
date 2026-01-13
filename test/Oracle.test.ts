import { expect } from "chai";
import { before } from "mocha";
import { network } from "hardhat";
import TestToken from "./TestToken.json";
import { BytesLike, formatUnits, parseUnits } from "ethers";
import { jsonOver5KB, jsonUnder5KB } from "./data.js";
import { Oracle } from "../types/ethers-contracts/Oracle.js";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import { OracleFactory } from "../types/ethers-contracts/OracleFactory.js";

const { ethers, networkHelpers, networkConfig } = await network.connect();

const chainId = networkConfig.chainId;

const toBytes = (str: string) => {
    return ethers.toUtf8Bytes(str);
};

const fromBytes = (data: BytesLike) => {
    return ethers.toUtf8String(data);
};

const jsonCompare = (json1: any, json2: any) => {
    return JSON.stringify(json1) === JSON.stringify(json2);
};

interface TestToken {
    name(): Promise<string>;
    version(): Promise<string>;
    getAddress(): Promise<string>;
    balanceOf(account: string): Promise<bigint>;
    transfer(to: string, amount: bigint): Promise<void>;
    waitForDeployment(): Promise<void>;
    connect(signer: HardhatEthersSigner): TestToken;
}

describe("Oracle", function () {
    let oracle: Oracle;

    let cstPriceOracle: Oracle;

    let factory: OracleFactory;

    let usdcToken: TestToken;

    let cstToken: TestToken;

    let someToken: TestToken;

    let owner: HardhatEthersSigner;

    let deployer: HardhatEthersSigner;

    let provider: HardhatEthersSigner;

    let thirdPartyUser: HardhatEthersSigner;

    const dataUpdatePrice = parseUnits("10", 6);

    const dataUpdatePriceUp = parseUnits("20", 6);

    const oneUsdcInCst = parseUnits("2", 6); // 1 USDC = 2 CST

    before(async function () {
        [owner, deployer, provider, thirdPartyUser] = await ethers.getSigners();

        // deploy test ERC20 token
        const UsdcToken = new ethers.ContractFactory(TestToken.abi, TestToken.bytecode, deployer);
        usdcToken = (await UsdcToken.deploy()) as any as TestToken;
        await usdcToken.waitForDeployment();
        const CstToken = new ethers.ContractFactory(TestToken.abi, TestToken.bytecode, deployer);
        cstToken = (await CstToken.deploy()) as any as TestToken;
        await cstToken.waitForDeployment();
        const SomeToken = new ethers.ContractFactory(TestToken.abi, TestToken.bytecode, deployer);
        someToken = (await SomeToken.deploy()) as any as TestToken;
        await someToken.waitForDeployment();

        // transfer test tokens to users
        const initialAmount = ethers.parseUnits("1000", 6);
        const deployerWalletUsdc = usdcToken.connect(deployer);
        await deployerWalletUsdc.transfer(await provider.getAddress(), initialAmount);
        await deployerWalletUsdc.transfer(await owner.getAddress(), initialAmount);
        await deployerWalletUsdc.transfer(await thirdPartyUser.getAddress(), initialAmount);

        const deployerWalletCst = cstToken.connect(deployer);
        await deployerWalletCst.transfer(await provider.getAddress(), initialAmount);
        await deployerWalletCst.transfer(await owner.getAddress(), initialAmount);
        await deployerWalletCst.transfer(await thirdPartyUser.getAddress(), initialAmount);

        // deploy factory
        const Factory = await ethers.getContractFactory("OracleFactory", deployer);
        factory = await Factory.deploy(
            owner.address,
            await usdcToken.getAddress(),
            await cstToken.getAddress()
        );
        await factory.waitForDeployment();
    });

    const subFactoryShare = async (amount: bigint) => {
        const config = await factory.config();
        const factoryShare = (amount * BigInt(config.oracleFactoryShare)) / 100n;
        return amount - factoryShare;
    };

    const prepareSignature = async (
        signer: HardhatEthersSigner,
        testToken: TestToken,
        from: string,
        to: string,
        value: bigint
    ) => {
        const validAfter = 0;
        const validBefore = Math.floor(Date.now() / 1000) + 3600;
        const nonce = ethers.hexlify(ethers.randomBytes(32));

        const name = await testToken.name();
        const version = await testToken.version();

        const domain = {
            name: name,
            version: version,
            chainId: chainId,
            verifyingContract: await testToken.getAddress(),
        };

        // EIP-712 Type
        const types = {
            TransferWithAuthorization: [
                { name: "from", type: "address" },
                { name: "to", type: "address" },
                { name: "value", type: "uint256" },
                { name: "validAfter", type: "uint256" },
                { name: "validBefore", type: "uint256" },
                { name: "nonce", type: "bytes32" },
            ],
        };

        // Message
        const message = {
            from,
            to,
            value,
            validAfter,
            validBefore,
            nonce,
        };

        const sig = ethers.Signature.from(await signer.signTypedData(domain, types, message));

        return { validAfter, validBefore, nonce, sig };
    };

    it("Should deploy Oracle contract", async function () {
        const config = await factory.config();
        const { validAfter, validBefore, nonce, sig } = await prepareSignature(
            provider,
            usdcToken,
            await provider.getAddress(),
            await owner.getAddress(),
            config.oracleDeployPrice
        );
        const tx = await factory
            .connect(provider)
            .deployOracle(
                await usdcToken.getAddress(),
                10,
                dataUpdatePrice,
                ethers.toUtf8Bytes("Initial data"),
                validAfter,
                validBefore,
                nonce,
                sig.v,
                sig.r,
                sig.s
            );

        const receipt = await tx.wait();

        const deployedEvents = receipt?.logs
            .map(log => {
                try {
                    return factory.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .filter(log => log !== null && log.name === "OracleDeployed");

        const oracleAddress = deployedEvents?.[0]!.args[0];

        oracle = await ethers.getContractAt("Oracle", oracleAddress);

        expect(await oracle.getProvider()).to.equal(provider.address);
        expect(fromBytes(await oracle.getData())).to.equal("Initial data");
    });

    it("History count should be 1 after deployment", async function () {
        const historyCount = await oracle.historyCount();
        expect(historyCount).to.equal(1);
    });

    it("Should revert deploy Oracle bc sent wrong signature", async function () {
        const { validAfter, validBefore, nonce, sig } = await prepareSignature(
            provider,
            usdcToken,
            await provider.getAddress(),
            await factory.getAddress(),
            10n * 10n ** 6n
        );
        await expect(
            factory
                .connect(provider)
                .deployOracle(
                    await usdcToken.getAddress(),
                    10,
                    dataUpdatePrice,
                    ethers.toUtf8Bytes("Initial data"),
                    validAfter,
                    validBefore,
                    nonce,
                    sig.v,
                    sig.r,
                    sig.s
                )
        ).to.be.revertedWith("FiatTokenV2: invalid signature");
    });

    it("Should revert update bc not factory", async function () {
        await expect(
            oracle.connect(thirdPartyUser).updateData(toBytes("Test data"))
        ).to.be.revertedWithCustomError(oracle, "OnlyFactoryCanCall");
    });

    it("Should revert update bc sent wrong signature", async function () {
        const { validAfter, validBefore, nonce, sig } = await prepareSignature(
            provider,
            usdcToken,
            await provider.getAddress(),
            await factory.getAddress(),
            10n * 10n ** 6n
        );
        await expect(
            factory
                .connect(owner)
                .updateOracleData(
                    await usdcToken.getAddress(),
                    await oracle.getAddress(),
                    toBytes("Test data"),
                    validAfter,
                    validBefore,
                    nonce,
                    sig.v,
                    sig.r,
                    sig.s
                )
        ).to.be.rejectedWith("FiatTokenV2: invalid signature");
    });

    it("Should revert update bc empty data", async function () {
        const { validAfter, validBefore, nonce, sig } = await prepareSignature(
            provider,
            usdcToken,
            await owner.getAddress(),
            await provider.getAddress(),
            10n * 10n ** 6n
        );
        await expect(
            factory
                .connect(owner)
                .updateOracleData(
                    await usdcToken.getAddress(),
                    await oracle.getAddress(),
                    toBytes(""),
                    validAfter,
                    validBefore,
                    nonce,
                    sig.v,
                    sig.r,
                    sig.s
                )
        ).to.be.revertedWithCustomError(oracle, "YouCantSetEmptyData");
    });

    it("Should data update successfully", async function () {
        const { validAfter, validBefore, nonce, sig } = await prepareSignature(
            owner,
            usdcToken,
            await owner.getAddress(),
            await provider.getAddress(),
            await subFactoryShare(dataUpdatePrice)
        );
        const tx = await factory
            .connect(owner)
            .updateOracleData(
                await usdcToken.getAddress(),
                await oracle.getAddress(),
                toBytes("Test data"),
                validAfter,
                validBefore,
                nonce,
                sig.v,
                sig.r,
                sig.s
            );
        await tx.wait();

        const data = await oracle.getData();
        expect(fromBytes(data)).to.equal("Test data");
    });

    it("History count should be 2 after first update", async function () {
        const historyCount = await oracle.historyCount();
        expect(historyCount).to.equal(2);
    });

    it("Should have correct provider address", async function () {
        const _provider = await oracle.getProvider();
        expect(_provider).to.equal(provider.address);
    });

    it("Should have update with correct event", async function () {
        const { validAfter, validBefore, nonce, sig } = await prepareSignature(
            owner,
            usdcToken,
            await owner.getAddress(),
            await provider.getAddress(),
            await subFactoryShare(dataUpdatePrice)
        );
        const tx = await factory
            .connect(owner)
            .updateOracleData(
                await usdcToken.getAddress(),
                await oracle.getAddress(),
                toBytes("Another data"),
                validAfter,
                validBefore,
                nonce,
                sig.v,
                sig.r,
                sig.s
            );

        const receipt = await tx.wait();

        const updatedEvents = receipt?.logs
            .map(log => {
                try {
                    return oracle.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .filter(log => log !== null && log.name === "DataUpdated");

        expect(updatedEvents?.length).to.be.equal(1);

        const event = updatedEvents?.[0]!;
        const newValue = event.args[0];

        expect(fromBytes(newValue)).to.equal("Another data");
        expect(fromBytes(await oracle.getData())).to.equal("Another data");
    });

    it("History count should be 3 after second update", async function () {
        const historyCount = await oracle.historyCount();
        expect(historyCount).to.equal(3);
    });

    it("Wait for 15 seconds to test data not updated recently revert", async function () {
        await networkHelpers.time.increase(11);

        await expect(oracle.getData())
            .to.be.revertedWithCustomError(oracle, "DataNotUpdatedRecently")
            .withArgs(oracle.lastUpdateTimestamp(), oracle.recommendedUpdateDuration());
    });

    it("Try deactivate the oracle as provider", async function () {
        await expect(oracle.connect(provider).setOracleStatus(false)).to.be.revertedWithCustomError(
            oracle,
            "OnlyFactoryCanCall"
        );
    });

    it("Check active oracle counter before deactivation", async function () {
        const activeOracles = await factory.activeOracleCount();
        expect(activeOracles).to.equal(1);
    });

    it("Deactivate the oracle by factory", async function () {
        const tx = await factory.connect(owner).setOracleStatus(oracle.getAddress(), false);
        await tx.wait();

        expect(await oracle.isActive()).to.equal(false);

        await expect(
            oracle.connect(thirdPartyUser).updateData(toBytes("Test data"))
        ).to.be.revertedWithCustomError(oracle, "OracleIsNotActive");

        await expect(oracle.getData()).to.be.revertedWithCustomError(oracle, "OracleIsNotActive");
    });

    it("Check active oracle counter after deactivation", async function () {
        const activeOracles = await factory.activeOracleCount();
        expect(activeOracles).to.equal(0);
    });

    it("Reactivate oracle by owner", async function () {
        const tx = await factory.connect(owner).setOracleStatus(oracle.getAddress(), true);
        await tx.wait();

        expect(await oracle.isActive()).to.equal(true);

        await expect(oracle.getData()).to.be.revertedWithCustomError(
            oracle,
            "DataNotUpdatedRecently"
        );

        expect(fromBytes(await oracle.getDataWithoutCheck())).to.equal("Another data");
    });

    it("Check active oracle counter after reactivation", async function () {
        const activeOracles = await factory.activeOracleCount();
        expect(activeOracles).to.equal(1);
    });

    it("Test setRecommendedUpdateDuration by provider", async function () {
        const tx = await oracle.connect(provider).setRecommendedUpdateDuration(20);
        await tx.wait();

        expect(await oracle.recommendedUpdateDuration()).to.equal(20);
    });

    it("Test setRecommendedUpdateDuration revert by third party user", async function () {
        await expect(
            oracle.connect(thirdPartyUser).setRecommendedUpdateDuration(30)
        ).to.be.revertedWithCustomError(oracle, "OnlyProviderCanCall");
    });

    it("Get oracle info from factory", async function () {
        const info = await factory.getOracleInfo(oracle.getAddress());
        expect(info.provider).to.equal(provider.address);
        expect(info.isActive).to.equal(true);
    });

    it("Should have correct factory address", async function () {
        const factoryAddress = await oracle.factory();
        expect(factoryAddress).to.equal(await factory.getAddress());
    });

    it("Get factory config", async function () {
        const config = await factory.config();
        expect(config.oracleDeployPrice).to.equal(parseUnits("5", 6));
        expect(config.oracleFactoryShare).to.equal(20);
    });

    it("Update oracle config by owner", async function () {
        const tx = await factory
            .connect(owner)
            .updateConfig(
                parseUnits("6", 6),
                25,
                await usdcToken.getAddress(),
                await cstToken.getAddress()
            );
        await tx.wait();

        const config = await factory.config();
        expect(config.oracleDeployPrice).to.equal(parseUnits("6", 6));
        expect(config.oracleFactoryShare).to.equal(25);
    });

    it("Provider can't update data update price by oracle", async function () {
        await expect(
            oracle.connect(provider).setDataUpdatePrice(dataUpdatePriceUp)
        ).to.be.revertedWithCustomError(oracle, "OnlyFactoryCanCall");
    });

    it("Provider can't update data update price by factory", async function () {
        await expect(
            factory
                .connect(provider)
                .setOracleDataUpdatePrice(oracle.getAddress(), dataUpdatePriceUp)
        ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Factory can update data update price", async function () {
        const tx = await factory
            .connect(owner)
            .setOracleDataUpdatePrice(oracle.getAddress(), dataUpdatePriceUp);
        await tx.wait();

        expect(await oracle.dataUpdatePrice()).to.equal(dataUpdatePriceUp);
    });

    it("Should revert update bc too large data", async function () {
        const { validAfter, validBefore, nonce, sig } = await prepareSignature(
            owner,
            usdcToken,
            await owner.getAddress(),
            await provider.getAddress(),
            await subFactoryShare(dataUpdatePriceUp)
        );
        await expect(
            factory
                .connect(owner)
                .updateOracleData(
                    await usdcToken.getAddress(),
                    await oracle.getAddress(),
                    toBytes(JSON.stringify(jsonOver5KB)),
                    validAfter,
                    validBefore,
                    nonce,
                    sig.v,
                    sig.r,
                    sig.s
                )
        ).to.be.revertedWithCustomError(oracle, "DataSizeExceedsLimit");
    });

    it("Should update data successfully", async function () {
        const { validAfter, validBefore, nonce, sig } = await prepareSignature(
            owner,
            usdcToken,
            await owner.getAddress(),
            await provider.getAddress(),
            await subFactoryShare(dataUpdatePriceUp)
        );
        const tx = await factory
            .connect(owner)
            .updateOracleData(
                await usdcToken.getAddress(),
                await oracle.getAddress(),
                toBytes(JSON.stringify(jsonUnder5KB)),
                validAfter,
                validBefore,
                nonce,
                sig.v,
                sig.r,
                sig.s
            );
        await tx.wait();

        const data = await oracle.getData();
        expect(jsonCompare(JSON.parse(fromBytes(data)), jsonUnder5KB)).to.equal(true);
    });

    it("History count should be 4 after third update", async function () {
        const historyCount = await oracle.historyCount();
        expect(historyCount).to.equal(4);
    });

    it("Get history at index", async function () {
        const history0 = await oracle.history(0);
        expect(fromBytes(history0.data)).to.equal("Initial data");

        const history1 = await oracle.history(1);
        expect(fromBytes(history1.data)).to.equal("Test data");

        const history2 = await oracle.history(2);
        expect(fromBytes(history2.data)).to.equal("Another data");

        const history3 = await oracle.history(3);
        expect(jsonCompare(JSON.parse(fromBytes(history3.data)), jsonUnder5KB)).to.equal(true);
    });

    it("Should revert update bc using different payment token", async function () {
        const { validAfter, validBefore, nonce, sig } = await prepareSignature(
            owner,
            someToken,
            await owner.getAddress(),
            await provider.getAddress(),
            10n * 10n ** 6n
        );
        await expect(
            factory
                .connect(owner)
                .updateOracleData(
                    await someToken.getAddress(),
                    await oracle.getAddress(),
                    toBytes("Test data"),
                    validAfter,
                    validBefore,
                    nonce,
                    sig.v,
                    sig.r,
                    sig.s
                )
        ).to.be.revertedWithCustomError(factory, "InvalidPaymentToken");
    });

    it("Should revert update bc using CST price oracle didn't set yet", async function () {
        const { validAfter, validBefore, nonce, sig } = await prepareSignature(
            owner,
            cstToken,
            await owner.getAddress(),
            await provider.getAddress(),
            10n * 10n ** 6n
        );
        await expect(
            factory
                .connect(owner)
                .updateOracleData(
                    await cstToken.getAddress(),
                    await oracle.getAddress(),
                    toBytes("Test data"),
                    validAfter,
                    validBefore,
                    nonce,
                    sig.v,
                    sig.r,
                    sig.s
                )
        ).to.be.revertedWithCustomError(factory, "CSTPriceOracleNotSet");
    });

    it("Should deploy CST price oracle contract", async function () {
        const config = await factory.config();
        const { validAfter, validBefore, nonce, sig } = await prepareSignature(
            provider,
            usdcToken,
            await provider.getAddress(),
            await owner.getAddress(),
            config.oracleDeployPrice
        );
        const tx = await factory
            .connect(provider)
            .deployOracle(
                await usdcToken.getAddress(),
                10,
                dataUpdatePrice,
                ethers.toUtf8Bytes(oneUsdcInCst.toString()),
                validAfter,
                validBefore,
                nonce,
                sig.v,
                sig.r,
                sig.s
            );

        const receipt = await tx.wait();

        const deployedEvents = receipt?.logs
            .map(log => {
                try {
                    return factory.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .filter(log => log !== null && log.name === "OracleDeployed");

        const oracleAddress = deployedEvents?.[0]!.args[0];

        cstPriceOracle = await ethers.getContractAt("Oracle", oracleAddress);

        expect(await cstPriceOracle.getProvider()).to.equal(provider.address);
        expect(fromBytes(await cstPriceOracle.getData())).to.equal(oneUsdcInCst.toString());
    });

    it("Set CST price oracle in factory", async function () {
        const tx = await factory
            .connect(owner)
            .updateCstPriceOracle(await cstPriceOracle.getAddress());
        await tx.wait();

        const cstPriceOracleAddress = await factory.cstPriceOracle();
        expect(cstPriceOracleAddress).to.equal(await cstPriceOracle.getAddress());
    });

    it("Should succeed update using CST token as payment token", async function () {
        const providerAmount = await subFactoryShare(dataUpdatePriceUp);
        const cstAmount = (providerAmount * oneUsdcInCst) / parseUnits("1", 6);
        const { validAfter, validBefore, nonce, sig } = await prepareSignature(
            owner,
            cstToken,
            await owner.getAddress(),
            await provider.getAddress(),
            cstAmount
        );
        const tx = await factory
            .connect(owner)
            .updateOracleData(
                await cstToken.getAddress(),
                await oracle.getAddress(),
                toBytes("CST payment token data"),
                validAfter,
                validBefore,
                nonce,
                sig.v,
                sig.r,
                sig.s
            );
        await tx.wait();

        const data = await oracle.getData();
        expect(fromBytes(data)).to.equal("CST payment token data");
    });

    it("Should be 970 CST tokens left in owner account", async function () {
        const ownerCstBalance = await cstToken.connect(owner).balanceOf(await owner.getAddress());
        expect(ownerCstBalance).to.equal(parseUnits("970", 6));
    });
});
