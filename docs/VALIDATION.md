# Registro de validação do NoRush

## Execução de 2026-11-04 (4) — relatório de medição (diário e turnos de 12 h)

| Verificação | Resultado observado |
| --- | --- |
| Motor do relatório | **16 testes, PASS**: limites do dia de medição e dos turnos em `America/Chicago`, dia de 25 h e de 23 h nas trocas de horário, retirada de 1 m de água com ruído de 5 mm detectada uma vez e sem retirada falsa de óleo, produção = fechamento − abertura + retirado, haste sem interface, período sem leituras |
| CSV e parâmetros | **9 testes, PASS**: pés e polegadas, bbl e m³, horários no fuso do pad, proteção contra fórmula de planilha, validação de `period`, `date`, `startHour` e `tz` |
| Unidade / total | Backend **102**, frontend **26**, edge **17** testes, PASS; build do backend e do console OK |
| Ponta a ponta (SQL, tela, CSV baixado, impressão) | **Não executado**: o Docker Desktop não subia (WSL travado), então não houve banco nesta rodada |

## Execução de 2026-11-04 (3) — adaptador Modbus e instalação de produção

| Verificação | Resultado observado |
| --- | --- |
| Testes do `norush-edge` | **17, PASS**:<br>- decodificação nas 4 ordens de palavra e detecção pela extensão da haste;<br>- sentinela `999.9999` e códigos 1–4;<br>- timeout do gateway e tipo de dispositivo;<br>- deduplicação por check-in;<br>- buffer em disco e reenvio em ordem;<br>- cliente HTTP contra servidor local;<br>- Modbus TCP real com 2 nós e 1 nó ausente (exceção 2) |
| Produção em banco vazio | Com `NODE_ENV=production`, a API aplicou a migration `InitialSchema` ao iniciar; o TimescaleDB montou hypertable e agregados; `/health` ok; banco sem usuários |
| Primeiro admin | `create-admin` criou o admin; senha curta recusada; `--reset` funcionou |
| Ponta a ponta | Servidor em produção com `IOT_AUTH_MODE=device`; tanque e haste criados pela API; `norush-edge check --send` e `run` contra um servidor Modbus TCP com o layout do manual (floats em CDAB, Slave ID 11):<br>- ordem detectada;<br>- leituras aceitas e gravadas com nível, volume, óleo/água, temperatura e sinal;<br>- heartbeats entre check-ins sem leitura duplicada;<br>- leitura nova quando o nível mudou |
| Gateway de verdade | **Não executado**: sem hardware nesta sessão |

## Execução de 2026-11-04 (2) — telas de cadastro

Mesmo ambiente, outra vez num banco temporário (`norush_verify`) apagado no fim. API na porta 3010 e console na 3011, conferidos no navegador do app com o admin do seed.

| Verificação | Resultado observado |
| --- | --- |
| Unidade / backend | **77 testes, PASS** (inclui regras de cadastro de tanque: dimensões, ordem dos limites, tabela de arqueação) |
| Unidade / frontend | **24 testes, PASS** (inclui conversão ft-in/bbl → m/L e validação do formulário) |
| Cadastro de tanque (imperial) | 20 × 12 ft mostrou **402,9 bbl**; tabela de 5 pontos em ft-in/bbl lida; salvo em métrico (6,096 m; 64.040 L) |
| Erros do backend | Limites fora de ordem → 400 traduzido; código repetido → 409; tabela fora de ordem → 400 |
| Edição de tanque | Abre preenchido em ft; troca de situação salva |
| Cadastro de haste | Credencial `nrk_…` exibida uma vez, com tópico MQTT e endpoint HTTP |
| Credencial em uso | Em `IOT_AUTH_MODE=hybrid`, leitura com a credencial nova **processada**; credencial errada **recusada**. Em `shared` a credencial é ignorada, e a tela agora avisa |
| Nova credencial, revogação, edição | Funcionaram pela tela; a leitura apareceu na tabela de sensores |
| Capturas de tela | **Não feitas**: o painel do navegador estava oculto |

## Execução de 2026-11-04 — haste de duas boias

Ambiente: Windows, Node.js **22.20.0**, PostgreSQL/TimescaleDB, Mosquitto e RabbitMQ locais (Docker). A verificação rodou num **banco separado e temporário** (`norush_verify`), apagado no fim. A base local de demonstração não foi alterada.

Mudança validada: um dispositivo por tanque (`magnetostrictive`, nível + interface), validador de interface aceitando tanque com mais água que óleo e previsão escolhendo o sensor de nível pela capacidade.

| Camada | Resultado observado |
| --- | --- |
| Build nativo | Backend e frontend aprovados (`npm run build`) |
| Unidade / backend | **72 testes, 9 suítes, PASS** — inclui tanque majoritariamente água, interface acima do nível total rejeitada e seleção do sensor da previsão |
| Unidade / frontend | **17 testes, PASS** |
| Seed | 6 tanques, **6 hastes** `magnetostrictive` (FK-06 em manutenção) |
| Simulador HTTP | **93/93 mensagens aceitas** em 40 s, todas com interface (água 60–80%); SENSOR-004 silenciou por bateria, como programado |
| Previsões via API | **5 de 5 tanques ativos** com nível, ritmo e tendência; antes da correção a consulta exigia `ultrasonic` e não retornaria nenhum |
| API / banco (`npm run smoke`) | **19 verificações, PASS** |
| MQTT → WebSocket (`smoke:telemetry`) | **62 leituras, 16 alertas, 5 anomalias, 1 forecast** em ~30 s |
| Navegador (`browser-smoke`) | **Não executado** nesta rodada; as capturas de sensores e leituras em `docs/screenshots/` ainda mostram as antigas Boias A/B |
| Firmware, hardware e campo | **Não executado** — o hardware próprio está em standby (ver [Plano D](plano-d-desenvolvimento.md)) |

