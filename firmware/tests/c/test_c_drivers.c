/*
 * Testes dos drivers C (SX1262 e magnetostrutivo) contra plataformas falsas.
 *
 * Compilado e executado no host pelo scripts/check.ps1. Verifica:
 *   - CRC16 Modbus contra vetor conhecido e contra implementacao independente
 *   - decodificacao da resposta Modbus do sensor de posicao
 *   - rejeicao de frame com CRC errado
 *   - saturacao de faixa do sensor
 *   - montagem correta do frame de requisicao
 */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#include "mag_sensor.h"
#include "sx1262.h"

static int g_checks = 0;
static int g_fails = 0;

static void check(int cond, const char *msg)
{
    ++g_checks;
    if (cond) {
        printf("  ok   %s\n", msg);
    } else {
        ++g_fails;
        printf("  FAIL %s\n", msg);
    }
}

/* --- CRC16 independente (implementacao alternativa, para cruzar) ----- */
static uint16_t crc16_ref(const uint8_t *buf, size_t len)
{
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < len; ++i) {
        crc = (uint16_t)(crc ^ buf[i]);
        for (int j = 0; j < 8; ++j) {
            uint16_t lsb = (uint16_t)(crc & 1u);
            crc = (uint16_t)(crc >> 1);
            if (lsb) {
                crc = (uint16_t)(crc ^ 0xA001);
            }
        }
    }
    return crc;
}

/* --- Plataforma falsa para o magnetostrutivo ------------------------- */
static uint8_t  g_uart_rx[64];
static size_t   g_uart_rx_len;
static size_t   g_uart_rx_pos;
static uint8_t  g_uart_tx[64];
static size_t   g_uart_tx_len;
static int      g_de_re_state;

static bool fake_uart_write(const uint8_t *buf, size_t len)
{
    memcpy(g_uart_tx, buf, len);
    g_uart_tx_len = len;
    return true;
}

static size_t fake_uart_read(uint8_t *buf, size_t len, uint32_t timeout_ms)
{
    size_t avail = g_uart_rx_len - g_uart_rx_pos;
    size_t n = (len < avail) ? len : avail;
    (void)timeout_ms;
    memcpy(buf, g_uart_rx + g_uart_rx_pos, n);
    g_uart_rx_pos += n;
    return n;
}

static void fake_set_de_re(bool level)
{
    g_de_re_state = level ? 1 : 0;
}

static void fake_delay_ms(uint32_t ms) { (void)ms; }

/* Monta uma resposta Modbus RTU valida para leitura de `nregs` registradores. */
static size_t build_modbus_response(uint8_t *out, uint8_t addr,
                                    const uint16_t *regs, uint8_t nregs)
{
    uint8_t body[64];
    size_t  n = 0;
    uint16_t crc;

    body[n++] = addr;
    body[n++] = MAG_FUNC_READ_HOLD;
    body[n++] = (uint8_t)(2u * nregs);
    for (uint8_t i = 0; i < nregs; ++i) {
        body[n++] = (uint8_t)(regs[i] >> 8);
        body[n++] = (uint8_t)(regs[i] & 0xFFu);
    }
    crc = mag_modbus_crc16(body, n);
    memcpy(out, body, n);
    out[n++] = (uint8_t)(crc & 0xFFu);
    out[n++] = (uint8_t)(crc >> 8);
    return n;
}

static const mag_platform_t g_fake_plat = {
    fake_uart_write, fake_uart_read, fake_set_de_re, fake_delay_ms
};

/* --- Plataforma falsa para o SX1262 --------------------------------- */
static bool fake_spi(const uint8_t *tx, uint8_t *rx, size_t len)
{
    /* Devolve zeros: suficiente para exercitar a maquina de estados. */
    if (rx) {
        memset(rx, 0, len);
    }
    (void)tx;
    return true;
}
static void fake_nss(bool level)   { (void)level; }
static void fake_reset(bool level) { (void)level; }
static bool fake_busy(void)        { return false; }
static void fake_delay_us(uint32_t us) { (void)us; }

static const sx1262_platform_t g_fake_spi_plat = {
    fake_spi, fake_nss, fake_reset, fake_busy, fake_delay_ms, fake_delay_us
};

/* ===================================================================== */

