import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("OracleFactoryModule", m => {
    const oracleFactory = m.contract("OracleFactory");
    return { oracleFactory };
});
