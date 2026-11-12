import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * A signed-out session. Access and refresh tokens carry the session id
 * (`sid`); once it is listed here they are refused, while the user's other
 * sessions (another browser, another person on a shared demo account) stay
 * signed in. Rows are useless after `expiresAt` and are purged hourly.
 */
@Entity('revoked_sessions')
export class RevokedSession {
  @PrimaryColumn('uuid')
  sid: string;

  @Column('uuid')
  userId: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  revokedAt: Date;

  /** When the session's last refresh token expires anyway. */
  @Index()
  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
