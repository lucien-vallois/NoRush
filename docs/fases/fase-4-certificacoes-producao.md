# 🏭 Fase 4: Certificações e Produção - Industrialização

> **Status (2026-11-04): R&D em standby — pesquisa futura.** Este material trata do hardware próprio (cabeça/boias NoRush), pausado até o piloto provar valor. O escopo atual usa uma haste magnetostritiva comercial certificada, com o NoRush como camada de software: ver [Plano D](../plano-d-desenvolvimento.md).

## 🎯 Objetivos da Fase
- Obter certificações ATEX/IECEx essenciais
- Otimizar design para produção em escala
- Desenvolver documentação técnica completa
- Preparar para fabricação e deployment

## 🔧 Atividades Principais

### 1. Certificações ATEX/IECEx

#### Preparação para Certificação ATEX
**Zona de Classificação**: Zone 1 (áreas com presença frequente de gases inflamáveis)

**Requisitos de Segurança**:
- **Proteção contra ignição**: Componentes certificados ATEX
- **Limitação de energia**: Circuitos intrinsecamente seguros
- **Blindagem**: Proteção contra faíscas e arcos elétricos
- **Materiais**: Aprovados para atmosferas explosivas

#### Componentes que Necessitam Certificação
```txt
✅ MCU: STM32L432 / STM32L072 (com runtime Ada `light`, sem heap)
✅ Bateria: módulo LiPo encapsulado (Ex e/Ex d) — NÃO Ex i
✅ Módulo LoRa: SX1262 certificado para Zone 1
✅ Sensor: encodador magnetostrutivo 316L + célula de condutividade
✅ Cabo/tubo-guia: material antiestático, aterramento equipotencial
```

> **Revisão crítica v1.3 — caminho de certificação da bateria.**
> A v1.0 pedia "LiPo com proteção intrínseca". Isso não existe: uma célula
> LiPo entrega dezenas de amperes em curto e não pode ser limitada a
> <100mA/500mW para se qualificar como Ex i. As opções reais são:
>
> 1. **Ex ib com módulo de potência encapsulado** (recomendado) — a célula fica
>    em compartimento selado (Ex e/Ex d) e só a saída limitada entra na
>    atmosfera classificada. Aumenta BOM e peso.
> 2. **Bateria selada homologada para Zone 1** — fornecedores específicos,
>    custo 3-5x o de uma LiPo comum.
> 3. **Reclassificação da área do tanque** (Zone 2) — reduz drasticamente o
>    custo de certificação, se a análise de área permitir.
>
> A opção 1 é a premissa adotada nas specs v1.3. A opção 3 deve ser
> investigada **primeiro** — pode reduzir o escopo de certificação a um terço.

#### Revisão de Orçamento de Certificação
> **Revisão crítica v1.3.** O plano de projeto (docs/indice-documentacao.md)
> estima **R$ 150.000,00 para o projeto inteiro, 6-9 meses**, incluindo
> certificação ATEX/IECEx Zone 1. Isso não é realista: certificar um produto
> novo em Zone 1 custa normalmente entre **R$ 150.000 e R$ 500.000** e leva
> **6-12 meses apenas para a certificação**, somando documentação técnica,
> FMEA, testes em laboratório acreditado e auditoria de processo.
>
> Recomendação: separar o orçamento de certificação como linha própria e
> decidir entre (a) Zone 2 com produto padrão, (b) Zone 1 com consultoria
> ATEX desde a prototipagem, ou (c) parceria com fabricante já certificado.

#### Processo de Certificação
1. **Documentação Técnica**: Especificações completas
2. **Testes em Laboratório**: Avaliação de segurança
3. **Análise de Riscos**: FMEA (Failure Mode and Effects Analysis)
4. **Auditoria de Processo**: Validação de fabricação
5. **Certificado Final**: Marca CE + ATEX/IECEx

### 2. Otimização para Produção

#### Design for Manufacturability (DFM)
- **Simplificação**: Reduzir componentes de 15 para 8
- **Padronização**: Usar componentes off-the-shelf
- **Montagem**: Projetar para soldagem automática
- **Testabilidade**: Pontos de teste acessíveis

#### Otimização de Custos
```txt
Custos Alvo (revisados v1.3):

Variante A — magnetostrutivo (especificada):
- Boia A:  R$ 3.050,00  (sensor 2.400 + eletrônica + mecânica + testes)
- Boia B:  R$   850,00  (barra compartilhada com a Boia A)
- Gateway: R$ 1.200,00
- Kit:     R$ 5.100,00

Variante B — fita magnética + Hall (opção de custo):
- Boia A:  R$   950,00
- Boia B:  R$ 1.030,00
- Gateway: R$ 1.200,00
- Kit:     R$ 3.180,00

ROI:
- Payback kit variante A: 24-36 meses
- Payback kit variante B: 12-18 meses
```

