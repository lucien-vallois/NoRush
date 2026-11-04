import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

/**
 * Fila em disco (JSON Lines) para leituras que não chegaram ao servidor —
 * internet do pad cai, servidor reinicia. Cada linha guarda a leitura com o
 * horário original; o reenvio respeita a ordem. Sobrevive a reinício do
 * adaptador. Acima de `maxEntries`, as mais antigas são descartadas (com log).
 */
export class ReadingBuffer {
  constructor(path, { maxEntries = 20000, log = () => {} } = {}) {
    this.path = path;
    this.maxEntries = maxEntries;
    this.log = log;
    this.entries = [];
    if (path && existsSync(path)) {
      const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          this.entries.push(JSON.parse(line));
        } catch {
          // linha truncada por queda de energia: ignora só ela
        }
      }
    }
  }

  get size() {
    return this.entries.length;
  }

  push(entry) {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      const dropped = this.entries.length - this.maxEntries;
      this.entries.splice(0, dropped);
      this.log("warn", `buffer full: dropped ${dropped} oldest reading(s)`);
      this.rewrite();
      return;
    }
    if (this.path) appendFileSync(this.path, JSON.stringify(entry) + "\n");
  }

  /** Remove as `n` primeiras entradas (já entregues ou descartadas). */
  shift(n) {
    if (n <= 0) return;
    this.entries.splice(0, n);
    this.rewrite();
  }

  peek(n) {
    return this.entries.slice(0, n);
  }

  rewrite() {
    if (!this.path) return;
    const tmp = this.path + ".tmp";
    writeFileSync(tmp, this.entries.map((e) => JSON.stringify(e) + "\n").join(""));
    renameSync(tmp, this.path);
  }
}
