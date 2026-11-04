# Plano D — Desenvolvimento: medição remota de nível e interface

> **Decisão de escopo (2026-11-04).** O NoRush mede **nível total e interface óleo/água** à distância. Assim o operador não precisa subir no tanque, abrir a escotilha (thief hatch) e descer o stick com pasta reveladora de água para saber onde termina o óleo e começa a água. **Fora do escopo:**
> - desligamento automático;
> - automação de separador;
> - intertravamento de nível alto;
> - detecção de gás.
>
> Isso tudo exige equipamento em cada conexão de tanque e no próprio separador. Custa caro e não resolve o problema do dia a dia.

## O padrão de hardware

O equipamento é uma **haste magnetostritiva comercial com duas boias** e uma **cabeça sem fio a bateria** montada no topo do tanque. Há mais de um fabricante no mercado, todos certificados para **Class I, Division 1 (intrinsecamente seguro)**.

- A **boia de produto** flutua na superfície e dá o nível total.
- A **boia de interface** é mais densa que o óleo e mais leve que a água, e fica na interface. Com isso se obtém a espessura da água e a do óleo.
- Uma única haste entrega as duas medidas, além da temperatura.

O NoRush é a **camada de software** sobre esse equipamento:
- recebe as leituras;
- mostra o console por pad e por tanque;
- guarda o histórico em barris e pés;
- prevê quando o tanque transborda;
- emite alertas e relatórios.

**Por que não outro sensor:**

| Sensor | Problema |
| --- | --- |
| Radar no topo | Mede bem o nível total através do vapor, mas **não enxerga a interface óleo/água**. |
| Ultrassom | Erra no vapor de hidrocarboneto: a velocidade do som muda com o gás. |
| Haste de duas boias | É o que o campo já usa e o que o operador já sabe ler. |

**Área classificada:** a cabeça fica sobre o bocal, dentro da área classificada. Por isso **só entra equipamento certificado**. O NoRush não reivindica nenhuma certificação, e o hardware certificado é de terceiros.

---

## Parte 1 — O software fala "haste de duas boias" ✅

**Feito em 2026-11-04:**
- Tipo de sensor `magnetostrictive`, que passa a ser o padrão do provisionamento em `/api/devices`.
- Seed e simulador com **um dispositivo por tanque**, enviando nível e interface juntos, em vez das antigas "Boia A" e "Boia B".
- Validador corrigido para aceitar tanques com **mais água que óleo**, o caso normal em flowback. Antes ele rejeitava qualquer leitura com a interface acima da espessura do óleo.
- Previsão de transbordo escolhe o sensor de nível do tanque **pela capacidade**, com a haste em primeiro, em vez de exigir o tipo `ultrasonic`.
- O histórico gerado pelo backfill segue o mesmo modelo.

---

## Parte 2 — Deploy público do console (demonstração)

**Objetivo:** um link que qualquer pessoa abre e vê o console funcionando com dados simulados.

1. **Servidor:** VPS pequeno (~US$ 6/mês) e um domínio, com o `docker-compose` existente.
2. **HTTPS:** Caddy ou nginx com Let's Encrypt. Abrir só a porta 443; a 8883 com TLS só quando houver um dispositivo real.
3. **Pré-requisito técnico:** o backend só cria as tabelas sozinho fora de `NODE_ENV=production` (`synchronize`), e o repositório **não tem migrations**. Antes de subir em modo produção é preciso:
   - gerar a migration inicial do TypeORM;
   - incluir os comandos do TimescaleDB, que hoje rodam no boot.
4. **Dados da demo:** o simulador roda continuamente no servidor, em intervalos longos, e o histórico vem do `backfill`.
5. **Acesso:**
   - conta de demonstração **somente leitura**: hoje os papéis são `admin`, `operator` e `maintenance`, então o papel de leitura ainda precisa ser criado, ou a demo precisa ser reiniciada periodicamente;
   - segredos gerados no servidor;
   - `IOT_AUTH_MODE=device`.
6. **Backup:** `pg_dump` diário.

**Entregável:** URL pública com o console e link para o repositório. **Custo:** ~US$ 7/mês.

---

## Parte 3 — Bancada de interface (aprendizado, opcional)

