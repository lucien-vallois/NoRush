/*
 * Driver do radio LoRa SX1262 (Semtech).
 *
 * Camada de registradores, desacoplada da plataforma: as quatro funcoes
 * marcadas com SX1262_PLATFORM devem ser fornecidas pelo BSP (SPI, GPIO,
 * atraso e pino de busy). Ver src/bsp/stm32l4/hal_radio.adb para o binding
 * Ada que chama este driver.
 *
 * O uplink carrega o frame binario de 12 bytes definido em
 * firmware/docs/payload.md. A verificacao de tamanho (<= 19 bytes em DR0)
 * e' responsabilidade do chamador -- aqui apenas garantimos que o buffer
 * do SX1262 (256 bytes) nunca e' estourado.
 */
#ifndef SX1262_H
#define SX1262_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define SX1262_MAX_PAYLOAD   255u
#define SX1262_FIFO_SIZE     256u

/* --- Opcodes do SX1262 (subset usado) ------------------------------- */
#define SX1262_OP_SET_SLEEP            0x84u
#define SX1262_OP_SET_STANDBY          0x80u
#define SX1262_OP_SET_FS               0xC1u
#define SX1262_OP_SET_TX               0x83u
#define SX1262_OP_SET_RX               0x82u
#define SX1262_OP_SET_RF_FREQUENCY     0x86u
#define SX1262_OP_SET_PACKET_TYPE      0x8Au
#define SX1262_OP_SET_TX_PARAMS        0x8Eu
#define SX1262_OP_SET_MODULATION_PARAMS 0x8Bu
#define SX1262_OP_SET_PACKET_PARAMS    0x8Cu
#define SX1262_OP_SET_BUFFER_BASE_ADDR 0x8Fu
#define SX1262_OP_SET_DIO_IRQ_PARAMS   0x08u
#define SX1262_OP_GET_IRQ_STATUS       0x12u
#define SX1262_OP_CLEAR_IRQ_STATUS     0x02u
#define SX1262_OP_GET_STATUS           0xC0u
#define SX1262_OP_WRITE_BUFFER         0x0Eu
#define SX1262_OP_READ_BUFFER          0x1Eu
#define SX1262_OP_GET_PACKET_TYPE      0x11u
#define SX1262_OP_SET_DIO2_AS_RF_SW    0x9Du
#define SX1262_OP_SET_PA_CONFIG        0x95u
#define SX1262_OP_SET_REGULATOR_MODE   0x96u

/* --- IRQs ------------------------------------------------------------ */
#define SX1262_IRQ_TX_DONE             (1u << 0)
#define SX1262_IRQ_RX_DONE             (1u << 2)
#define SX1262_IRQ_CRC_ERROR           (1u << 6)
#define SX1262_IRQ_TIMEOUT             (1u << 8)
/* O registrador de IRQ e' lido como 16 bits (GET_IRQ_STATUS devolve 2 bytes). */
#define SX1262_IRQ_ALL                 0xFFFFu

/* --- Tipos ----------------------------------------------------------- */
typedef enum {
    SX1262_PACKET_TYPE_LORA = 0x01u
} sx1262_packet_type_t;

typedef enum {
    SX1262_STANDBY_RC   = 0x00u,
    SX1262_STANDBY_XOSC = 0x01u
} sx1262_standby_t;

typedef enum {
    SX1262_OK = 0,
    SX1262_ERR_SPI,
    SX1262_ERR_BUSY,
    SX1262_ERR_ARG,
    SX1262_ERR_TIMEOUT,
    SX1262_ERR_STATE
} sx1262_status_t;

/* Spreading factor: 5..12 */
typedef struct {
    uint8_t  sf;            /* 7..12 */
    uint8_t  bw_khz_log2;   /* 0=7.8 .. 6=500 ; 6 = 500 kHz = BW_500 */
    uint8_t  cr;            /* 1=4/5 .. 4=4/8 */
    bool     ldro;          /* low data rate optimize */
} sx1262_modparams_t;

typedef struct {
    uint8_t  preamble_len_msb;
    uint8_t  preamble_len_lsb;
    uint8_t  header_type;   /* 0x00 explicit, 0x01 implicit */
    uint8_t  payload_len;
    uint8_t  crc_on;        /* 0x00 off, 0x01 on */
    uint8_t  invert_iq;     /* 0x00 normal, 0x01 inverted */
} sx1262_pktparams_t;

typedef struct {
    uint32_t rf_freq_hz;
    int8_t   power_dbm;     /* -3..+22 */
    sx1262_modparams_t mod;
    sx1262_pktparams_t pkt;
} sx1262_config_t;

/* --- Hooks de plataforma (fornecidos pelo BSP) ---------------------- */
/* Todos devem ser implementados; nenhum pode bloquear por mais de 10 ms
 * alem do atraso solicitado. */
typedef struct {
    /* Transfere `len` bytes de `tx` para o chip e le `len` bytes em `rx`.
     * tx/rx podem ser NULL quando nao ha dados naquele sentido. */
    bool (*spi_transfer)(const uint8_t *tx, uint8_t *rx, size_t len);
    void (*set_nss)(bool level);
    void (*set_reset)(bool level);
    bool (*read_busy)(void);
    void (*delay_ms)(uint32_t ms);
    void (*delay_us)(uint32_t us);
} sx1262_platform_t;

/* --- API ------------------------------------------------------------- */

/* Inicializa o chip e aplica a configuracao. */
sx1262_status_t sx1262_init(const sx1262_platform_t *plat,
                            const sx1262_config_t   *cfg);

/* Entra em standby (RC). */
sx1262_status_t sx1262_set_standby(sx1262_standby_t mode);

/* Entra em sleep (consumo minimo; exige re-init apos acordar). */
sx1262_status_t sx1262_set_sleep(void);

/* Grava `len` bytes no FIFO e transmite.
 * Pre-condicao: len <= SX1262_MAX_PAYLOAD. */
sx1262_status_t sx1262_send(const uint8_t *data, uint8_t len);

/* Recebe por uma janela de `timeout_ms`. Devolve SX1262_ERR_TIMEOUT se
 * nenhum pacote chegou. `max_len` limita o buffer de saida. */
sx1262_status_t sx1262_receive(uint8_t  *data,
                               uint8_t  *len,
                               uint8_t   max_len,
                               uint32_t  timeout_ms);

/* Le o RSSI do ultimo pacote, em dBm. */
int16_t sx1262_last_rssi_dbm(void);

/* Le / limpa o registrador de IRQ. */
uint16_t sx1262_get_irq(void);
void     sx1262_clear_irq(uint16_t mask);

/* Estado do chip (byte GET_STATUS). */
uint8_t sx1262_get_status(void);

#ifdef __cplusplus
}
#endif

#endif /* SX1262_H */
