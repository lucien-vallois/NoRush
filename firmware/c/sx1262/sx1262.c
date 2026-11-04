/*
 * Implementacao do driver SX1262.
 *
 * Protocolo SPI do SX1262:
 *   comando de escrita : NSSv opcode [args...] NSS^
 *   comando de leitura  : NSSv opcode NOP [leituras...] NSS^
 * A linha BSY deve estar em nivel baixo antes de cada transacao.
 */
#include "sx1262.h"

/* --- Estado ---------------------------------------------------------- */
static const sx1262_platform_t *g_plat   = 0;
static sx1262_config_t          g_cfg;
static int16_t                  g_rssi   = 0;

/* --- Helpers --------------------------------------------------------- */

static sx1262_status_t wait_busy(uint32_t timeout_ms)
{
    uint32_t i;
    if (!g_plat || !g_plat->read_busy) {
        return SX1262_ERR_STATE;
    }
    for (i = 0; i < timeout_ms * 100u; ++i) {
        if (!g_plat->read_busy()) {
            return SX1262_OK;
        }
        if (g_plat->delay_us) {
            g_plat->delay_us(10);
        }
    }
    return SX1262_ERR_BUSY;
}

static sx1262_status_t xfer(const uint8_t *tx, uint8_t *rx, size_t len)
{
    if (!g_plat || !g_plat->spi_transfer) {
        return SX1262_ERR_STATE;
    }
    if (!g_plat->spi_transfer(tx, rx, len)) {
        return SX1262_ERR_SPI;
    }
    return SX1262_OK;
}

static sx1262_status_t write_cmd(uint8_t opcode, const uint8_t *args,
                                 uint8_t nargs)
{
    uint8_t buf[64];
    sx1262_status_t st;

    if (nargs + 1u > sizeof buf) {
        return SX1262_ERR_ARG;
    }
    st = wait_busy(100);
    if (st != SX1262_OK) {
        return st;
    }
    buf[0] = opcode;
    if (nargs > 0u) {
        for (size_t i = 0; i < nargs; ++i) {
            buf[1u + i] = args[i];
        }
    }
    g_plat->set_nss(false);
    st = xfer(buf, 0, (size_t)nargs + 1u);
    g_plat->set_nss(true);
    return st;
}

static sx1262_status_t read_cmd(uint8_t opcode, uint8_t *out, uint8_t nout)
{
    uint8_t tx[64];
    uint8_t rx[64];
    sx1262_status_t st;

    if (nout + 2u > sizeof tx) {
        return SX1262_ERR_ARG;
    }
    st = wait_busy(100);
    if (st != SX1262_OK) {
        return st;
    }
    tx[0] = opcode;
    tx[1] = 0x00u;             /* NOP */
    for (uint8_t i = 0; i < nout; ++i) {
        tx[2u + i] = 0x00u;
    }
    g_plat->set_nss(false);
    st = xfer(tx, rx, (size_t)nout + 2u);
    g_plat->set_nss(true);
    if (st == SX1262_OK && out) {
        for (uint8_t i = 0; i < nout; ++i) {
            out[i] = rx[2u + i];
        }
    }
    return st;
}

/* --- API ------------------------------------------------------------- */

uint8_t sx1262_get_status(void)
{
    if (!g_plat || !g_plat->spi_transfer) {
        return 0xFFu;
    }
    if (wait_busy(100) != SX1262_OK) {
        return 0xFFu;
    }
    {
        uint8_t tx[2] = { SX1262_OP_GET_STATUS, 0x00u };
        uint8_t rx[2] = { 0, 0 };
        g_plat->set_nss(false);
        (void)xfer(tx, rx, 2);
        g_plat->set_nss(true);
        return rx[1];
    }
}

uint16_t sx1262_get_irq(void)
{
    uint8_t b[2] = { 0, 0 };
    if (read_cmd(SX1262_OP_GET_IRQ_STATUS, b, 2) != SX1262_OK) {
        return 0;
    }
    return (uint16_t)(((uint16_t)b[0] << 8) | b[1]);
}

void sx1262_clear_irq(uint16_t mask)
{
    uint8_t b[2];
    b[0] = (uint8_t)((mask >> 8) & 0xFFu);
    b[1] = (uint8_t)(mask & 0xFFu);
    (void)write_cmd(SX1262_OP_CLEAR_IRQ_STATUS, b, 2);
}

static sx1262_status_t set_rf_frequency(uint32_t hz)
{
    /* reg = freq_hz * 2^25 / 32e6, big-endian */
    uint64_t reg = ((uint64_t)hz << 25) / 32000000ULL;
    uint8_t  b[4];
    b[0] = (uint8_t)((reg >> 24) & 0xFFu);
    b[1] = (uint8_t)((reg >> 16) & 0xFFu);
    b[2] = (uint8_t)((reg >> 8) & 0xFFu);
    b[3] = (uint8_t)(reg & 0xFFu);
    return write_cmd(SX1262_OP_SET_RF_FREQUENCY, b, 4);
}

