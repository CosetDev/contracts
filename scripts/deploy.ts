import dotenv from "dotenv";
import { network } from "hardhat";

dotenv.config();

const main = async () => {
    const { ethers, networkName } = await network.connect();
    const paymentTokenAddress = networkName.includes("testnet")
        ? process.env.NBRC_ADDRESS!
        : process.env.USDC_ADDRESS!;
    const OracleFactory = await ethers.getContractFactory("OracleFactory");
    const factory = await OracleFactory.deploy(process.env.OWNER_ADDRESS!, paymentTokenAddress);

    await factory.waitForDeployment();

    console.log("Factory deployed to:", await factory.getAddress());
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
