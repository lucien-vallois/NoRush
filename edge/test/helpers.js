/**
 * Monta os registradores como o gateway SignalFire os expõe para o
 * Float Stick (manual Rev 1.1, pág. 9-10), a partir de valores físicos.
 */
export function encodeFloat32(value, order = "ABCD") {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value);
  const hi = view.getUint16(0);
  const lo = view.getUint16(2);
  const swap = (w) => ((w & 0xff) << 8) | (w >> 8);
  switch (order) {
    case "ABCD":
      return [hi, lo];
    case "CDAB":
      return [lo, hi];
    case "BADC":
      return [swap(hi), swap(lo)];
    case "DCBA":
      return [swap(lo), swap(hi)];
  }
  throw new Error(order);
}

export function floatStickRegisters({
  span = 240,
  product = 120,
  iface = 84,
  temp = 18.5,
  comm = 0,
  order = "ABCD",
  status = true,
  battery = 3590,
  signal = -71,
  minutes = 9,
  deviceType = 52,
  unitId = 11,
} = {}) {
  const regs = new Map();
  const put = (addr, words) => words.forEach((w, i) => regs.set(addr + i, w));
  put(1000, encodeFloat32(span, order));
  put(1002, encodeFloat32(product, order));
  put(1004, encodeFloat32(iface, order));
  for (let k = 0; k < 5; k++) put(1006 + 2 * k, encodeFloat32(temp, order));
  put(1016, encodeFloat32(comm, order));
  if (status) {
    put(9987, [1, 4, 2, 9, 0, 0x5a12, unitId, signal & 0xffff, battery, minutes, 30, deviceType]);
  }
  return regs;
}