static sx1262_status_t set_pa_config(int8_t power_dbm)
{
    /* SX1262: deviceSel = 0x01. +22 dBm exige hpMax = 0x07. */
    uint8_t b[4];
    b[0] = (power_dbm > 20) ? 0x04u : 0x02u;   /* paDutyCycle */
    b[1] = (power_dbm > 20) ? 0x07u : 0x03u;   /* hpMax */
    b[2] = 0x01u;                              /* deviceSel (SX1262) */
    b[3] = 0x01u;                              /* paLut */
    return write_cmd(SX1262_OP_SET_PA_CONFIG, b, 4);
}

sx1262_status_t sx1262_set_standby(sx1262_standby_t mode)
{
    uint8_t b[1];
    b[0] = (uint8_t)mode;
    return write_cmd(SX1262_OP_SET_STANDBY, b, 1);
}

sx1262_status_t sx1262_set_sleep(void)
{
    uint8_t b[1] = { 0x04u };   /* warm start, RTC mantido */
    return write_cmd(SX1262_OP_SET_SLEEP, b, 1);
}

sx1262_status_t sx1262_init(const sx1262_platform_t *plat,
                            const sx1262_config_t   *cfg)
{
    sx1262_status_t st;
    uint8_t b[8];

    if (!plat || !cfg || !cfg->rf_freq_hz) {
        return SX1262_ERR_ARG;
    }
    g_plat = plat;
    g_cfg  = *cfg;

    /* Reset por pino. */
    if (g_plat->set_reset) {
        g_plat->set_reset(false);
        if (g_plat->delay_ms) { g_plat->delay_ms(2); }
        g_plat->set_reset(true);
        if (g_plat->delay_ms) { g_plat->delay_ms(10); }
    }

    st = sx1262_set_standby(SX1262_STANDBY_RC);
    if (st != SX1262_OK) {
        return st;
    }

    /* DIO2 controla o switch de RF externo. */
    b[0] = 0x01u;
    st = write_cmd(SX1262_OP_SET_DIO2_AS_RF_SW, b, 1);
    if (st != SX1262_OK) {
        return st;
    }

    /* Regulador DC-DC (menor consumo que LDO). */
    b[0] = 0x01u;
    st = write_cmd(SX1262_OP_SET_REGULATOR_MODE, b, 1);
    if (st != SX1262_OK) {
        return st;
    }

    b[0] = (uint8_t)SX1262_PACKET_TYPE_LORA;
    st = write_cmd(SX1262_OP_SET_PACKET_TYPE, b, 1);
    if (st != SX1262_OK) {
        return st;
    }

    st = set_rf_frequency(cfg->rf_freq_hz);
    if (st != SX1262_OK) {
        return st;
    }

    st = set_pa_config(cfg->power_dbm);
    if (st != SX1262_OK) {
        return st;
    }

    /* TxParams: power, rampTime 200 us. */
    b[0] = (uint8_t)cfg->power_dbm;
    b[1] = 0x04u;
    st = write_cmd(SX1262_OP_SET_TX_PARAMS, b, 2);
    if (st != SX1262_OK) {
        return st;
    }

    /* ModulationParams: sf, bw, cr, ldro. */
    b[0] = cfg->mod.sf;
    b[1] = cfg->mod.bw_khz_log2;
    b[2] = cfg->mod.cr;
    b[3] = cfg->mod.ldro ? 0x01u : 0x00u;
    st = write_cmd(SX1262_OP_SET_MODULATION_PARAMS, b, 4);
    if (st != SX1262_OK) {
        return st;
    }

    /* PacketParams: preamble(2), header, payloadLen, crc, invertIQ. */
    b[0] = cfg->pkt.preamble_len_msb;
    b[1] = cfg->pkt.preamble_len_lsb;
    b[2] = cfg->pkt.header_type;
    b[3] = cfg->pkt.payload_len;
    b[4] = cfg->pkt.crc_on;
    b[5] = cfg->pkt.invert_iq;
    st = write_cmd(SX1262_OP_SET_PACKET_PARAMS, b, 6);
    if (st != SX1262_OK) {
        return st;
    }

    /* Base address: TX e RX no inicio do FIFO. */
    b[0] = 0x00u;
    b[1] = 0x00u;
    st = write_cmd(SX1262_OP_SET_BUFFER_BASE_ADDR, b, 2);
    if (st != SX1262_OK) {
        return st;
    }

    /* Habilita apenas TX_DONE, RX_DONE, CRC_ERROR e TIMEOUT. */
    b[0] = 0x00u; b[1] = 0x01u; b[2] = 0x00u; b[3] = 0x00u;  /* irq mask */
    b[4] = 0x00u; b[5] = 0x01u; b[6] = 0x00u; b[7] = 0x00u;  /* DIO1     */
    st = write_cmd(SX1262_OP_SET_DIO_IRQ_PARAMS, b, 8);
    return st;
}