static void test_crc(void)
{
    printf("=== crc16 modbus ===\n");

    /* Vetor canonico do Modbus RTU: requisicao de leitura de 10 registradores
     * no escravo 1. O CRC transmitido e' 0xC5 0xCD (lo primeiro). */
    {
        const uint8_t frame[6] = { 0x01, 0x03, 0x00, 0x00, 0x00, 0x0A };
        uint16_t c = mag_modbus_crc16(frame, sizeof frame);
        check(c == 0xCDC5, "vetor canonico 01 03 00 00 00 0A -> 0xCDC5");
    }

    /* Cruzamento com uma implementacao independente em 8 frames aleatorios. */
    {
        int same = 1;
        uint8_t buf[16];
        for (int k = 0; k < 8; ++k) {
            for (size_t i = 0; i < sizeof buf; ++i) {
                buf[i] = (uint8_t)((k * 37 + (int)i * 91) & 0xFF);
            }
            if (mag_modbus_crc16(buf, sizeof buf) != crc16_ref(buf, sizeof buf)) {
                same = 0;
            }
        }
        check(same, "crc16 confere com implementacao independente");
    }

    /* Propriedade: frame + CRC (lo, hi) tem CRC zero. */
    {
        uint8_t frame[6] = { 0x01, 0x03, 0x00, 0x02, 0x00, 0x01 };
        uint8_t full[8];
        uint16_t c = mag_modbus_crc16(frame, 6);
        memcpy(full, frame, 6);
        full[6] = (uint8_t)(c & 0xFF);
        full[7] = (uint8_t)(c >> 8);
        check(mag_modbus_crc16(full, 8) == 0,
              "frame + crc resulta em CRC zero (propriedade)");
    }
}

static void test_mag_sensor(void)
{
    uint16_t mm = 0;
    int16_t  c10 = 0;
    uint16_t status = 0;
    mag_status_t st;

    printf("=== mag_sensor ===\n");

    st = mag_init(&g_fake_plat, 1);
    check(st == MAG_OK, "mag_init aceita endereco valido");
    check(mag_init(&g_fake_plat, 0) == MAG_ERR_ARG, "endereco 0 rejeitado");
    check(mag_init(&g_fake_plat, 248) == MAG_ERR_ARG, "endereco 248 rejeitado");
    (void)mag_init(&g_fake_plat, 1);

    /* --- decodificacao da posicao ----------------------------------- */
    /* 2340 mm -> 23400 decimos = 0x5B68; regs[0]=0x5B68, regs[1]=0x0000 */
    {
        const uint16_t regs[2] = { 0x5B68, 0x0000 };
        g_uart_rx_len = build_modbus_response(g_uart_rx, 1, regs, 2);
        g_uart_rx_pos = 0;
        st = mag_read_position_mm(&mm);
        check(st == MAG_OK, "leitura de posicao OK");
        check(mm == 2340, "23400 decimos = 2340 mm");

        /* A requisicao transmitida deve ser Modbus valido. */
        check(g_uart_tx_len == 8, "requisicao tem 8 bytes");
        check(g_uart_tx[0] == 0x01 && g_uart_tx[1] == 0x03,
              "requisicao: endereco 1, funcao 0x03");
        check(g_uart_tx[5] == 0x02, "requisicao: quantidade = 2 registradores");
        check(mag_modbus_crc16(g_uart_tx, 6) ==
              (uint16_t)(g_uart_tx[6] | ((uint16_t)g_uart_tx[7] << 8)),
              "requisicao tem CRC Modbus correto");
        check(g_de_re_state == 0, "driver RS485 volta para recepcao");
    }

    /* --- saturacao de faixa ----------------------------------------- */
    {
        /* 70000 decimos = 7000 mm > 5000 mm */
        const uint16_t regs[2] = { 0x11170 & 0xFFFF, 0x0001 };
        g_uart_rx_len = build_modbus_response(g_uart_rx, 1, regs, 2);
        g_uart_rx_pos = 0;
        st = mag_read_position_mm(&mm);
        check(st == MAG_ERR_RANGE, "acima de 5000 mm satura e sinaliza");
        check(mm == MAG_POS_MAX_MM, "valor saturado em 5000");
    }

    /* --- CRC errado -------------------------------------------------- */
    {
        const uint16_t regs[2] = { 0x5B68, 0x0000 };
        g_uart_rx_len = build_modbus_response(g_uart_rx, 1, regs, 2);
        g_uart_rx[6] ^= 0xFF;               /* corrompe o CRC */
        g_uart_rx_pos = 0;
        st = mag_read_position_mm(&mm);
        check(st == MAG_ERR_CRC, "CRC da resposta corrompido e' rejeitado");
    }

    /* --- resposta curta ---------------------------------------------- */
    {
        g_uart_rx_len = 3;
        memset(g_uart_rx, 0x01, sizeof g_uart_rx);
        g_uart_rx_pos = 0;
        st = mag_read_position_mm(&mm);
        check(st == MAG_ERR_TIMEOUT, "resposta curta vira timeout");
    }

    /* --- temperatura ------------------------------------------------- */
    {
        /* 285 decimos de grau = 28,5 oC */
        const uint16_t regs[2] = { 285, 0x0000 };
        g_uart_rx_len = build_modbus_response(g_uart_rx, 1, regs, 2);
        g_uart_rx_pos = 0;
        st = mag_read_temperature_c10(&c10);
        check(st == MAG_OK, "leitura de temperatura OK");
        check(c10 == 285, "285 decimos de grau lido corretamente");
    }

    /* --- temperatura fora de faixa ----------------------------------- */
    {
        const uint16_t regs[2] = { (uint16_t)(-300 & 0xFFFF), 0xFFFF };
        g_uart_rx_len = build_modbus_response(g_uart_rx, 1, regs, 2);
        g_uart_rx_pos = 0;
        st = mag_read_temperature_c10(&c10);
        check(st == MAG_ERR_RANGE, "temperatura fora de faixa rejeitada");
    }

    /* --- registrador de status --------------------------------------- */
    {
        const uint16_t regs[1] = { 0x0001 };
        g_uart_rx_len = build_modbus_response(g_uart_rx, 1, regs, 1);
        g_uart_rx_pos = 0;
        st = mag_read_status(&status);
        check(st == MAG_OK && status == 0x0001, "registrador de status lido");
    }

    /* --- argumentos nulos -------------------------------------------- */
    check(mag_read_position_mm(0) == MAG_ERR_ARG, "ponteiro nulo rejeitado");
}

