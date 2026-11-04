# Demonstrar o NoRush em cinco minutos

[English](DEMO.md).

O objetivo é mostrar como uma leitura de sensor se transforma em contexto operacional e em um registro de ocorrência. Todos os dados do roteiro são simulados; nenhum equipamento físico é controlado.

## Preparar uma vez

Na raiz do projeto, com Node.js 22.20+ e Docker Desktop disponíveis:

```powershell
npm ci
npm run setup:demo
npm run infra:up
npm run seed
```

O arquivo `.env` recebe segredos gerados localmente. Um arquivo existente e os tanques existentes são preservados. Variáveis específicas em `backend/.env.local` ou `backend/.env` têm precedência; evite manter configurações antigas conflitantes nesses arquivos.

## Iniciar

Terminal 1:

```powershell
npm run demo
```

Terminal 2, também na raiz:

```powershell
npm run simulate
```

Acesse [localhost:3001](http://localhost:3001), preencha o acesso demonstrativo pelo botão e entre como operador. O simulador padrão roda por **cinco minutos**. Para desenvolvimento com atualização automática do código, use `npm run dev` no lugar de `npm run demo`.

## Percurso

1. **Visão operacional.** Explique os denominadores: tanques ativos/cadastrados e sensores transmitindo/ativos. A capacidade exibida é nominal; não representa inventário medido.
2. **Níveis.** Selecione um tanque e mostre o nível, a ocupação relativa à altura e o limite configurado. A idade da leitura separa dado recente de ausência de telemetria.
3. **Tanques.** Abra o mapa e o painel de detalhe. Compare a leitura com os limites do tanque e o histórico.
4. **Sensores.** Mostre conexão, bateria e situação dos dispositivos. FK-06 está em manutenção; a simulação inclui falha de bateria em FK-04.
5. **Leituras.** Selecione tanque e sensor. Compare intervalos de 5 minutos e 1 hora; um histórico longo só aparece se já tiver sido carregado.
6. **Relatório de medição.** Abra o relatório diário do último dia de medição e depois os turnos dia e noite. Mostre a medição de abertura e fechamento em pés e polegadas, uma carreta detectada como retirada nas observações e a produção = fechamento − abertura + retirado. Baixe o CSV e abra numa planilha.
7. **Central de alertas.** Busque uma ocorrência, filtre o status, reconheça e registre a medida adotada ao resolver. Para exercitar essa escrita com rastreabilidade, use o alerta identificado como teste sintético.
8. **API.** Abra [OpenAPI](http://localhost:3000/api/docs). Explique a validação de entrada, o controle de papéis e a autenticação do canal de eventos.

## Velocidade da simulação

O modelo usa vazões em m³/h, ruído de leitura, bateria e perdas de transmissão. `SIM_SPEED` acelera a evolução física enquanto os timestamps continuam no relógio real. Portanto, os ritmos e ETAs da demonstração acelerada não devem ser apresentados como vazões medidas em campo.

Configuração gerada: `SIM_SPEED=60`, `SIM_INTERVAL=5000`, `SIM_DURATION=300000`.

Para observar o relógio físico sem aceleração:

```powershell
$env:SIM_SPEED = '1'
npm run simulate
Remove-Item Env:SIM_SPEED
```

## Provar o funcionamento

Com a API e a infraestrutura disponíveis, pare o simulador para evitar interferência entre cenários e rode:

```powershell
npm run check
npm run smoke
npm run smoke:telemetry
```

O smoke HTTP cria uma leitura e um alerta sintéticos, reconhece e resolve esse alerta e preserva o registro com o identificador `norush-smoke`. O teste MQTT coleta eventos por aproximadamente 30 segundos; não comprova hardware ou comunicação por rádio.

## Histórico opcional

O carregador de histórico existente insere dados simulados diretamente no banco. É uma operação separada dos testes de ingestão e não comprova recepção por MQTT/HTTP.

```powershell
npm run backfill --workspace=backend
```

O padrão desse script é de 90 dias e pode inserir centenas de milhares de leituras. Não é necessário para o roteiro básico. Inspecione suas opções antes de executá-lo sobre uma base já utilizada.

## Encerrar e recuperar

- Encerre API, frontend e simulador com Ctrl+C nos respectivos terminais.
- `npm run docker:down` encerra os serviços do Compose e preserva volumes.
- Não use remoção de volumes ou `FORCE_SEED=1` para resolver um problema de apresentação: essas opções apagam dados.
- Um painel sem leituras recentes é um estado válido quando o simulador está parado.
- Se o login falhar, confira a API em `/health`, o seed e as configurações do ambiente.
- Se uma porta estiver ocupada, identifique primeiro o processo e o projeto responsável; não encerre processos desconhecidos.