**Objetivo:** ver uma boia de interface de verdade separar água de óleo e chegar ao console, sem risco e sem área classificada.

| Item | Observação |
| --- | --- |
| Tubo transparente de PVC ou acrílico, 1–1,5 m, com tampa no fundo | Fica de pé e cabe no quintal. |
| Água + óleo mineral | O óleo fica por cima; dá para ver a interface. |
| Haste magnetostritiva industrial **sem certificação Ex**, duas boias, saída Modbus RTU ou 4–20 mA | Cotar antes de comprar. A versão sem Ex é bem mais barata que a de campo. |
| Conversor USB–RS-485 ou ESP32 com transceptor RS-485 | Lê a sonda e publica pelo contrato MQTT/HTTP do NoRush. |

**Saber:** Modbus RTU básico (endereço, registradores, escala) e o [contrato de integração](integracao-hardware.md): provisionamento, credencial `nrk_...` e heartbeat.

**Entregável:** nível e interface medidos pela haste batendo com a trena e com o método atual (stick e pasta reveladora), aparecendo ao vivo no console.

---

## Parte 4 — Integração com a cabeça comercial

**Objetivo:** ler o equipamento certificado e entregar as leituras ao NoRush pelo contrato existente.

**Feito em 2026-11-04 — [`norush-edge`](../edge/README.md):**
- adaptador que roda no pad e lê o gateway por Modbus TCP, RTU (RS-485) ou RTU sobre TCP;
- envia por HTTPS com a credencial de cada haste e guarda em disco quando a internet cai;
- perfil do Float Stick transcrito do manual de interface do fabricante (Rev 1.1, págs. 9–10);
- detecção da ordem das palavras dos floats, sentinela de erro `999.9999`, códigos de status, timeout do gateway e tipo de dispositivo;
- comandos de comissionamento: `check`, `check --send` e `read`.

Testado contra o layout de registradores do manual e de ponta a ponta com o servidor em modo produção.

**Falta:** rodar contra um gateway de verdade. Na primeira instalação, comparar o `check` com a medição manual.

**Entregável restante:** leituras de uma unidade real no console.

---

## Parte 5 — Piloto de 30 dias

**Objetivo:** dados reais em tanques reais, com permissão. É o marco que separa projeto de produto.

- **Local:** um pad com 2–4 tanques, com autorização por escrito do operador do sítio.
- **Comparação:** rotina de medição manual (stick e pasta) feita pela equipe do sítio contra as leituras remotas.
- **Métricas definidas antes de começar:**
  - leituras por dia;
  - disponibilidade (uptime) de cada haste;
  - diferença contra a medição manual, em nível e interface;
  - subidas ao tanque evitadas;
  - caminhões de água chamados pela tendência da interface.

**Entregável:** relatório do piloto com dados, fotos, aprendizados e lista de correções.

---

## Software que o plano vai pedir (em ordem)

1. **Água no tanque:** alerta e previsão pela interface ("chamar o caminhão de água em X horas"), assim como já existe para o transbordo.
2. **Relatório diário por tanque:** barris de óleo e de água e variação no turno, no formato do relatório de produção que o operador já entrega.
3. **Alertas por SMS e e-mail** quando o piloto pedir.
4. **Painel de frota:** custo de dados e disponibilidade por haste, a partir de 3 ou mais dispositivos.

---

## R&D em standby — cabeça própria (pesquisa futura)

Fica **pausado** até o piloto provar valor e aparecer uma razão concreta para ter hardware próprio, como custo por unidade ou um recurso que o equipamento comercial não tem.

**O que fica guardado:**
- a pesquisa de sensores, rádios e área classificada ([pesquisa-hardware-usa-2026-11.md](pesquisa-hardware-usa-2026-11.md));
- as especificações das antigas Boias A/B ([componentes/](componentes/));
- o plano por fases ([fases/](fases/));
- o firmware Ada/SPARK e C, testado só no simulador de host ([firmware/](../firmware/)).

**Por que é caro:**
- a cabeça a bateria no topo do tanque precisa de certificação intrinsecamente segura por um laboratório NRTL, com bateria e eletrônica avaliadas juntas;
- isso custa de **US$ 10 mil a mais de US$ 100 mil** e leva de **4 a 9 meses**, antes de fabricar a primeira unidade vendável.