static void test_sx1262(void)
{
    sx1262_config_t cfg;
    sx1262_status_t st;

    printf("=== sx1262 ===\n");

    memset(&cfg, 0, sizeof cfg);
    cfg.rf_freq_hz   = 915000000u;
    cfg.power_dbm    = 14;
    cfg.mod.sf       = 9;
    cfg.mod.bw_khz_log2 = 6;   /* 500 kHz */
    cfg.mod.cr       = 1;
    cfg.mod.ldro     = false;
    cfg.pkt.preamble_len_msb = 0;
    cfg.pkt.preamble_len_lsb = 8;
    cfg.pkt.header_type = 0x00;
    cfg.pkt.payload_len = 12;
    cfg.pkt.crc_on   = 0x01;
    cfg.pkt.invert_iq = 0x00;

    check(sx1262_init(0, &cfg) == SX1262_ERR_ARG, "init sem plataforma falha");
    check(sx1262_init(&g_fake_spi_plat, 0) == SX1262_ERR_ARG,
          "init sem config falha");
    check(sx1262_init(&g_fake_spi_plat, &cfg) == SX1262_OK,
          "init com plataforma falsa retorna OK");

    check(sx1262_send(0, 12) == SX1262_ERR_ARG, "send com dados nulos falha");

    {
        uint8_t frame[12] = {
            0x00, 0x01, 0x2A, 0x01, 0x09, 0x24,
            0x01, 0x1D, 0x55, 0x33, 0x64, 0x0D
        };
        /* Com o SPI falso, o chip nunca sinaliza TX_DONE: o envio expira.
           O que verificamos e' que o caminho nao trava nem estoura buffer. */
        st = sx1262_send(frame, (uint8_t)sizeof frame);
        check(st == SX1262_ERR_TIMEOUT,
              "send sem TX_DONE expira sem travar (SPI falso)");
    }

    {
        uint8_t data[64];
        uint8_t len = 0;
        st = sx1262_receive(data, &len, (uint8_t)sizeof data, 5);
        check(st == SX1262_ERR_TIMEOUT,
              "receive sem RX_DONE expira com timeout");
        check(len == 0, "len permanece 0 apos timeout");
    }

    check(sx1262_receive(0, 0, 8, 5) == SX1262_ERR_ARG,
          "receive com argumentos nulos falha");
}

int main(void)
{
    printf("Testes dos drivers C (host, plataformas falsas)\n");
    test_crc();
    test_mag_sensor();
    test_sx1262();
    printf("\n--------------------------------------------------\n");
    if (g_fails == 0) {
        printf("TODOS OS TESTES C PASSARAM (%d checks)\n", g_checks);
        return 0;
    }
    printf("FALHAS C: %d de %d checks\n", g_fails, g_checks);
    return 1;
}