> **Correção v1.3**: os custos-alvo da v1.0 (R$ 450 / R$ 380) eram
> incompatíveis com o BOM — o encodador magnetostrutivo de 5m custa, sozinho,
> entre R$ 1.800 e R$ 3.500. Ver detalhamento em
> `docs/componentes/boia-a-oleo.md` e `docs/componentes/boia-b-interface.md`.
> O payback de "8-12 meses" também deve ser revisto.

#### Controle de Qualidade
- **Incoming Inspection**: Verificação de fornecedores
- **In-Process Checks**: Testes durante montagem
- **Final Testing**: Validação completa do produto
- **Traceability**: Rastreamento completo de lotes

### 3. Documentação Técnica Completa

#### Manual do Produto
**Conteúdo**:
- Especificações técnicas detalhadas
- Procedimentos de instalação
- Manutenção preventiva
- Troubleshooting guide
- Certificações e conformidades

#### Documentação de Engenharia
```txt
📋 Documentos Necessários:
- Schematics elétricos completos
- PCB Layout e Bill of Materials (BOM)
- Firmware source code e documentação
- Test procedures e acceptance criteria
- Design validation reports
- Risk management file (ATEX)
```

#### Documentação de Produção
- **Work Instructions**: Passo-a-passo da montagem
- **Quality Control Plans**: Procedimentos de QC
- **Supplier Requirements**: Especificações para fornecedores
- **Change Control**: Processo de modificações

### 4. Preparação para Deployment

#### Kit de Instalação Completo
```txt
Conteúdo do Kit:
- 2x Boias (A + B) com calibração
- 1x Gateway Raspberry Pi configurado
- Cabo guia de 6m (inox ou PVC)
- Kit de fixação (flanges + suportes)
- Antena LoRa externa
- Manual de instalação + CD com software
```

#### Treinamento da Equipe
- **Instaladores**: Procedimentos de montagem no campo
- **Operadores**: Uso do dashboard e manutenção
- **Técnicos**: Troubleshooting avançado
- **Manutenção**: Procedimentos preventivos

#### Suporte Pós-Venda
- **Garantia**: 24 meses para defeitos de fabricação
- **Suporte Técnico**: Helpdesk dedicado
- **Atualizações**: Firmware over-the-air (OTA)
- **Peças de Reposição**: Estoque estratégico

## 📊 Métricas de Sucesso

### Critérios de Aceitação
- ✅ **Certificações**: ATEX/IECEx Zone 1 obtidas
- ✅ **Custo**: Alvo de produção atingido
- ✅ **Qualidade**: Defeito rate <0.5%
- ✅ **Documentação**: 100% completa e aprovada
- ✅ **Produção**: Capacidade para 100 unidades/mês

### Deliverables da Fase
1. **Certificações ATEX/IECEx** válidas
2. **Protótipo otimizado** para produção
3. **Documentação técnica** completa
4. **Processos de fabricação** validados
5. **Kit de instalação** pronto para deployment

## 🏗️ Planejamento de Produção

### Linha de Produção
```
Estação 1: Montagem mecânica das boias
Estação 2: Integração de sensores e PCB
Estação 3: Configuração de firmware
Estação 4: Testes funcionais e calibração
Estação 5: Embalagem e controle de qualidade
```

### Fornecedores Estratégicos
- **Eletrônica**: Componentes certificados ATEX
- **Mecânica**: Fabricação de boias por injeção
- **Software**: Desenvolvimento e manutenção
- **Certificação**: Laboratórios acreditados

## ⏱️ Cronograma Estimado
- **Mês 1**: Preparação documentação ATEX
- **Mês 2**: Testes de certificação
- **Mês 3**: Otimização de design
- **Mês 4**: Setup de produção piloto
- **Mês 5**: Certificações e validação final

## 🚨 Riscos e Mitigações
- **Risco**: Recusa na certificação ATEX
  - **Mitigação**: Consultoria especializada e testes preliminares

- **Risco**: Custos de produção acima do previsto
  - **Mitigação**: Prototipagem e análise de custos detalhada

- **Risco**: Dependência de fornecedores únicos
  - **Mitigação**: Qualificação de múltiplos fornecedores

- **Risco**: Mudanças regulatórias
  - **Mitigação**: Monitoramento contínuo de normas

---

## 📞 Contatos e Suporte

### Equipe de Desenvolvimento
- **Líder de Projeto**: [Nome] - [Email]
- **Engenharia**: [Nome] - [Email]
- **Qualidade**: [Nome] - [Email]
- **Produção**: [Nome] - [Email]

### Parceiros Estratégicos
- **Laboratório de Certificação**: [Empresa] - [Contato]
- **Fornecedor de Componentes**: [Empresa] - [Contato]
- **Consultor ATEX**: [Empresa] - [Contato]

---

*Versão: 1.0 | Data: Janeiro 2024*
