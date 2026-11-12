# Demo hospedada no Railway

Como publicar uma demo navegável do NoRush: console, API, PostgreSQL e um
worker que mantém as hastes simuladas enviando leituras. Quem abre o link entra
com as contas de demonstração e navega por tanques, hastes, leituras, alertas e
o boletim de medição com dados simulados ao vivo.

[English](deploy-railway.md)

> Este é um deploy de **demonstração**: hastes simuladas, contas com senhas
> públicas e sem broker MQTT. Para uma instalação real, veja
> [Production install](production-install.md).

## Serviços

| Serviço | Papel | URL pública |
| --- | --- | --- |
| `api` | API NestJS e Socket.IO | sim |
| `console` | Console React, build do Vite servido por `vite preview` | sim |
| `simulator` | Worker sem porta: envia leituras simuladas à API até ser parado | não |
| `Postgres` | Plugin PostgreSQL do Railway | não (rede privada) |

O `norush-edge` **não** sobe no Railway: ele roda num PC pequeno no pad, ao lado
das hastes, com configuração própria. Se o Railway criou um serviço para o
workspace `edge`, apague-o (ele entra em crash loop com
`config file not found: /app/edge/edge.config.json`).

Os três serviços da aplicação fazem build a partir da **raiz do repositório**,
para o `npm ci` instalar pelo lockfile único e todo build usar as mesmas
versões. Deixe *Root Directory* vazio e use os comandos abaixo.

## 1. Banco de dados

Adicione o plugin **PostgreSQL**. Ele expõe `DATABASE_URL` (e as variáveis
`PG*`), que a API usa quando `DB_*` não está definido. Em produção a API aplica
as migrations ao iniciar.

O PostgreSQL do Railway não tem TimescaleDB. A API então cria views simples com
as mesmas colunas dos agregados de 5 minutos e 1 hora: gráficos de histórico e
previsões funcionam em escala de demo, sem compressão nem retenção. O log de
inicialização avisa isso uma vez; o aviso é esperado.

## 2. `api`

| Configuração | Valor |
| --- | --- |
| Build command | `npm run build --workspace=backend` |
| Start command | `npm run start --workspace=backend` |
| Healthcheck path | `/health` |

| Variável | Valor | Observação |
| --- | --- | --- |
| `NODE_ENV` | `production` | Aplica migrations, exige segredos reais, desliga as rotas `/iot/test/*` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Referência ao plugin |
| `JWT_SECRET` | 48+ caracteres aleatórios | Obrigatório: `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | outros 48+ caracteres aleatórios | Obrigatório, diferente do `JWT_SECRET` |
| `IOT_INGEST_KEY` | aleatório | Chave de ingestão compartilhada, também usada pelo simulador |
| `IOT_AUTH_MODE` | `shared` | |
| `CORS_ORIGIN` | `https://<console>.up.railway.app` | Separe por vírgula se houver mais de uma |
| `DEMO_AUTO_SEED` | `true` | Cria tanques, hastes e as contas de demo na primeira subida |
| `DEMO_READ_ONLY` | `true` | Visitantes compartilham contas: recusa alterações de cadastro (veja abaixo) |
| `MQTT_ENABLED` | `false` | Sem broker neste deploy; o health mostra MQTT como "disabled" |
| `RABBITMQ_ENABLED` | `false` | Sem broker; as leituras são gravadas do mesmo jeito |
| `PUPPETEER_SKIP_DOWNLOAD` | `true` | Evita baixar um Chromium que a demo não usa |

Gere um domínio público em *Settings → Networking*. A API escuta na `PORT` do
Railway e, no Railway, confia automaticamente em um salto de proxy, então o rate
limit enxerga o IP de cada visitante.

### Modo somente leitura

Com `DEMO_READ_ONLY=true` a API recusa toda escrita (403, mensagem traduzida),
exceto entrar e sair, renovar token, ingestão de dispositivos (o simulador
continua funcionando) e reconhecer ou resolver alertas. O visitante abre todos
os formulários, mas ninguém apaga tanques, revoga credenciais de hastes ou cria
usuários para o próximo visitante. O console mostra um aviso explicando isso.

