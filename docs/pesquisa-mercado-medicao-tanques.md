# Pesquisa: equipamentos de medição de tanque e onde o NoRush pode ser útil

> **Documento de pesquisa interna (2026-11-04).** Cita fabricantes para entender o mercado. O produto continua **sem vínculo com nenhum fabricante**: o README e as telas falam em "haste magnetostritiva de duas boias" de forma genérica. A maior parte das fontes é material de fabricante ou imprensa técnica, então os detalhes precisam ser confirmados nos manuais antes de virar integração.

## 1. Pergunta

Se o hardware fica em aberto (o usuário compra o equipamento certificado que quiser), **o que o NoRush oferece que o usuário ainda não tem?** Para responder, é preciso saber como cada equipamento entrega os dados e que software já vem junto.

## 2. Equipamentos que medem nível e interface

| Fabricante / linha | Sensor | Interface óleo/água | Como os dados saem | Software do fabricante |
| --- | --- | --- | --- | --- |
| **SignalFire** — Sentinel Float Stick | Haste magnetostritiva, 1 ou 2 boias, temperatura. Cabeça sem fio a bateria de lítio ou solar, Class I Div 1 IS, rádio 900 MHz em malha (~800 m) | Sim (2 boias) | Gateway SignalFire → **Modbus RTU ou TCP** (nível do produto, nível da interface, temperatura, status). Gateway PATRIoT (2025) → **MQTT/Sparkplug**. Modem Ranger → SignalFire Cloud | **SignalFire Cloud**: tendências, alarmes por SMS e e-mail. Um revendedor anuncia um plano de dados de 2 anos por US$ 508 (fonte secundária) |
| **OleumTech** | Sensor resistivo: óleo, água e temperatura. Transmissor sem fio | Sim | Gateway (DH1/DH2) → **Modbus**. Versão HART com óleo, água e temperatura como variáveis | Material antigo cita DataHub e LevelMate; não confirmei um serviço de nuvem atual |
| **APG** — MPX | Haste magnetostritiva, opção de 2 boias (total + interface). Versões à prova de explosão Class I Div 1 | Sim | **Modbus RTU (RS-485)** com fio ou 4–20 mA. Sem rádio próprio | Tank Cloud, e mais recentemente gateway Settler → nuvem Explorer |
| **Emerson Rosemount** | Radar de onda guiada (3300/5300) e 3308 sem fio (WirelessHART) | Os de onda guiada medem interface | Gateway WirelessHART → **Modbus/OPC** para SCADA/DCS | Plantweb e TankMaster (nível de refinaria/terminal) |
| **Banner** | Ultrassom sem fio + controlador DXM | **Não** (ultrassom) | DXM → Modbus, ou celular → nuvem | Cloud Data Services: alertas por SMS e e-mail |

**Padrão que aparece:** quase todos os gateways falam **Modbus** (RTU ou TCP), e os mais novos também **MQTT/Sparkplug B**. As nuvens dos fabricantes funcionam bem, mas cada uma só mostra os equipamentos daquela marca.

## 3. Software que o operador já usa

| Tipo | Exemplos | O que faz | Limitação para o nosso caso |
| --- | --- | --- | --- |
| **Nuvem do fabricante** | SignalFire Cloud, Banner CDS, APG Explorer | Tendência e alarme dos equipamentos daquela marca | Uma marca só; frota mista vira várias telas |
| **SCADA** | Ignition (com os módulos MQTT da Cirrus Link), entre outros | Tudo: tags, telas, alarmes, controle | Precisa de integrador; é caro para quem só quer ler tanque |
| **App de pumper** | GreaseBook, iWell Pumper | O pumper **digita** os gauges, testes e paradas e fotografa o run ticket; integra com a contabilidade (OGsys, WolfePak, Bolo) | Entrada manual: alguém ainda mede no tanque |
| **Genérico aberto** | FUXA, Node-RED | Lê Modbus/MQTT e desenha um painel | Não conhece tanque, tabela de arqueação, interface nem rotina de produção |
| **Serviço de monitoramento** | Remote Gauge (satélite), iWell Remote | Monitoramento por assinatura | Fechado, por assinatura |

## 4. Onde o NoRush pode ser útil (hipóteses)

Ninguém da lista é ao mesmo tempo **neutro de marca**, **focado em tanque** e **feito para a rotina do operador**. Quatro hipóteses, da mais forte para a mais fraca:

1. **Um console para frota mista.** Em flowback, o tanque é alugado e chega de qualquer lugar. Um adaptador **Modbus TCP/RTU** com "perfis de registradores" por equipamento cobre a maioria dos gateways. Um assinante **MQTT/Sparkplug B** cobre o PATRIoT e quem já tem Ignition. Os perfis seriam arquivos simples que a comunidade pode contribuir; esse é o ponto do open source.
2. **O gauge vira relatório sozinho.** Hoje o pumper digita os gauges no app ou na planilha. O NoRush já tem nível, interface e tabela de arqueação, então pode gerar o relatório diário por tanque e por turno (barris de óleo, barris de água, variação) e exportar em CSV para o app ou a contabilidade. Isso **não substitui o run ticket**, que é transferência de custódia com o caminhão ou o LACT.
3. **Planejamento de caminhão.** Previsão de quando a água chega no limite ("chamar caminhão de água em X horas") e de quando o óleo enche ("chamar o caminhão de óleo"), além do transbordo que já existe.
4. **Instalação própria, sem licença por tag.** Roda num servidor pequeno ou num PC no pad. Atende a empresa pequena (operadora pequena, empresa de flowback, locadora de tanques) que não tem SCADA nem integrador.

**O que o NoRush não deve tentar ser:** SCADA, controle, nuvem de um fabricante ou hardware próprio (este fica em standby; ver [Plano D](plano-d-desenvolvimento.md)).

## 5. Como validar antes de construir

As hipóteses acima são de escritório. Antes de investir em cada uma:

- **Conversar com 5 a 10 pessoas do campo**: pumpers, supervisores de flowback, quem cuida de produção numa operadora pequena e uma locadora de tanques. Perguntas:
  1. Quantas marcas de medidor existem na mesma locação?
  2. Onde o gauge é anotado hoje (app, planilha, papel)? Quanto tempo leva por turno?
  3. Quem decide quando chamar o caminhão de água ou de óleo, e com base em quê?
  4. Já existe SCADA ou nuvem de fabricante? O que falta nela?
  5. Instalariam um software aberto num PC no pad ou num servidor da empresa?
- **Conseguir o mapa de registradores** do gateway do equipamento escolhido. Vem do manual ou do suporte do fabricante; não achei público para o Float Stick.
- **Teste com equipamento real**, com autorização do dono, antes de escrever "funciona com X".

## 6. Ordem sugerida no software

1. Adaptador **Modbus TCP** com perfil de registradores em arquivo e um simulador de gateway para testar sem hardware.
2. **Relatório diário por tanque** (óleo e água em bbl, por turno) com exportação CSV.
3. **Previsão de água e de óleo** para chamar caminhão.
4. Assinante **MQTT/Sparkplug B**.

## Fontes

- SignalFire Float Stick, saída Modbus: [Automation.com](https://www.automation.com/en-us/products/product04/signalfire-introduces-sentinal-float-stick-system) · [Thomasnet](https://news.thomasnet.com/fullstory/wireless-tank-level-temperature-monitor-suits-hazardous-locations-20059311)
- SignalFire PATRIoT e SignalFire Cloud: [Design World (out/2025)](https://www.designworldonline.com/?p=620002) · plano de dados via revendedor: [reach.dog](https://reach.dog/shop/utilityshopcom/products/sigalfire-cloud)
- SignalFire e MQTT/Sparkplug B com gateway de terceiros: [Automation World](https://www.automationworld.com/products/networks/product/21205462/signalfire-wireless-telemetry-sensor-networktocloud-system)
- OleumTech, sensor resistivo de óleo, água e temperatura: [Fluid Handling Pro](https://fluidhandlingpro.com/news/oleumtech-introduces-4-20ma-hart-level-sensor/) · sistema web com MTS: [Fierce Electronics](https://www.fierceelectronics.com/components/mts-and-oleumtech-develop-web-based-tank-level-monitoring-system)
- APG MPX, duas boias e Modbus RTU: [datasheet MPX-T](https://apgsensors.com/wp-content/uploads/2026/05/9006917b1-mpx-t-datasheet.pdf) · [Tank Cloud](https://apgsensors.com/tank-cloud-introduction/)
- Emerson Rosemount 3308 sem fio: [Control Engineering](https://www.controleng.com/articles/ec-rosemount-3308-wireless-guided-wave-radar-transmitter/) · Modbus nos radares: [Automation.com](https://www.automation.com/en-us/products/product12/emerson-adds-modbus-to-rosemount-radar-level-trans)
- Banner, nível de tanque com Cloud Data Services: [Banner](https://www.bannerengineering.com/be/en/solutions/measurement-and-inspection/tank-level-monitoring.html)
- Ignition e Sparkplug no óleo e gás: [estudo de caso NGL](https://s3.amazonaws.com/files.inductiveautomation.com/s3fs-production/resources/success/CaseStudy-NGLEnergyPartners.pdf) · [ABC Wellsite Automation 2020](https://oilit.com/HTML_Articles/2020_3_16.php)
- Apps de pumper: [GreaseBook](https://www.getapp.com/industries-software/a/greasebook-pumper-app/) · [iWell Pumper](https://apps.apple.com/us/app/iwell-pumper/id737327931)
- SCADA aberto genérico: [FUXA](https://gh.r-mj.com/frangoteam/FUXA)
