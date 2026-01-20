import * as readline from "readline";

export const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

export const ask = (question: string) => {
    return new Promise<string>(resolve => {
        rl.question(question, resolve);
    });
};