Sair encerra só a sessão do próprio visitante: quem compartilha uma conta de
demo não derruba os outros.

## 3. `console`

| Configuração | Valor |
| --- | --- |
| Build command | `npm run build --workspace=frontend` |
| Start command | `npm run start --workspace=frontend` |

| Variável | Valor |
| --- | --- |
| `VITE_API_URL` | `https://<api>.up.railway.app` |
| `VITE_WS_URL` | `https://<api>.up.railway.app` |
| `PREVIEW_ALLOWED_HOSTS` | só para domínio próprio, ex.: `demo.example.com` |

Valores `VITE_*` são compilados no bundle: mudou, faça redeploy. Eles são
públicos, então nunca coloque segredos ali. O `vite preview` só responde a hosts
permitidos; `*.up.railway.app` já é permitido.

O repositório também tem imagens de produção (`backend/Dockerfile` e
`frontend/Dockerfile` com nginx), publicadas no GHCR a cada release, se preferir
fazer deploy de containers.

## 4. `simulator`

| Configuração | Valor |
| --- | --- |
| Build command | *(nenhum)* |
| Start command | `node backend/test/iot-simulation.js http` |

| Variável | Valor |
| --- | --- |
| `HTTP_URL` | `https://<api>.up.railway.app` |
| `IOT_INGEST_KEY` | o mesmo valor da API |
| `SIM_DURATION` | `0` (roda até ser parado) |
| `SIM_INTERVAL` | `5000` |
| `SIM_SPEED` | `60` |
| `PUPPETEER_SKIP_DOWNLOAD` | `true` |

Sem rede pública: o worker só faz chamadas de saída.

## 5. Dados de demonstração

`DEMO_AUTO_SEED=true` cria seis tanques (FK-01 a FK-06), uma haste de duas
boias por tanque e duas contas, na primeira subida da API com o banco vazio:

- `operador@flowback.com` / `operador123` (operador)
- `admin@flowback.com` / `admin123` (admin)

Essas senhas são públicas. Use-as só com `DEMO_READ_ONLY=true` e nunca semeie
uma instalação real.

Opcional, num shell do serviço `api` (`railway ssh`):

```bash
# 14 dias de histórico, para gráficos e boletim cheios desde o primeiro dia
DAYS=14 node backend/dist/scripts/backfill.js

# apagar e semear de novo
FORCE_SEED=1 npm run seed:prod --workspace=backend
```

## 6. Antes de divulgar o link

1. `https://<api>.up.railway.app/health` responde `"status": "ok"` com MQTT `disabled`.
2. O console abre no login; *Fill demo credentials* entra.
3. O dashboard mostra os seis tanques e o gráfico de 24 h começa a se mover.
4. Salvar um tanque mostra a mensagem de somente leitura; reconhecer um alerta funciona.
5. O console do navegador não mostra erros de CORS.
6. Teste numa janela anônima e depois adicione uma seção *Live demo* com o URL
   ao README.

## Problemas comuns

| Sintoma | Causa |
| --- | --- |
| `JWT_SECRET must contain a unique secret of at least 32 characters` | Segredos ausentes, iguais entre si ou ainda com placeholder |
| `config file not found: /app/edge/edge.config.json` | Há um serviço rodando o workspace `edge`; apague-o |
| `Blocked request. This host is not allowed` no console | Domínio próprio fora de `PREVIEW_ALLOWED_HOSTS` |
| Erro de CORS no navegador | `CORS_ORIGIN` da API não inclui o URL do console |
| Gráficos vazios | Simulador parado, ou `IOT_INGEST_KEY` diferente da API |
| Mudou `VITE_API_URL` e nada mudou | Variável de build: faça redeploy do console |
| `nest: not found` ou `vite: not found` no build | As devDependencies foram puladas na instalação; defina `NPM_CONFIG_PRODUCTION=false` nesse serviço |
| 403 ao salvar | Esperado com `DEMO_READ_ONLY=true` |
| 429 Too Many Requests | 100 requisições por minuto por IP (10 logins por minuto) |
