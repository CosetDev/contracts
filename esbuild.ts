import glob from "fast-glob";
import { execSync } from "child_process";
import { copy } from "esbuild-plugin-copy";
import { build, BuildOptions } from "esbuild";
import esbuildPluginTsc from "esbuild-plugin-tsc";

async function generateTypes() {
    try {
        execSync("tsc --emitDeclarationOnly", { stdio: "inherit" });
    } catch (error) {
        console.error("Error generating type declarations:", error);
        process.exit(1);
    }
}

generateTypes();
(async () => {
    const files = await glob(["types/**/*.ts"], { ignore: ["**/*.d.ts"] });

    const entryPoints = files.map(file => ({
        in: file,
        out: file.replace(/^types\//, "").replace(/\.ts$/, ""),
    }));

    const buildOptions: BuildOptions = {
        bundle: false,
        minify: true,
        sourcemap: true,
        logLevel: "error",
        globalName: "CosetContracts",
        entryPoints,
        plugins: [
            esbuildPluginTsc({
                force: true,
            }),
            copy({
                resolveFrom: "cwd",
                assets: {
                    from: ["./types/ethers-contracts/hardhat.d.ts"],
                    to: ["./dist/hardhat.d.ts"],
                },
                watch: true,
            }),
        ],
    };

    await build(
        Object.assign(buildOptions, {
            format: "esm",
            platform: "browser",
            outdir: "dist/esm",
        }) as BuildOptions
    ).catch(() => process.exit(1));

    await build(
        Object.assign(buildOptions, {
            format: "cjs",
            platform: "node",
            outdir: "dist/cjs",
        }) as BuildOptions
    ).catch(() => process.exit(1));
})();
