import { expect } from "chai";
import { before } from "mocha";
import { network } from "hardhat";
import { BytesLike } from "ethers";
import { Oracle } from "../types/ethers-contracts/Oracle.js";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import { OracleFactory } from "../types/ethers-contracts/OracleFactory.js";

const { ethers, networkHelpers, networkName } = await network.connect();

const toBytes = (str: string) => {
    return ethers.toUtf8Bytes(str);
};

const fromBytes = (data: BytesLike) => {
    return ethers.toUtf8String(data);
};

describe("Oracle", function () {
    let oracle: Oracle;

    let factory: OracleFactory;

    let owner: HardhatEthersSigner;

    let deployer: HardhatEthersSigner;

    let provider: HardhatEthersSigner;

    let thirdPartyUser: HardhatEthersSigner;

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
            .deployOracle(10, ethers.parseEther("0.01"), ethers.toUtf8Bytes("Initial data"), {
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

    it("Should revert update bc didn't send enough ether", async function () {
        await expect(oracle.connect(thirdPartyUser).update(toBytes("Test data")))
            .to.be.revertedWithCustomError(oracle, "InsufficientPayment")
            .withArgs(ethers.parseEther("0.01"), 0);
    });

    it("Should update data successfully", async function () {
        const tx = await oracle
            .connect(thirdPartyUser)
            .update(toBytes("Test data"), { value: ethers.parseEther("0.01") });
        await tx.wait();

        const data = await oracle.getData();
        expect(fromBytes(data)).to.equal("Test data");
    });

    it("Should have correct provider address", async function () {
        const _provider = await oracle.getProvider();
        expect(_provider).to.equal(provider.address);
    });

    it("Should have update with correct event", async function () {
        const tx = await oracle
            .connect(thirdPartyUser)
            .update(toBytes("Another data"), { value: ethers.parseEther("0.01") });

        const receipt = await tx.wait();

        const updatedEvents = receipt?.logs
            .map(log => {
                try {
                    return oracle.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .filter(log => log !== null && log.name === "Updated");

        expect(updatedEvents?.length).to.be.equal(1);

        const event = updatedEvents?.[0]!;
        const newValue = event.args[0];

        expect(fromBytes(newValue)).to.equal("Another data");
        expect(fromBytes(await oracle.getData())).to.equal("Another data");
    });

    it("Owner balance should be 10000.004", async function () {
        expect(await getBalance(owner)).to.equal("10000.004");
    });

    it("Wait for 15 seconds to test data not updated recently revert", async function () {
        await networkHelpers.time.increase(11);

        await expect(oracle.getData())
            .to.be.revertedWithCustomError(oracle, "DataNotUpdatedRecently")
            .withArgs(oracle.lastUpdateTimestamp(), oracle.recommendedUpdateDuration());
    });

    it("Deactivate the oracle by provider", async function () {
        const tx = await oracle.connect(provider).setOracleStatus(false);
        await tx.wait();

        expect(await oracle.isActive()).to.equal(false);

        await expect(
            oracle
                .connect(thirdPartyUser)
                .update(toBytes("Test data"), { value: ethers.parseEther("0.01") })
        ).to.be.revertedWithCustomError(oracle, "OracleIsNotActive");

        await expect(oracle.getData()).to.be.revertedWithCustomError(oracle, "OracleIsNotActive");
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
        const factoryAddress = await oracle.getFactory();
        expect(factoryAddress).to.equal(await factory.getAddress());
    });

    it("Get factory config", async function () {
        const config = await factory.getConfig();
        expect(config.oracleDeployPrice).to.equal(ethers.parseEther("0.05"));
        expect(config.oracleFactoryShare).to.equal(20);
    });

    it("Update oracle config by owner", async function () {
        const tx = await factory.connect(owner).updateConfig({
            oracleDeployPrice: ethers.parseEther("0.06"),
            oracleFactoryShare: 25,
        });
        await tx.wait();

        const config = await factory.getConfig();
        expect(config.oracleDeployPrice).to.equal(ethers.parseEther("0.06"));
        expect(config.oracleFactoryShare).to.equal(25);
    });

    it("Provider can't update data update price by oracle", async function () {
        await expect(
            oracle.connect(provider).setDataUpdatePrice(ethers.parseEther("0.02"))
        ).to.be.revertedWithCustomError(oracle, "OnlyFactoryCanCall");
    });

    it("Provider can't update data update price by factory", async function () {
        await expect(
            factory
                .connect(provider)
                .setOracleDataUpdatePrice(oracle.getAddress(), ethers.parseEther("0.02"))
        ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Factory can update data update price", async function () {
        const tx = await factory
            .connect(owner)
            .setOracleDataUpdatePrice(oracle.getAddress(), ethers.parseEther("0.02"));
        await tx.wait();

        expect(await oracle.dataUpdatePrice()).to.equal(ethers.parseEther("0.02"));
    });
});
