import * as readline from "readline";
import { execSync } from "child_process";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const ask = (question: string) => {
    return new Promise<string>(resolve => {
        rl.question(question, resolve);
    });
};

const main = async () => {
    try {
        const network = await ask("Network: ");
        const contractAddress = await ask("Contract address: ");
        const argCountStr = await ask("Number of constructor arguments: ");
        const argCount = parseInt(argCountStr.trim(), 10);

        const constructorArgs: string[] = [];

        for (let i = 0; i < argCount; i++) {
            const arg = await ask(`Arg #${i + 1}: `);
            constructorArgs.push(arg.trim());
        }

        rl.close();

        console.log("\nNetwork:", network);
        console.log("Contract address:", contractAddress);
        console.log("Constructor args:", constructorArgs);

        // Build CLI command
        const cmd = `npx hardhat verify --network ${network} ${contractAddress} ${constructorArgs.join(
            " "
        )}`;

        console.log("\nRunning:", cmd);
        execSync(cmd, { stdio: "inherit" });
    } catch (error: any) {
        rl.close();
    }
};

main();
