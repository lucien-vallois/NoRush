import ModbusRTU from "modbus-serial";

/**
 * Conexão com o gateway. Tipos:
 *   tcp         Modbus TCP (ex.: gateway com módulo Ethernet, porta 502)
 *   rtu         Modbus RTU em RS-485 pela porta serial (COM3, /dev/ttyUSB0)
 *   rtu-over-tcp  RTU encapsulado em TCP (conversor serial-Ethernet em modo transparente)
 * Um mestre por barramento: as leituras são feitas uma de cada vez.
 */
export class GatewayConnection {
  constructor(cfg, log = () => {}) {
    this.cfg = cfg;
    this.log = log;
    this.client = null;
    this.queue = Promise.resolve();
  }

  describe() {
    const c = this.cfg;
    return c.type === "rtu"
      ? `RTU ${c.path} ${c.baudRate ?? 9600}-${c.dataBits ?? 8}${(c.parity ?? "none")[0].toUpperCase()}${c.stopBits ?? 1}`
      : `${c.type === "tcp" ? "TCP" : "RTU-over-TCP"} ${c.host}:${c.port ?? 502}`;
  }

  async connect() {
    if (this.client?.isOpen) return;
    const c = this.cfg;
    const client = new ModbusRTU();
    if (c.type === "tcp") {
      await client.connectTCP(c.host, { port: c.port ?? 502 });
    } else if (c.type === "rtu-over-tcp") {
      await client.connectTcpRTUBuffered(c.host, { port: c.port ?? 502 });
    } else if (c.type === "rtu") {
      await client.connectRTUBuffered(c.path, {
        baudRate: c.baudRate ?? 9600,
        dataBits: c.dataBits ?? 8,
        parity: c.parity ?? "none",
        stopBits: c.stopBits ?? 1,
      });
    } else {
      throw new Error(`gateway.type ${c.type} is not supported`);
    }
    client.setTimeout(c.timeoutMs ?? 5000);
    this.client = client;
    this.log("info", `connected to gateway (${this.describe()})`);
  }

  async close() {
    const client = this.client;
    this.client = null;
    if (client?.isOpen) await new Promise((resolve) => client.close(() => resolve()));
  }

  /**
   * Lê os blocos de um perfil para um Slave ID. Retorna Map endereço → valor.
   * Bloco opcional recusado pelo gateway (exceção Modbus) fica de fora;
   * bloco obrigatório recusado vira erro.
   */
  readBlocks(unitId, profile) {
    const run = async () => {
      await this.connect();
      const registers = new Map();
      for (const block of profile.blocks) {
        try {
          this.client.setID(unitId);
          const res =
            profile.function === "input"
              ? await this.client.readInputRegisters(block.address, block.count)
              : await this.client.readHoldingRegisters(block.address, block.count);
          res.data.forEach((v, i) => registers.set(block.address + i, v));
        } catch (err) {
          const modbusException = err?.modbusCode != null;
          if (!modbusException) {
            // conexão caiu ou timeout: fecha para reconectar na próxima
            await this.close();
          }
          if (block.optional && modbusException) continue;
          const e = new Error(describeError(err, unitId, block));
          e.modbusException = modbusException;
          throw e;
        }
      }
      return registers;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  /** Leitura crua para comissionamento (comando `read`). */
  readRaw(unitId, fn, address, count) {
    const run = async () => {
      await this.connect();
      this.client.setID(unitId);
      const res =
        fn === "input"
          ? await this.client.readInputRegisters(address, count)
          : await this.client.readHoldingRegisters(address, count);
      return res.data;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }
}

const EXCEPTIONS = {
  1: "illegal function",
  2: "illegal data address",
  3: "illegal data value",
  4: "slave device failure",
  6: "slave device busy",
  10: "gateway path unavailable",
  11: "gateway target device failed to respond",
};

function describeError(err, unitId, block) {
  const where = `unit ${unitId}, registers ${block.address}-${block.address + block.count - 1}`;
  if (err?.modbusCode != null) {
    const what = EXCEPTIONS[err.modbusCode] ?? `exception ${err.modbusCode}`;
    return `${where}: Modbus ${what} (on a buffered gateway this usually means the node has not checked in or has timed out)`;
  }
  return `${where}: ${err?.message ?? err}`;
}
