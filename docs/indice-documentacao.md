# 📚 Índice da Documentação - Projeto Boias Inteligentes

> **Status (2026-11-04): R&D em standby — pesquisa futura.** Este material trata do hardware próprio (cabeça/boias NoRush), pausado até o piloto provar valor. O escopo atual usa uma haste magnetostritiva comercial certificada, com o NoRush como camada de software: ver [Plano D](plano-d-desenvolvimento.md).

## 📋 Visão Geral
Esta documentação completa o plano de projeto para o sistema de Boias Inteligentes e Roteadores Privados. Todos os documentos foram organizados por fases de desenvolvimento e componentes específicos.

## 📂 Estrutura da Documentação

### 🎯 Documento Principal
- [**📌 Plano de Projeto Completo**](./plano-projeto-boias-inteligentes.md)
  - Visão geral do projeto
  - Objetivos e benefícios
  - Arquitetura geral do sistema

### 📅 Documentação por Fases

#### **Fase 1: Prototipagem** 📋
- [**📋 Fase 1 - Prototipagem**](./fases/fase-1-prototipagem.md)
  - Desenvolvimento de protótipos das boias
  - Testes de densidade e estabilidade
  - Validação de sensores embarcados
  - Métricas de sucesso e deliverables

#### **Fase 2: Desenvolvimento do Gateway** 🔌
- [**🔌 Fase 2 - Gateway**](./fases/fase-2-gateway.md)
  - Configuração do Raspberry Pi
  - Implementação do software embarcado
  - Setup LoRaWAN gateway
  - Desenvolvimento do dashboard local

#### **Fase 3: Integração e Testes** 🔗
- [**🔗 Fase 3 - Integração**](./fases/fase-3-integracao-testes.md)
  - Conexão boias-gateway
  - Validação do fluxo de dados
  - Testes em ambiente controlado
  - Otimização de performance

#### **Fase 4: Certificações e Produção** 🏭
- [**🏭 Fase 4 - Produção**](./fases/fase-4-certificacoes-producao.md)
  - Certificações ATEX/IECEx
  - Otimização para produção
  - Documentação técnica completa
  - Preparação para deployment

### 🔧 Documentação por Componentes

#### **Boia A (Óleo)** 🟡
- [**🟡 Boia A - Especificações**](./componentes/boia-a-oleo.md)
  - Características físicas e materiais
  - Sistema de sensoriamento magnetostrutivo (v1.3 — substituiu RFID)
  - Comunicação LoRaWAN
  - Sistema de energia e bateria
  - Certificações e manutenção

#### **Boia B (Interface Água-Óleo)** 🔵
- [**🔵 Boia B - Especificações**](./componentes/boia-b-interface.md)
  - Detecção de interface inteligente
  - Algoritmos de processamento
  - Sensor de condutividade
  - Calibração especializada
  - Manutenção específica

#### **Gateway/Roteador Privado** 🔌
- [**🔌 Gateway - Especificações**](./componentes/gateway-roteador-privado.md)
  - Hardware Raspberry Pi
  - Software embarcado (MQTT, InfluxDB, Grafana)
  - Sistema de alertas offline
  - Segurança e monitoramento
  - APIs e interfaces

## 🗓️ Roadmap de Desenvolvimento

### ✅ **FASE ATUAL: Prototipagem**
- [x] Documentação completa da Fase 1
- [x] Especificações técnicas das boias
- [x] Setup inicial do laboratório de testes
- [ ] Desenvolvimento dos primeiros protótipos

### 🔄 **PRÓXIMAS FASES**

#### **Fase 2: Gateway (2-3 meses)**
- [ ] Configuração Raspberry Pi industrial
- [ ] Implementação MQTT + InfluxDB
- [ ] Desenvolvimento dashboard local
- [ ] Testes LoRaWAN básicos

#### **Fase 3: Integração (1-2 meses)**
- [ ] Conexão boias-gateway
- [ ] Testes em tanque controlado
- [ ] Validação de performance
- [ ] Otimização de algoritmos

#### **Fase 4: Produção (3-4 meses)**
- [ ] Certificações ATEX/IECEx
- [ ] Otimização para manufatura
- [ ] Produção piloto
- [ ] Deployment em campo

## 📊 Métricas de Projeto

### Cronograma Geral
- **Duração Total**: 6-9 meses (prototipagem + firmware + integração)
- **Certificação ATEX/IECEx**: +6-12 meses, orçamento próprio
- **Investimento Estimado (revisão v1.3)**: R$ 250.000,00 a R$ 450.000,00
  (a estimativa anterior de R$ 150.000,00 não cobria BOM real nem certificação)