Os recibos desta rodada não foram arquivados em `validation/`; os números acima vêm da saída dos comandos nesta sessão.

---

## Execução de 2026-11-01 (histórico)

Data: **2026-11-01 (UTC)**. Ambiente: Windows, Node.js **22.20.0**, navegador Chromium/Chrome isolado para testes e serviços locais de PostgreSQL/TimescaleDB, MQTT e RabbitMQ.

O código desta entrega está no diretório de trabalho. Não houve commit, push, publicação ou execução remota de CI nesta sessão. A revisão inicial já encontrou alterações locais em docs/componentes, docs/fases, índice/plano de engenharia e firmware. Esses arquivos não foram editados nesta entrega. O README foi revisado conservando a identificação do firmware Ada/SPARK + C e a separação em relação ao backend TypeScript.

## Resultado por camada

| Camada | Resultado observado | O que prova |
| --- | --- | --- |
| Build nativo | Backend e frontend aprovados em `npm run check` | Compilação dos workspaces e geração dos assets |
| Unidade / backend | **56 testes, 8 suítes, PASS** | Saúde medida, DTOs, autenticação, segredos, rejeição da ingestão inválida, canal autenticado e regras de previsão |
| Unidade / frontend | **10 testes, PASS** | Lacunas de telemetria, redução de pontos sem falsas lacunas e conversões m/ft e L/bbl |
| API / banco local | **19 verificações, PASS**, 22:05:42 UTC | Login, papéis, refresh, persistência, agregados recentes, entrega por WebSocket e ciclo de alerta |
| MQTT | **124 leituras e 33 eventos de alerta** em uma coleta de aproximadamente 30 s | MQTT → processamento → persistência → WebSocket autenticado, com dados simulados |
| Navegador | **13 verificações, PASS**, 22:18:10 UTC | Login, navegação, sensor, histórico, interface óleo/água, reconhecimento/resolução, paginação com registros diferentes, tema e logout |
| Responsividade | Seis rotas conferidas em **390 × 844**, sem rolagem horizontal da página | Dashboard, tanques, sensores, leituras, alertas e perfil; tabelas mantêm sua própria rolagem |
| Unidades no painel | Referências em **ft/bbl** verificadas no navegador, incluindo 390 px | Formatação aplicada aos dados reais da API local |
| Docker Compose | `docker compose config --quiet`: PASS | Validade da configuração; não comprova build nem execução das novas imagens |
| GitHub Actions | Workflow preparado, **não executado** | Configuração de build/teste e integração local no runner |
| Firmware (Ada/SPARK + C) | **Não registrado** | Os checks descritos em `firmware/README.md` (`firmware\scripts\check.ps1`) não fazem parte deste registro |
| Hardware e campo | **Não executado** | Nenhuma prova de boia física, rádio, certificação ou operação de campo foi produzida |

## Casos de integridade exercitados

- Credenciais incorretas e entradas malformadas retornam erro adequado; operador não acessa o catálogo administrativo de usuários.
- Refresh e acesso têm propósitos separados. Conexões WebSocket anônimas são recusadas.
- Mensagens fora da faixa e sensores em manutenção são rejeitados antes de persistir ou transmitir dados como válidos.
- Uma leitura válida via HTTP foi encontrada no banco e recebida no canal autenticado.
- O agregado de 5 minutos incluiu a leitura recente, sem depender apenas do histórico materializado.
- Dados antigos ou insuficientes suspendem a ETA. Uma aproximação positiva não é arredondada para um limite já ultrapassado.
- O gráfico mostra interrupções reais e não confunde redução de pontos para exibição com perda de telemetria.
- Um alerta sintético foi reconhecido e resolvido com ator e notas preservados; a interface percorreu o mesmo fluxo.
- As respostas inspecionadas não expuseram `passwordHash` nas relações de usuário.

## Recibos

- [Build e testes](validation/quality-check.txt)
- [Smoke da API e banco](validation/api-smoke.txt)
- [Smoke MQTT](validation/mqtt-smoke.txt)
- [Percurso no navegador](validation/browser-review.json)
- [Conferência das unidades e largura](validation/units-review.json)
- [Manifesto de integridade](validation/manifest.json)

Os recibos são da execução local nesta sessão. O manifesto vincula os arquivos por SHA-256; uma cópia desses recibos não constitui execução independente em outro ambiente.

## Dados preservados e efeitos dos testes

Os testes mantiveram a base existente. O smoke acrescenta leituras e alertas sintéticos identificados por `norush-smoke`; o teste visual acrescenta um alerta identificado por `norush-browser-smoke`, reconhecido e resolvido pelo operador demonstrativo. Esses registros permanecem para inspeção.

Os relatórios históricos e a contagem de ocorrências podem incluir dados de demonstrações anteriores. Não foi feita limpeza ou reinicialização dos volumes.

## Limites da conclusão

A última coleta MQTT não recebeu evento `forecast` nem `anomaly`. Ela valida o fluxo de leituras e alertas; não comprova todos os eventos periódicos. As regras de previsão têm cobertura unitária e consulta via API, sem alegação de precisão validada em campo.

Não foram executados build completo das novas imagens Docker, CI remoto, ensaio de carga prolongado, auditoria integral de dependências ou validação de todos os relatórios herdados. A correção adicionada para localização do Chromium no container não equivale a prova de geração de PDF nessa imagem.

O projeto permanece um protótipo demonstrativo, com uma base profissional de software e evidências delimitadas. Não é um sistema industrial qualificado ou certificado.
