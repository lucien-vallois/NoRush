# norush-edge — connect tank gauges to NoRush

`norush-edge` runs on a small computer at the pad. It reads each tank gauge from the gauge vendor's Modbus gateway and sends level and oil/water interface to your NoRush server with that gauge's device credential.

```
 tank gauges ──radio──> vendor gateway ──Modbus RTU/TCP──> norush-edge ──HTTPS──> NoRush server
 (on the tanks)          (on the pad)        (pad network)    (PC at the pad)          (cloud or office)
```

Modbus never leaves the pad network: only HTTPS goes out, and only the adapter talks to the gateway.

> **Status.** The built-in profile was transcribed from the vendor's public interface manual. It was tested against that register layout over real Modbus TCP, and end to end against a NoRush server in production mode. **It has not yet been run against a live gateway.** Run `check` (below) on the first install, and report what you see.
>
> NoRush is not affiliated with any gauge manufacturer. Product names are used only to say which register map a profile follows.

## Supported equipment

| Profile | Equipment | Source |
| --- | --- | --- |
| `signalfire-sentinel-float-stick` | SignalFire Sentinel Float Stick (Sentinel-FS-3BIS, 1 or 2 floats), read through a SignalFire Buffered Modbus Gateway | Interface Manual "Tank Level Float Stick System", Rev 1.1, pages 9–10 |

