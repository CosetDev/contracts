import { expect } from "chai";
import { network } from "hardhat";
import { before } from "mocha";
import { Oracle } from "../types/ethers-contracts/Oracle.js";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import { OracleFactory } from "../types/ethers-contracts/OracleFactory.js";

const { ethers, networkHelpers } = await network.connect();

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
            .deployOracle(10, "Initial data", { value: ethers.parseEther("0.05") });

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
        expect(await oracle.getDataHash()).to.equal("Initial data");
    });

    it("Should revert update bc didn't send enough ether", async function () {
        await expect(oracle.connect(thirdPartyUser).update("Test data"))
            .to.be.revertedWithCustomError(oracle, "InsufficientPayment")
            .withArgs(ethers.parseEther("0.01"), 0);
    });

    it("Should update data successfully", async function () {
        const tx = await oracle
            .connect(thirdPartyUser)
            .update("Test data", { value: ethers.parseEther("0.01") });
        await tx.wait();

        const data = await oracle.getDataHash();
        expect(data).to.equal("Test data");
    });

    it("Should have correct provider address", async function () {
        const _provider = await oracle.getProvider();
        expect(_provider).to.equal(provider.address);
    });

    it("Should have update with correct event", async function () {
        const tx = await oracle
            .connect(thirdPartyUser)
            .update("Another data", { value: ethers.parseEther("0.01") });

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

        expect(newValue).to.equal("Another data");
        expect(await oracle.getDataHash()).to.equal("Another data");
    });

    it("Owner balance should be 10000.004", async function () {
        expect(await getBalance(owner)).to.equal("10000.004");
    });

    it("Wait for 15 seconds to test data not updated recently revert", async function () {
        await networkHelpers.time.increase(11);

        await expect(oracle.getDataHash())
            .to.be.revertedWithCustomError(oracle, "DataNotUpdatedRecently")
            .withArgs(oracle.lastUpdateTimestamp(), oracle.recommendedUpdateDuration());
    });

    // TODO: add other tests like onlyWhenActive, onlyProvider vb.
});
