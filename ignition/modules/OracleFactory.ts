import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("OracleFactoryModule", m => {
    const oracleFactory = m.contract("OracleFactory", [process.env.DEVELOPER_1!]);
    return { oracleFactory };
});