Other gauges with a Modbus gateway can be added with a profile file: see [Writing a profile](#writing-a-profile).

## What you need

- **The gauge vendor's gateway** on the pad. The gauges talk only to it, by radio.
- **A computer at the pad**: a small Windows or Linux PC, or a Raspberry Pi 4, on the same network as the gateway (Modbus TCP), or wired to it (RS-485).
  - For RS-485: a USB–RS-485 adapter.
  - It needs **Node.js 20 or newer** and internet access to reach the NoRush server.
- **A NoRush server** reachable over HTTPS, with `IOT_AUTH_MODE=device` (or `hybrid`).
  - In `shared` mode the server ignores device credentials.
- **For each gauge:**
  - the tank registered in NoRush;
  - the gauge registered on that tank;
  - its device credential (`nrk_…`), which NoRush shows **once** when you register the gauge.

## Install

### 1. Register tanks and gauges in NoRush

1. **Tanks → New tank:** enter dimensions, alarm limits and, if you have it, the gauge chart (strapping table).
2. **Sensors → Register gauge:**
   - pick the tank;
   - type the gauge serial or tag as the Device ID;
   - copy the credential shown. If you lose it, open the gauge and use **Issue new credential**.

### 2. Set up the gauges and the gateway (vendor tool)

These settings are made in the vendor's configuration software (SignalFire Toolkit), **in a safe area**:

- **Slave ID:** give each gauge a **different** one. Nodes ship as ID 1, and the gateway keeps only one data set per ID. IDs 241–255 are reserved for gateways.
- **Sentinel type:** set it to **Float Stick**.
- **Check-in interval:** 1–5 minutes.
- **Calibration:** after installing the gauge in the tank, open **Float Stick Calibration** and enter the level you gauged by hand. The offset applies to both floats.
- **Gateway connection:**
  - RS-485 port: Modbus RTU, default 9600-8N1;
  - Ethernet interface module: Modbus TCP on port 502 (10002 is the Toolkit port).

### 3. Install the adapter

On the pad computer, with this repository copied there:

```bash
npm ci --workspace=edge --omit=dev
```

Or copy only the `edge/` folder and run `npm ci --omit=dev` inside it.

### 4. Write the configuration

Copy `edge.config.example.json` to `edge.config.json` and edit it:

```json
{
  "norush": { "url": "https://norush.example.com" },
  "gateway": { "type": "tcp", "host": "192.168.1.50", "port": 502 },
  "pollIntervalSeconds": 60,
  "gauges": [
    { "sensorId": "FS-24117", "unitId": 11, "tokenFile": "tokens/FS-24117.token", "floats": 2 }
  ]
}
```

Put each credential in its own file (`tokens/FS-24117.token`) or in an environment variable (`"tokenEnv": "NORUSH_TOKEN_FS_24117"`). Do not leave credentials in the main file if other people can read it.

#### Configuration reference

| Field | Default | Meaning |
| --- | --- | --- |
| `norush.url` | — | NoRush server. Must be `https://`; plain `http` is accepted only for `localhost`. |
| `norush.timeoutMs` | 10000 | Request timeout. |
| `gateway.type` | — | `tcp`, `rtu` (serial RS-485), or `rtu-over-tcp` (serial-to-Ethernet converter in transparent mode). |
| `gateway.host`, `gateway.port` | port 502 | For `tcp` and `rtu-over-tcp`. |
| `gateway.path` | — | For `rtu`: `COM3` on Windows, `/dev/ttyUSB0` on Linux. |
| `gateway.baudRate`, `parity`, `dataBits`, `stopBits` | 9600, `none`, 8, 1 | For `rtu`. |
| `gateway.timeoutMs` | 5000 | Modbus response timeout. |
| `pollIntervalSeconds` | 60 | How often each gauge is read at the gateway (minimum 5). |
| `heartbeatSeconds` | = poll | Keep-alive to NoRush while the gauge is alive but has no new reading. |
| `forceReadingSeconds` | 600 | Send a reading at least this often, even if nothing changed. |
| `buffer.path`, `buffer.maxEntries` | `norush-edge-buffer.jsonl`, 20000 | Readings kept on disk while the server is unreachable. |
| `gauges[].sensorId` | — | Device ID registered in NoRush. |
| `gauges[].unitId` | — | Slave ID of the gauge at the gateway (1–247). |
| `gauges[].token` / `tokenEnv` / `tokenFile` | — | The gauge's device credential. |
| `gauges[].profile` | `signalfire-sentinel-float-stick` | Built-in profile id, or path to a profile file. |
| `gauges[].floats` | 2 | 1 sends level only; 2 also sends the oil/water interface. |
| `gauges[].wordOrder` | `auto` | Byte order of 32-bit values (`ABCD`, `CDAB`, `BADC`, `DCBA`). `auto` detects it from a register with a known range. |
| `gauges[].battery` | none | `{ "emptyMv": …, "fullMv": … }` to turn battery millivolts into %. Without it, NoRush gets the voltage but no %. |

### 5. Commission: check every gauge before leaving the pad

```bash
node edge/src/cli.js check --config edge.config.json
```

For each gauge, `check` prints:
- the decoded registers (span, product and interface level in inches, feet and meters, temperature, battery, signal, minutes until the gateway times the node out, device type);
- the reading it would send.

Compare the product level with your hand gauge. When it matches, send one reading:

```bash
node edge/src/cli.js check --send --config edge.config.json
```

The reading appears in NoRush under the tank. If something looks wrong, dump the raw registers:

```bash
node edge/src/cli.js read --config edge.config.json --unit 11 --register 41001 --count 18
```

This shows each register in hex, as 16-bit integers, and as 32-bit floats in both word orders.

### 6. Run it as a service

```bash
node edge/src/cli.js run --config edge.config.json
```

**Linux (systemd)** — `/etc/systemd/system/norush-edge.service`:

```ini
[Unit]
Description=NoRush edge adapter
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/norush
ExecStart=/usr/bin/node edge/src/cli.js run --config /opt/norush/edge.config.json
Restart=always
RestartSec=10
User=norush

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl enable --now norush-edge
```

**Windows:** create a Task Scheduler task "At startup" running `node.exe edge\src\cli.js run --config C:\norush\edge.config.json`, with "Restart on failure" enabled. A service wrapper such as NSSM also works.

## How it behaves

- **One reading per check-in.** A buffered gateway keeps returning the last check-in until the next one. The adapter sends a reading when:
  - the values change;
  - the gateway's "minutes until timeout" counter resets (a new check-in);
  - or `forceReadingSeconds` have passed.

  Between check-ins it sends a heartbeat, so NoRush shows the gauge as online without duplicate readings.
- **Stale and failed gauges are not sent.**
  - If the gateway timed the node out (counter at 0), or answers with a Modbus exception, the adapter logs it and sends nothing. NoRush then shows the gauge as offline.
  - If the stick reports an error (`999.9999` and a communication status), it logs the cause from the manual and sends nothing.
  - SignalFire readings require communication status, Slave ID readback, timeout and device type. An unavailable optional status block therefore rejects the reading. A missing, non-finite or negative interface is also rejected on a dual-float gauge.
- **Wrong gauge protection.** The device-type register must say Float Stick (52), and the Slave ID readback must match `unitId`. Otherwise the adapter refuses to read that Slave ID as a tank level.
- **Internet down.** Readings go to the buffer file with their original time and a stable UUID `messageId`, and are delivered in order when the server is back. The same ID is used on every retry. The buffer survives a restart; legacy entries without an ID receive one and are rewritten before their first delivery attempt.
- **Temporary failures are retried.** Network errors, timeouts, HTTP 408, 429 and 5xx, and malformed 2xx responses remain buffered for readings and reported for retry on heartbeats.
- **Explicit refusals are not retried.** For example a revoked credential, a level above the tank height, `{ "processed": false }`, or `{ "received": false }`. The adapter logs the server's reason.

### What reaches NoRush

| Gauge value | NoRush field |
| --- | --- |
| Product level (in) | `level` (m) |
| Interface level (in) | `oilWaterInterface.interfaceLevel` and `waterLevel` (m) |
| Product − interface | `oilWaterInterface.oilLevel` (m) |
| Temperature 1 (°C) | `metadata.temperature` |
| Signal of last packet | `metadata.signalStrength`, only when the value looks like dBm |
| Battery (mV) | `metadata.rawData.batteryMv`; `batteryLevel` % only with `battery` configured |
| Every decoded register | `metadata.rawData` (for diagnosis) |

## Troubleshooting

| Log message | Likely cause | What to do |
| --- | --- | --- |
| `Timed out` | Wrong IP or port, cable, serial settings, or another master on the RS-485 bus | Check `gateway` settings and wiring. Only one Modbus master per RS-485 port. |
| `Modbus illegal data address` | The node has not checked in yet, timed out, or the Slave ID is wrong | Press the Scan/Check-in button on the node and check its Slave ID in the vendor tool. |
| `wrongDevice: deviceType is …` | That Slave ID belongs to another kind of node | Fix `unitId`. |
| `wordOrderUnknown` | The span register does not look like a stick length in either word order | Run `read` on the span register and set `wordOrder`. |
| `sensorError: no data received from the float stick` (or partial data, checksum, internal error) | Node ↔ stick wiring or the stick itself | Check the Red/White/Black terminals on the interface board, in a safe area. |
| `stale: gateway timed this node out` | The node stopped checking in (battery, radio) | Check the node's battery and signal. |
| `reading refused by server (… invalidDeviceCredential)` | Wrong or revoked credential | Issue a new credential in NoRush and update the token file. |
| `reading refused … (invalidIngestCredential)` | The server is in `IOT_AUTH_MODE=shared` | Set `IOT_AUTH_MODE=device` (or `hybrid`) on the server. |
| `server unreachable … buffering` | No internet, or the server is down | Nothing to do; it delivers later. Watch the buffer size if the outage is long. |

## Writing a profile

A profile is a JSON file that describes where a gateway keeps one gauge's values. See [`profiles/signalfire-sentinel-float-stick.json`](profiles/signalfire-sentinel-float-stick.json).

| Key | Meaning |
| --- | --- |
| `function` | `holding` (function 03, registers 4xxxx) or `input` (function 04, registers 3xxxx). |
| `blocks` | Ranges read in one request each: `{ "address": <0-based offset>, "count": <1-125>, "optional": <bool> }`. A rejected optional block is skipped. |
| `values` | Named values: `{ "address": <offset>, "type": "float32" \| "int32" \| "uint32" \| "int16" \| "uint16", "unit": "in" \| "ft" \| "m" \| "cm" \| "mm" \| "degC" \| "degF", "scale": <factor>, "offset": <add> }`. Register 41003 is offset 1002. |
| `map` | Which value is `level`, `interface`, `temperature`, `batteryMv`, `signal`, `minutesToTimeout`, `commStatus`. |
| `requiredValues` | Value names that must be present, including values in optional blocks. Omit it or use `[]` for a permissive generic profile. SignalFire requires `commStatus`, `slaveIdReadback`, `minutesToTimeout` and `deviceType`. |
| `expect` | Values that must be present and match, to catch the wrong Slave ID. Example: `{ "deviceType": 52 }`. |
| `errorValue` | The number the device puts in every reading when it fails. |
| `commStatusCodes` | Text for each non-zero status. |
| `wordOrderProbe` | A value with a known range, used to detect the 32-bit word order. |

Point a gauge to your file with `"profile": "profiles/my-gauge.json"`. Run `check` against real equipment before trusting it, and send the profile as a contribution with the manual and revision it came from.

## Development

```bash
npm test --workspace=edge
```

The integration test starts a Modbus TCP server inside the test, with the manual's register layout, only to exercise the real client.