- **ROI Esperado**: 24-36 meses (variante A) / 12-18 meses (variante B)
- **Capacidade de Produção**: 100 unidades/mês (após industrialização)

> **Revisão v1.3.** Três correções de base alteram os números acima:
> 1. **Massa/densidade das boias** estavam erradas por fator 6-10×
>    (ver `docs/componentes/boia-a-oleo.md`).
> 2. **BOM**: o sensor magnetostrutivo custa R$ 1.800-3.500 por unidade,
>    inviabilizando o alvo de R$ 420/boia. Duas variantes documentadas.
> 3. **Certificação ATEX Zone 1** custa R$ 150.000-500.000 e leva 6-12 meses
>    sozinha — precisa de linha de orçamento própria (ver fase 4).

### Deliverables por Fase
```txt
Fase 1: Protótipos funcionais + relatório de testes
Fase 2: Gateway operacional + dashboard local
Fase 3: Sistema integrado + métricas validadas
Fase 4: Produto certificado + documentação completa
```

## 🎯 Benefícios Esperados

### Operacionais
- ✅ Monitoramento contínuo 24/7
- ✅ Eliminação de medições manuais
- ✅ Alertas automáticos em tempo real
- ✅ Redução de visitas técnicas

### Econômicos
- ✅ ROI em 8-12 meses
- ✅ Redução de custos operacionais
- ✅ Aumento da eficiência
- ✅ Minimização de perdas por vazamentos

### Segurança
- ✅ Operação em áreas classificadas
- ✅ Certificações ATEX/IECEx
- ✅ Backup de energia independente
- ✅ Redundância de sistemas

## 📞 Contatos e Equipe

### Equipe de Desenvolvimento
- **Líder de Projeto**: [Nome] - [Email]
- **Engenharia Eletrônica**: [Nome] - [Email]
- **Engenharia Mecânica**: [Nome] - [Email]
- **Engenharia de Software**: [Nome] - [Email]
- **Qualidade e Certificações**: [Nome] - [Email]

### Parceiros Estratégicos
- **Laboratório de Certificação**: [Empresa] - [Contato]
- **Fornecedor de Componentes**: [Empresa] - [Contato]
- **Consultor ATEX**: [Empresa] - [Contato]

## 📋 Checklist de Validação

### Antes de Cada Fase
- [ ] Revisão da documentação
- [ ] Aprovação do orçamento
- [ ] Aquisição de materiais
- [ ] Setup do ambiente de testes

### Durante Cada Fase
- [ ] Acompanhamento diário de progresso
- [ ] Testes de validação contínua
- [ ] Documentação de desvios
- [ ] Controle de qualidade

### Ao Final de Cada Fase
- [ ] Validação dos deliverables
- [ ] Testes de aceitação
- [ ] Documentação final
- [ ] Aprovação para próxima fase

## 🚨 Riscos e Contingências

### Riscos Técnicos
- **Mitigação**: Prototipagem extensiva
- **Contingência**: Plano B com tecnologias alternativas
- **Monitoramento**: Testes regulares de performance

### Riscos de Cronograma
- **Mitigação**: Marcos realistas e buffer de tempo
- **Contingência**: Recursos adicionais se necessário
- **Monitoramento**: Acompanhamento semanal

### Riscos Orçamentários
- **Mitigação**: Controle rigoroso de custos
- **Contingência**: Reserva técnica de 20%
- **Monitoramento**: Relatórios mensais

## 📈 Próximos Passos

### Imediatos (Esta Semana)
1. ✅ **Documentação completa criada**
2. ⏳ **Revisão e validação dos documentos**
3. ⏳ **Setup do laboratório de prototipagem**
4. ⏳ **Aquisição de componentes iniciais**

### Curto Prazo (Próximas 2 Semanas)
1. ⏳ **Desenvolvimento de protótipo Boia A**
2. ⏳ **Setup Raspberry Pi básico**
3. ⏳ **Testes de comunicação LoRa**
4. ⏳ **Validação de materiais**

### Médio Prazo (Próximos 2 Meses)
1. ⏳ **Sistema integrado funcional**
2. ⏳ **Testes em ambiente controlado**
3. ⏳ **Otimização de performance**
4. ⏳ **Preparação para certificações**

---

## 📝 Notas de Versão

### Versão 1.0 (Janeiro 2024)
- ✅ Documentação completa criada
- ✅ Estrutura organizacional definida
- ✅ Roadmap de desenvolvimento estabelecido
- ✅ Métricas e KPIs definidos

### Próximas Atualizações
- Atualização após conclusão de cada fase
- Inclusão de resultados de testes
- Adição de lições aprendidas
- Revisão de custos e cronograma

---

*Última atualização: Janeiro 2024*  
*Próxima revisão: Após Fase 1*
