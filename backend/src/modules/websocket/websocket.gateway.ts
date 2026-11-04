import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { JwtService } from '@nestjs/jwt';

/**
 * Gateway WebSocket (socket.io) para push em tempo real ao frontend.
 * Compartilha o servidor HTTP do Nest (mesma porta da API).
 */
@WebSocketGateway({
  namespace: '/',
  cors: {
    origin: (origin, callback) => {
      const allowed = (
        process.env.CORS_ORIGIN ?? 'http://localhost:3001'
      ).split(',');
      callback(null, !origin || allowed.includes(origin));
    },
    credentials: true,
  },
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  private readonly logger = new Logger(WebsocketGateway.name);

  constructor(
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}

  @WebSocketServer()
  server: Server;

  afterInit(server: Server): void {
    server.use(async (client, next) => {
      try {
        const token = client.handshake.auth?.token;
        if (typeof token !== 'string')
          return next(new Error('Authentication required'));
        const user = await this.auth.validateToken(token);
        if (!user) return next(new Error('Invalid access token'));
        const claims = this.jwt.decode(token) as { exp: number };
        client.data.userId = user.id;
        client.data.expiresAt = claims.exp * 1000;
        next();
      } catch {
        next(new Error('Invalid access token'));
      }
    });
  }

  handleConnection(client: Socket): void {
    const remaining = client.data.expiresAt - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      client.disconnect(true);
      return;
    }
    client.data.expiryTimer = setTimeout(
      () => client.disconnect(true),
      Math.min(remaining, 2147483647),
    );
    this.logger.debug(`Cliente WebSocket conectado: ${client.id}`);
    client.emit('connected', {
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  }

  handleDisconnect(client: Socket): void {
    clearTimeout(client.data.expiryTimer);
    this.logger.debug(`Cliente WebSocket desconectado: ${client.id}`);
  }
}
