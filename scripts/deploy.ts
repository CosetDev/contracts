import dotenv from "dotenv";
import { network } from "hardhat";

dotenv.config();

const main = async () => {
    const { ethers } = await network.connect();
    const OracleFactory = await ethers.getContractFactory("OracleFactory");
    const factory = await OracleFactory.deploy(process.env.DEVELOPER_1!);

    await factory.waitForDeployment();

    console.log("Factory deployed to:", await factory.getAddress());
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
