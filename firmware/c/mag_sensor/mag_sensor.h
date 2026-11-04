/*
 * Front-end do encodador magnetostrutivo de posicao (barramento RS485,
 * Modbus RTU).
 *
 * Substitui o esquema "RFID + regua magnetica" da especificacao v1.2,
 * que nao atingia +/-1 mm em 5 m. Ver docs/componentes/boia-a-oleo.md.
 *
 * Este driver e' independente de plataforma: o BSP fornece o transporte
 * UART/RS485 (ver src/bsp/stm32l4/hal_sensor.adb).
 */
#ifndef MAG_SENSOR_H
#define MAG_SENSOR_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Registradores Modbus (holding registers) do encodador.
 * Ajustar conforme o fabricante do sensor escolhido. */
#define MAG_REG_POS_LO      0x0000u   /* posicao, palavra baixa (mm * 10)  */
#define MAG_REG_POS_HI      0x0001u   /* posicao, palavra alta             */
#define MAG_REG_TEMP_LO     0x0002u   /* temperatura (0,1 oC)              */
#define MAG_REG_TEMP_HI     0x0003u
#define MAG_REG_STATUS      0x0004u   /* bits de diagnostico do sensor     */

#define MAG_FUNC_READ_HOLD  0x03u

/* Faixas validas, alinhadas com Hal_Types (src/hal/hal_types.ads). */
#define MAG_POS_MAX_MM      5000u
#define MAG_TEMP_MIN_C10    (-100)
#define MAG_TEMP_MAX_C10    600

typedef enum {
    MAG_OK = 0,
    MAG_ERR_ARG,
    MAG_ERR_TIMEOUT,
    MAG_ERR_CRC,
    MAG_ERR_RANGE,
    MAG_ERR_BUSY
} mag_status_t;

/* Transporte fornecido pelo BSP. Nenhum pode bloquear alem do timeout. */
typedef struct {
    /* Envia `len` bytes. Devolve true se tudo foi aceito pelo FIFO. */
    bool (*uart_write)(const uint8_t *buf, size_t len);
    /* Le ate `len` bytes com timeout. Devolve quantos bytes chegaram. */
    size_t (*uart_read)(uint8_t *buf, size_t len, uint32_t timeout_ms);
    /* Controla DE/RE do transceiver RS485 (true = transmitindo). */
    void (*set_de_re)(bool level);
    void (*delay_ms)(uint32_t ms);
} mag_platform_t;

/* CRC16 do Modbus RTU (polinomio 0xA001 reflexionado, init 0xFFFF).
 * A ordem no fio e' lo-byte primeiro. */
uint16_t mag_modbus_crc16(const uint8_t *buf, size_t len);

mag_status_t mag_init(const mag_platform_t *plat, uint8_t slave_addr);

/* Le a posicao do flutuador em milimetros (0..MAG_POS_MAX_MM).
 * Satura em MAG_POS_MAX_MM se o sensor reportar acima da faixa. */
mag_status_t mag_read_position_mm(uint16_t *out_mm);

/* Le a temperatura em decimos de grau Celsius. */
mag_status_t mag_read_temperature_c10(int16_t *out_c10);

/* Le o registrador de diagnostico. */
mag_status_t mag_read_status(uint16_t *out_status);

#ifdef __cplusplus
}
#endif

#endif /* MAG_SENSOR_H */
