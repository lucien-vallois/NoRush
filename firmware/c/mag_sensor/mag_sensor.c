/*
 * Implementacao do front-end Modbus RTU do encodador magnetostrutivo.
 *
 * Frame de requisicao (8 bytes):
 *   [addr][0x03][start_hi][start_lo][qty_hi][qty_lo][crc_lo][crc_hi]
 *
 * Frame de resposta para 2 registradores (7 bytes):
 *   [addr][0x03][byte_count][d0][d1][d2][d3][crc_lo][crc_hi]
 */
#include "mag_sensor.h"

#define MAG_REQ_LEN   8u
#define MAG_RESP_LEN  9u

static const mag_platform_t *g_plat = 0;
static uint8_t               g_addr = 1u;

uint16_t mag_modbus_crc16(const uint8_t *buf, size_t len)
{
    uint16_t crc = 0xFFFFu;
    if (!buf) {
        return 0;
    }
    for (size_t i = 0; i < len; ++i) {
        crc ^= (uint16_t)buf[i];
        for (int b = 0; b < 8; ++b) {
            if (crc & 0x0001u) {
                crc = (uint16_t)((crc >> 1) ^ 0xA001u);
            } else {
                crc = (uint16_t)(crc >> 1);
            }
        }
    }
    return crc;
}

mag_status_t mag_init(const mag_platform_t *plat, uint8_t slave_addr)
{
    if (!plat || !plat->uart_write || !plat->uart_read) {
        return MAG_ERR_ARG;
    }
    if (slave_addr == 0u || slave_addr > 247u) {
        return MAG_ERR_ARG;
    }
    g_plat = plat;
    g_addr = slave_addr;
    return MAG_OK;
}

static mag_status_t read_registers(uint16_t start, uint8_t qty,
                                   uint16_t *out)
{
    uint8_t req[MAG_REQ_LEN];
    uint8_t resp[MAG_RESP_LEN];
    uint16_t crc;
    size_t got;

    if (!g_plat || !out || qty == 0u || qty > 2u) {
        return MAG_ERR_ARG;
    }

    req[0] = g_addr;
    req[1] = MAG_FUNC_READ_HOLD;
    req[2] = (uint8_t)(start >> 8);
    req[3] = (uint8_t)(start & 0xFFu);
    req[4] = 0x00u;
    req[5] = qty;
    crc = mag_modbus_crc16(req, 6u);
    req[6] = (uint8_t)(crc & 0xFFu);        /* CRC lo primeiro */
    req[7] = (uint8_t)(crc >> 8);

    /* Meio-duplex: habilita o driver antes de transmitir. */
    if (g_plat->set_de_re) {
        g_plat->set_de_re(true);
    }
    if (!g_plat->uart_write(req, MAG_REQ_LEN)) {
        if (g_plat->set_de_re) {
            g_plat->set_de_re(false);
        }
        return MAG_ERR_BUSY;
    }
    /* Tempo de virada do barramento. */
    if (g_plat->delay_ms) {
        g_plat->delay_ms(2);
    }
    if (g_plat->set_de_re) {
        g_plat->set_de_re(false);
    }

    /* Resposta: 3 + 2*qty + 2 bytes de CRC. */
    got = g_plat->uart_read(resp, (size_t)(3u + 2u * qty + 2u), 200u);
    if (got < (size_t)(3u + 2u * qty + 2u)) {
        return MAG_ERR_TIMEOUT;
    }

    if (resp[0] != g_addr || resp[1] != MAG_FUNC_READ_HOLD) {
        return MAG_ERR_CRC;
    }
    if (resp[2] != (uint8_t)(2u * qty)) {
        return MAG_ERR_CRC;
    }

    crc = mag_modbus_crc16(resp, (size_t)(3u + 2u * qty));
    if (resp[3u + 2u * qty] != (uint8_t)(crc & 0xFFu) ||
        resp[4u + 2u * qty] != (uint8_t)(crc >> 8)) {
        return MAG_ERR_CRC;
    }

    for (uint8_t i = 0; i < qty; ++i) {
        out[i] = (uint16_t)(((uint16_t)resp[3u + 2u * i] << 8) |
                             resp[4u + 2u * i]);
    }
    return MAG_OK;
}

mag_status_t mag_read_position_mm(uint16_t *out_mm)
{
    uint16_t regs[2];
    mag_status_t st;
    uint32_t raw;

    if (!out_mm) {
        return MAG_ERR_ARG;
    }
    st = read_registers(MAG_REG_POS_LO, 2u, regs);
    if (st != MAG_OK) {
        return st;
    }

    /* O sensor reporta posicao em decimos de milimetro. */
    raw = ((uint32_t)regs[1] << 16) | regs[0];
    raw /= 10u;

    if (raw > MAG_POS_MAX_MM) {
        *out_mm = MAG_POS_MAX_MM;
        return MAG_ERR_RANGE;
    }
    *out_mm = (uint16_t)raw;
    return MAG_OK;
}

mag_status_t mag_read_temperature_c10(int16_t *out_c10)
{
    uint16_t regs[2];
    mag_status_t st;
    int32_t raw;

    if (!out_c10) {
        return MAG_ERR_ARG;
    }
    st = read_registers(MAG_REG_TEMP_LO, 2u, regs);
    if (st != MAG_OK) {
        return st;
    }

    raw = (int32_t)(((uint32_t)regs[1] << 16) | regs[0]);
    if (raw < MAG_TEMP_MIN_C10 || raw > MAG_TEMP_MAX_C10) {
        return MAG_ERR_RANGE;
    }
    *out_c10 = (int16_t)raw;
    return MAG_OK;
}

mag_status_t mag_read_status(uint16_t *out_status)
{
    if (!out_status) {
        return MAG_ERR_ARG;
    }
    return read_registers(MAG_REG_STATUS, 1u, out_status);
}
