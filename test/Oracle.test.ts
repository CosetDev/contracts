import { expect } from "chai";
import { before } from "mocha";
import { network } from "hardhat";
import { BytesLike } from "ethers";
import { Oracle } from "../types/ethers-contracts/Oracle.js";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import { OracleFactory } from "../types/ethers-contracts/OracleFactory.js";
import { jsonOver5KB, jsonUnder5KB } from "./data.js";

const { ethers, networkHelpers } = await network.connect();

const toBytes = (str: string) => {
    return ethers.toUtf8Bytes(str);
};

const fromBytes = (data: BytesLike) => {
    return ethers.toUtf8String(data);
};

const jsonCompare = (json1: any, json2: any) => {
    return JSON.stringify(json1) === JSON.stringify(json2);
};

describe("Oracle", function () {
    let oracle: Oracle;

    let factory: OracleFactory;

    let owner: HardhatEthersSigner;

    let deployer: HardhatEthersSigner;

    let provider: HardhatEthersSigner;

    let thirdPartyUser: HardhatEthersSigner;

    const dateUpdatePrice = ethers.parseEther("0.01");

    const dataUpdatePriceUp = ethers.parseEther("0.02");

    const getBalance = async (signer: HardhatEthersSigner) => {
        const wei = await signer.provider?.getBalance(signer.address);
        return ethers.formatEther(wei!);
    };

    before(async function () {
        [owner, deployer, provider, thirdPartyUser] = await ethers.getSigners();

        const Factory = await ethers.getContractFactory("OracleFactory", deployer);
        factory = await Factory.deploy(owner.address);
        await factory.waitForDeployment();
    });

    it("Should deploy Oracle contract", async function () {
        const tx = await factory
            .connect(provider)
            .deployOracle(10, dateUpdatePrice, ethers.toUtf8Bytes("Initial data"), {
                value: ethers.parseEther("0.05"),
            });

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

    it("Should revert deploy Oracle process bc sent excess ether", async function () {
        await expect(
            factory
                .connect(provider)
                .deployOracle(10, dateUpdatePrice, ethers.toUtf8Bytes("Initial data"), {
                    value: ethers.parseEther("0.06"),
                })
        ).to.be.revertedWithCustomError(factory, "ExcessivePayment");
    });

    it("Should revert update bc not factory", async function () {
        await expect(
            oracle.connect(thirdPartyUser).updateData(toBytes("Test data"))
        ).to.be.revertedWithCustomError(oracle, "OnlyFactoryCanCall");
    });

    it("Should revert update bc didn't send enough ether", async function () {
        await expect(
            factory.connect(owner).updateOracleData(await oracle.getAddress(), toBytes("Test data"))
        )
            .to.be.revertedWithCustomError(oracle, "InsufficientPayment")
            .withArgs(dateUpdatePrice, 0);
    });

    it("Should revert update bc sent excess ether", async function () {
        await expect(
            factory
                .connect(owner)
                .updateOracleData(await oracle.getAddress(), toBytes("Test data"), {
                    value: dataUpdatePriceUp,
                })
        )
            .to.be.revertedWithCustomError(oracle, "ExcessivePayment")
            .withArgs(dateUpdatePrice, dataUpdatePriceUp);
    });

    it("Should revert update bc empty data", async function () {
        await expect(
            factory.connect(owner).updateOracleData(await oracle.getAddress(), toBytes(""), {
                value: dateUpdatePrice,
            })
        ).to.be.revertedWithCustomError(oracle, "YouCantSetEmptyData");
    });

    it("Should update data successfully", async function () {
        const tx = await factory
            .connect(owner)
            .updateOracleData(await oracle.getAddress(), toBytes("Test data"), {
                value: dateUpdatePrice,
            });
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
        const tx = await factory
            .connect(owner)
            .updateOracleData(await oracle.getAddress(), toBytes("Another data"), {
                value: dateUpdatePrice,
            });

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
            oracle
                .connect(thirdPartyUser)
                .updateData(toBytes("Test data"), { value: ethers.parseEther("0.002") })
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
        expect(config.oracleDeployPrice).to.equal(ethers.parseEther("0.05"));
        expect(config.oracleFactoryShare).to.equal(20);
    });

    it("Update oracle config by owner", async function () {
        const tx = await factory.connect(owner).updateConfig(ethers.parseEther("0.06"), 25);
        await tx.wait();

        const config = await factory.config();
        expect(config.oracleDeployPrice).to.equal(ethers.parseEther("0.06"));
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
        await expect(
            factory
                .connect(owner)
                .updateOracleData(await oracle.getAddress(), toBytes(JSON.stringify(jsonOver5KB)), {
                    value: dataUpdatePriceUp,
                })
        ).to.be.revertedWithCustomError(oracle, "DataSizeExceedsLimit");
    });

    it("Should update data successfully", async function () {
        const tx = await factory
            .connect(owner)
            .updateOracleData(await oracle.getAddress(), toBytes(JSON.stringify(jsonUnder5KB)), {
                value: dataUpdatePriceUp,
            });
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
});
