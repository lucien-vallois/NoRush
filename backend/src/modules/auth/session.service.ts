import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { RevokedSession } from '../../entities/revoked-session.entity';

/** Signed-out sessions, checked on every authenticated request. */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @InjectRepository(RevokedSession)
    private readonly revoked: Repository<RevokedSession>,
  ) {}

  async revoke(sid: string, userId: string, expiresAt: Date): Promise<void> {
    // Idempotent: signing out twice from the same session is not an error.
    await this.revoked.upsert({ sid, userId, expiresAt }, ['sid']);
  }

  async isRevoked(sid: string): Promise<boolean> {
    return (await this.revoked.count({ where: { sid } })) > 0;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpired(): Promise<void> {
    const { affected } = await this.revoked.delete({
      expiresAt: LessThan(new Date()),
    });
    if (affected) this.logger.debug(`Purged ${affected} expired sign-outs`);
  }
}
