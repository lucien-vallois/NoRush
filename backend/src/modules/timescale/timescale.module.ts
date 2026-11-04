import { Module } from '@nestjs/common';
import { TimescaleService } from './timescale.service';

/**
 * Configura o TimescaleDB no boot (hypertable, agregados contínuos e
 * políticas). Deve ser importado DEPOIS do TypeOrmModule no AppModule para
 * que o synchronize (criação da tabela readings) rode primeiro.
 */
@Module({
  providers: [TimescaleService],
  exports: [TimescaleService],
})
export class TimescaleModule {}
