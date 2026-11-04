import { Global, Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { WsEmitterService } from './ws-emitter.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Módulo global: registra o gateway socket.io e expõe o WsEmitterService
 * para o restante da aplicação sem acoplamento entre módulos de domínio.
 */
@Global()
@Module({
  imports: [AuthModule],
  providers: [WebsocketGateway, WsEmitterService],
  exports: [WsEmitterService],
})
export class WebsocketModule {}
