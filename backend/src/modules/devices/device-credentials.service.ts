import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { Sensor } from '../../entities/sensor.entity';

/**
 * Modos de autenticação da ingestão de telemetria (IOT_AUTH_MODE):
 * - `shared`: chave compartilhada IOT_INGEST_KEY no payload (comportamento
 *   histórico, usado pela demonstração e pelo simulador).
 * - `device`: credencial individual por dispositivo (sha256 do secret
 *   provisionado em /devices). Exigida mesmo fora de produção.
 * - `hybrid`: aceita credencial do dispositivo OU a chave compartilhada —
 *   janela útil durante a migração da frota.
 */
export type IotAuthMode = 'shared' | 'device' | 'hybrid';

export const DEVICE_SECRET_PREFIX = 'nrk_';

export type CredentialCheck =
  | { ok: true }
  | { ok: false; code: 'invalidIngestCredential' | 'invalidDeviceCredential' | 'deviceNotProvisioned' };

@Injectable()
export class DeviceCredentialsService {
  constructor(private configService: ConfigService) {}

  get authMode(): IotAuthMode {
    const mode = this.configService.get<string>('IOT_AUTH_MODE', 'shared');
    return mode === 'device' || mode === 'hybrid' ? mode : 'shared';
  }

  /** Gera um secret novo; o hash é o que persiste, o secret só aparece uma vez. */
  generateSecret(): { secret: string; hash: string } {
    const secret = `${DEVICE_SECRET_PREFIX}${randomBytes(32).toString('base64url')}`;
    return { secret, hash: this.hashSecret(secret) };
  }

  hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  /** timingSafeEqual exige buffers de mesmo tamanho; hex sha256 tem 64 bytes. */
  private safeEqualHex(a: string, b: string): boolean {
    if (!a || !b || a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  }

  private matchesDeviceCredential(
    sensor: Sensor | null,
    authToken: string | undefined,
  ): boolean {
    return (
      !!sensor?.credentialHash &&
      !!authToken &&
      this.safeEqualHex(sensor.credentialHash, this.hashSecret(authToken))
    );
  }

  private matchesSharedKey(
    authToken: string | undefined,
  ): boolean {
    const key = this.configService.get<string>('IOT_INGEST_KEY');
    if (!key || !authToken) return false;
    const a = createHash('sha256').update(key).digest();
    const b = createHash('sha256').update(authToken).digest();
    return timingSafeEqual(a, b);
  }

  /**
   * Autentica uma mensagem (telemetria ou heartbeat) conforme o modo
   * configurado. `sensor` deve carregar credentialHash (addSelect) nos
   * modos device/hybrid; em `shared` o sensor pode ser nulo.
   */
  authenticate(
    sensor: Sensor | null,
    authToken: string | undefined,
  ): CredentialCheck {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    const sharedKey = this.configService.get<string>('IOT_INGEST_KEY');

    switch (this.authMode) {
      case 'shared': {
        // Comportamento histórico: sem chave configurada e fora de produção,
        // a ingestão local fica aberta para facilitar o bring-up.
        if (!sharedKey && !isProduction) return { ok: true };
        return this.matchesSharedKey(authToken)
          ? { ok: true }
          : { ok: false, code: 'invalidIngestCredential' };
      }
      case 'device': {
        if (this.matchesDeviceCredential(sensor, authToken)) return { ok: true };
        return {
          ok: false,
          code: sensor?.credentialHash
            ? 'invalidDeviceCredential'
            : 'deviceNotProvisioned',
        };
      }
      case 'hybrid': {
        if (this.matchesDeviceCredential(sensor, authToken)) return { ok: true };
        if (this.matchesSharedKey(authToken)) return { ok: true };
        if (!sharedKey && !isProduction && !authToken) return { ok: true };
        return { ok: false, code: 'invalidIngestCredential' };
      }
    }
  }
}
