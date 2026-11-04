# NoRush documentation

## Manuals

| Manual | For | Language |
| --- | --- | --- |
| [User guide](user-guide.md) | Operators, supervisors and admins using the console: every screen, roles, alerts, forecasts | English |
| [norush-edge](../edge/README.md) | Connecting gauges at the pad: install, commissioning, troubleshooting, register profiles | English |
| [Production install](production-install.md) | Running the server for real: environment, migrations, first admin, HTTPS, backups | English |
| [Backend](../backend/README.md) | API modules, scripts and configuration | English |
| [Demo walkthrough](../DEMO.md) | A five-minute demo with simulated gauges | English ([Portuguese](../DEMO.pt-BR.md)) |

The REST API is documented with OpenAPI at `/api/docs` on any running server.

## Reference

- [Hardware integration contract](hardware-integration.md): device identity, credentials, MQTT topics and HTTP payload rules, for anyone writing their own device or gateway client. Also in [Portuguese](integracao-hardware.md).
- [Validation log](VALIDATION.md): what was tested, when, and what was not. Raw outputs are in [validation/](validation/). Portuguese.

## Planning and research

Working notes in Portuguese.

- [Development plan](plano-d-desenvolvimento.md): public deploy, interface bench test, integration with a commercial gauge, 30-day pilot.
- [Tank gauging market notes](pesquisa-mercado-medicao-tanques.md): how remote gauging is sold today and where an open, vendor-neutral console fits.
- [US hardware component study](pesquisa-hardware-usa-2026-11.md): microcontrollers, sensing, radio, hazardous-location certification and power.

## Archive: own-hardware R&D (on standby)

Before settling on commercial certified gauges, the project explored its own battery head and floats. That work is paused and kept for reference. It predates the current scope, and its schedules and cost estimates are no longer current. Portuguese.

- [Original hardware plan](plano-projeto-boias-inteligentes.md) and [index](indice-documentacao.md)
- Phases: [prototyping](fases/fase-1-prototipagem.md), [gateway](fases/fase-2-gateway.md), [integration](fases/fase-3-integracao-testes.md), [certification](fases/fase-4-certificacoes-producao.md)
- Components: [oil float](componentes/boia-a-oleo.md), [interface float](componentes/boia-b-interface.md), [gateway](componentes/gateway-roteador-privado.md)
- [Firmware prototypes](../firmware/README.md): Ada/SPARK and C, run only on a host simulator.
