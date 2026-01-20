import "dotenv/config"
import { network } from "hardhat";
import { ask, rl } from "./cmd.js";

export const addresses = {
    mantle: {
        usdc: "0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9",
        cst: "0x77A90090C9bcc45940E18657fB82Fb70A2D494fd",
    },
    "mantle-testnet": {
        usdc: "0x05856b07544044873616d390Cc50c785fe8a8885",
        cst: "0x77A90090C9bcc45940E18657fB82Fb70A2D494fd",
    },
    cronos: {
        usdc: "0xc21223249CA28397B4B6541dfFaEcC539BfF0c59",
        cst: "0x6e0a0ba0e4e7433e65e6b4a12860baf43b0b8f06",
    },
    "cronos-testnet": {
        usdc: "0xb1BF5CA11a4C4f95ab46B496757E1DBb1397eC0a",
        cst: "0x6e0a0ba0e4e7433e65e6b4a12860baf43b0b8f06",
    },
};

const main = async () => {
    try {
        const networkName = await ask("Network: ");
        const { ethers } = await network.connect({ network: networkName });
        const cstTokenAddress = addresses[networkName as keyof typeof addresses].cst;
        const usdcTokenAddress = addresses[networkName as keyof typeof addresses].usdc;
        const OracleFactory = await ethers.getContractFactory("OracleFactory");
        const factory = await OracleFactory.deploy(
            process.env.OWNER_ADDRESS!,
            usdcTokenAddress,
            cstTokenAddress
        );

        await factory.waitForDeployment();

        console.log("Factory deployed to:", await factory.getAddress());
        rl.close();
    } catch (error) {
        console.error(error);
        rl.close();
    }
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
