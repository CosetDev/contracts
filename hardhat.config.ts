import dotenv from "dotenv";
import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

dotenv.config();

export default defineConfig({
    plugins: [hardhatToolboxMochaEthersPlugin],
    solidity: {
        profiles: {
            default: {
                version: "0.8.30",
            },
            production: {
                version: "0.8.30",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
        },
    },
    networks: {
        "mantle-testnet": {
            type: "http",
            chainType: "l1",
            url: "https://rpc.testnet.mantle.xyz",
            accounts: [process.env.EVM_PRIVATE_KEY!],
        },
    },
});
