import { Injectable, Logger } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';

export interface WsMessage {
  type: string;
  payload: unknown;
  timestamp: string;
}

/**
 * Serviço injetável para emitir eventos WebSocket a partir de qualquer módulo.
 * O shape {type, payload, timestamp} acompanha o tipo WebSocketMessage do frontend.
 */
@Injectable()
export class WsEmitterService {
  private readonly logger = new Logger(WsEmitterService.name);

  constructor(private readonly gateway: WebsocketGateway) {}

  emit(event: string, payload: unknown): void {
    const message: WsMessage = {
      type: event,
      payload,
      timestamp: new Date().toISOString(),
    };
    this.gateway.server.emit(event, message);
    this.logger.debug(`Evento WS emitido: ${event}`);
  }

  emitReading(reading: {
    sensorId: string;
    tankId?: string;
    level: number;
    volume?: number;
    timestamp: Date | string;
  }): void {
    this.emit('reading', reading);
  }

  /**
   * `type` + `threshold` + `level` (+ `metadata` no caso preditivo) permitem
   * ao cliente compor a mensagem no idioma do usuário; `reason` é um texto
   * descritivo em inglês (língua base).
   */
  emitAlert(alert: {
    sensorId: string;
    tankId?: string;
    type?: string;
    reason?: string;
    level?: number;
    threshold?: number;
    timestamp: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.emit('alert', alert);
  }
}
