# 📋 Fase 1: Prototipagem - Boias Inteligentes

> **Status (2026-11-04): R&D em standby — pesquisa futura.** Este material trata do hardware próprio (cabeça/boias NoRush), pausado até o piloto provar valor. O escopo atual usa uma haste magnetostritiva comercial certificada, com o NoRush como camada de software: ver [Plano D](../plano-d-desenvolvimento.md).

## 🎯 Objetivos da Fase
- Desenvolver protótipos funcionais das Boias A e B
- Validar materiais e densidades adequadas
- Testar sensores embarcados
- Estabelecer baseline de performance

## 🔧 Atividades Principais

### 1. Desenvolvimento de Protótipos das Boias

#### Boia A (Óleo) - Protótipo
- **Material**: HDPE com espuma de poliuretano interna
- **Dimensões**: Diâmetro 15cm, altura 20cm (V = 3,53 dm³)
- **Peso alvo**: 2,8 - 3,1 kg
- **Densidade alvo**: < 850 kg/m³

#### Boia B (Interface Água-Óleo) - Protótipo
- **Material**: Polipropileno maciço calibrado
- **Dimensões**: Diâmetro 12cm, altura 15cm (V = 1,70 dm³)
- **Peso alvo**: 1,55 - 1,75 kg
- **Densidade alvo**: 950-990 kg/m³

> **Correção v1.3**: os pesos-alvo da v1.0 (200-300g e 150-250g) eram
> incompatíveis com as densidades-alvo — produziriam densidade aparente de
> ~85 kg/m³ e ~130 kg/m³, fazendo as duas boias flutuarem sobre a água.
> Ver cálculo em `docs/componentes/boia-a-oleo.md`.

### 2. Testes de Densidade e Estabilidade

#### Protocolo de Testes de Densidade
```
Teste 1: Óleo Mineral (Densidade ~820 kg/m³)
- Boia A: Deve flutuar na superfície
- Boia B: Deve afundar até a interface

Teste 2: Óleo Diesel (Densidade ~840 kg/m³)
- Boia A: Deve flutuar na superfície
- Boia B: Deve afundar até a interface

Teste 3: Água + Óleo (Interface)
- Criar coluna de teste: 50cm água + 50cm óleo
- Validar posicionamento correto das boias
```

#### Testes de Estabilidade
- **Oscilação**: Máximo 5% de variação em condições calmas
- **Correntes**: Resistência a fluxos de até 0.5 m/s
- **Temperatura**: Funcionamento entre 0°C e 60°C

### 3. Validação de Sensores

#### Encodador Magnetostrutivo Linear (Sistema Recomendado v1.3)
```
Componentes necessários:
- Encodador magnetostrutivo de posição (barra de onda 5m, 316L)
- Flutuador magnético (ferrite em PTFE, Ø25mm)
- Front-end SSI/RS485 isolado
- Célula de condutividade (Boia B, 2 eletrodos 316L)
- Cabo de 4 vias blindado (resistente a óleo)
```

> **Correção v1.3**: a versão 1.0 recomendava "RFID + Régua Magnética"
> (MFRC522, 1cm de resolução). Isso não atinge ±1mm em 5m e o MFRC522 opera a
> 13,56MHz, não 125kHz. Descartado em favor do encodador magnetostrutivo.

#### Testes de Precisão
- **Resolução**: ±1mm
- **Range**: 0-5 metros
- **Frequência de leitura**: 1Hz
- **Confiabilidade**: >99.5% uptime

### 4. Sistema de Fixação

#### Tubo-Guia
- **Material**: PVC Schedule 80 ou Aço Inoxidável 316L
- **Diâmetro interno**: 25mm (para boia de 15cm)
- **Comprimento**: 6 metros (para tanques de 5m)
- **Fixação**: Flanges soldáveis na parte superior

#### Lastro e Estabilização
- **Peso**: 10-15% do peso total da boia
- **Posicionamento**: Centro de gravidade baixo
- **Material**: Chumbo encapsulado ou aço inox

## 🛠️ Materiais e Componentes Necessários

### Para Protótipo Básico
- HDPE virgem (folhas de 5mm)
- Polipropileno maciço
- Espuma de poliuretano
- Encodador magnetostrutivo 5m + flutuador magnético
- Célula de condutividade (2 eletrodos 316L)
- Placa de desenvolvimento STM32L4 (ex.: Nucleo-L432KC)
- Módulo LoRa SX1262 + antena 915MHz
- Bateria LiPo 3.7V 2600mAh (módulo encapsulado)

### Ferramentas de Fabricação
- Cortadora a laser (para precisão)
- Impressora 3D (para protótipos rápidos)
- Balança de precisão (0.01g)
- Tanque de teste (vidro acrílico 100L)

## 📊 Métricas de Sucesso

### Critérios de Aceitação
- ✅ Boias mantêm posição correta por >8 horas
- ✅ Precisão de medição: ±5mm
- ✅ Consumo de energia: <50mA médio
- ✅ Comunicação confiável: >95% de pacotes entregues
- ✅ Estabilidade em correntes: <10% de deslocamento

### Deliverables da Fase
1. **Protótipos funcionais** das Boias A e B
2. **Relatório de testes** de densidade e estabilidade
3. **Especificações técnicas** dos materiais selecionados
4. **Baseline de performance** para próximas fases

## ⏱️ Cronograma Estimado
- **Semana 1-2**: Desenvolvimento dos protótipos mecânicos
- **Semana 3**: Integração de sensores e eletrônica
- **Semana 4**: Testes funcionais e validação
- **Semana 5**: Otimização e documentação

## 🚨 Riscos e Mitigações
- **Risco**: Densidade inadequada dos materiais
  - **Mitigação**: Testes preliminares com múltiplas densidades

- **Risco**: Interferência de sensores por óleo
  - **Mitigação**: Encapsulamento adequado e testes em óleo

- **Risco**: Flutuação instável
  - **Mitigação**: Otimização do lastro e formato aerodinâmico

---

*Versão: 1.0 | Data: Janeiro 2024*
