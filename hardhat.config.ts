import dotenv from "dotenv";
import { defineConfig } from "hardhat/config";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

dotenv.config();

export default defineConfig({
    plugins: [hardhatVerify, hardhatToolboxMochaEthersPlugin],
    solidity: {
        profiles: {
            default: {
                version: "0.8.30",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                    viaIR: true,
                },
            },
            production: {
                version: "0.8.30",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                    viaIR: true,
                },
            },
        },
    },
    verify: {
        etherscan: {
            apiKey: process.env.ETHERSCAN_API_KEY!,
        },
    },
    networks: {
        mantle: {
            chainId: 5000,
            type: "http",
            chainType: "l1",
            url: "https://rpc.mantle.xyz",
            accounts: [process.env.OWNER_PRIVATE_KEY!],
        },
        "mantle-testnet": {
            chainId: 5003,
            type: "http",
            chainType: "l1",
            url: "https://rpc.sepolia.mantle.xyz",
            accounts: [process.env.OWNER_PRIVATE_KEY!],
        },
    },
});