sx1262_status_t sx1262_send(const uint8_t *data, uint8_t len)
{
    sx1262_status_t st;
    uint8_t b[4];
    uint16_t irq;

    if (!data && len > 0u) {
        return SX1262_ERR_ARG;
    }

    /* WriteBuffer: opcode, offset, dados... */
    {
        uint8_t tx[2] = { SX1262_OP_WRITE_BUFFER, 0x00u };
        g_plat->set_nss(false);
        (void)xfer(tx, 0, 2);
        (void)xfer(data, 0, len);
        g_plat->set_nss(true);
    }

    /* PacketParams com payloadLen = len. */
    {
        uint8_t pp[6];
        pp[0] = g_cfg.pkt.preamble_len_msb;
        pp[1] = g_cfg.pkt.preamble_len_lsb;
        pp[2] = g_cfg.pkt.header_type;
        pp[3] = len;
        pp[4] = g_cfg.pkt.crc_on;
        pp[5] = g_cfg.pkt.invert_iq;
        st = write_cmd(SX1262_OP_SET_PACKET_PARAMS, pp, 6);
        if (st != SX1262_OK) {
            return st;
        }
    }

    sx1262_clear_irq(SX1262_IRQ_ALL);

    /* SetTx com timeout maximo (single shot). */
    b[0] = 0x00u; b[1] = 0x00u; b[2] = 0x00u;
    st = write_cmd(SX1262_OP_SET_TX, b, 3);
    if (st != SX1262_OK) {
        return st;
    }

    /* Espera TX_DONE por ate 5 s. */
    for (uint32_t i = 0; i < 5000u; ++i) {
        irq = sx1262_get_irq();
        if (irq & SX1262_IRQ_TX_DONE) {
            sx1262_clear_irq(SX1262_IRQ_ALL);
            return SX1262_OK;
        }
        if (irq & SX1262_IRQ_TIMEOUT) {
            sx1262_clear_irq(SX1262_IRQ_ALL);
            return SX1262_ERR_TIMEOUT;
        }
        if (g_plat->delay_ms) {
            g_plat->delay_ms(1);
        }
    }
    sx1262_clear_irq(SX1262_IRQ_ALL);
    return SX1262_ERR_TIMEOUT;
}

sx1262_status_t sx1262_receive(uint8_t  *data,
                               uint8_t  *len,
                               uint8_t   max_len,
                               uint32_t  timeout_ms)
{
    sx1262_status_t st;
    uint8_t b[3];
    uint32_t elapsed = 0;

    if (!data || !len) {
        return SX1262_ERR_ARG;
    }
    *len = 0;

    sx1262_clear_irq(SX1262_IRQ_ALL);

    /* SetRx com timeout em unidades de 15,625 us. */
    {
        uint32_t t = timeout_ms * 64u;
        if (t > 0xFFFFFFu) {
            t = 0xFFFFFFu;
        }
        b[0] = (uint8_t)((t >> 16) & 0xFFu);
        b[1] = (uint8_t)((t >> 8) & 0xFFu);
        b[2] = (uint8_t)(t & 0xFFu);
    }
    st = write_cmd(SX1262_OP_SET_RX, b, 3);
    if (st != SX1262_OK) {
        return st;
    }

    while (elapsed <= timeout_ms) {
        uint16_t irq = sx1262_get_irq();

        if (irq & SX1262_IRQ_CRC_ERROR) {
            sx1262_clear_irq(SX1262_IRQ_ALL);
            return SX1262_ERR_STATE;
        }
        if (irq & SX1262_IRQ_TIMEOUT) {
            sx1262_clear_irq(SX1262_IRQ_ALL);
            return SX1262_ERR_TIMEOUT;
        }
        if (irq & SX1262_IRQ_RX_DONE) {
            uint8_t payload_len;
            uint8_t rxbuf[SX1262_MAX_PAYLOAD];

            sx1262_clear_irq(SX1262_IRQ_ALL);

            /* PayloadStatus (opcode 0x15): status, payloadLen, rssiAvg. */
            {
                uint8_t tx[4] = { 0x15u, 0x00u, 0x00u, 0x00u };
                uint8_t rx[4] = { 0, 0, 0, 0 };
                g_plat->set_nss(false);
                (void)xfer(tx, rx, 4);
                g_plat->set_nss(true);
                payload_len = rx[2];
                g_rssi = (int16_t)(-((int16_t)rx[3]) / 2);
            }

            if (payload_len == 0u) {
                return SX1262_ERR_STATE;
            }
            if (payload_len > max_len) {
                payload_len = max_len;
            }

            /* ReadBuffer: opcode, offset, NOP, dados... */
            {
                uint8_t tx[3] = { SX1262_OP_READ_BUFFER, 0x00u, 0x00u };
                uint8_t rx[3] = { 0, 0, 0 };
                g_plat->set_nss(false);
                (void)xfer(tx, rx, 3);
                (void)xfer(0, rxbuf, payload_len);
                g_plat->set_nss(true);
            }

            for (uint8_t i = 0; i < payload_len; ++i) {
                data[i] = rxbuf[i];
            }
            *len = payload_len;
            return SX1262_OK;
        }

        if (g_plat->delay_ms) {
            g_plat->delay_ms(1);
        }
        elapsed += 1u;
    }

    sx1262_clear_irq(SX1262_IRQ_ALL);
    return SX1262_ERR_TIMEOUT;
}

int16_t sx1262_last_rssi_dbm(void)
{
    return g_rssi;
}
