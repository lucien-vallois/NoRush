import { resolveDbEnv } from './db-env';

const from = (env: Record<string, string>) => resolveDbEnv((key) => env[key]);

describe('resolveDbEnv', () => {
  it('falls back to the local Docker Compose database', () => {
    expect(from({})).toEqual({
      host: 'localhost',
      port: 5432,
      username: 'flowback_user',
      password: 'secure_password',
      database: 'flowback_iot',
      ssl: false,
    });
  });

  it('reads DATABASE_URL (Railway, Neon, Supabase), decoding credentials', () => {
    expect(
      from({
        DATABASE_URL:
          'postgresql://norush:p%40ss%2Fword@db.internal:6543/norush_demo',
      }),
    ).toMatchObject({
      host: 'db.internal',
      port: 6543,
      username: 'norush',
      password: 'p@ss/word',
      database: 'norush_demo',
    });
  });

  it('keeps explicit DB_* values ahead of DATABASE_URL, field by field', () => {
    expect(
      from({
        DATABASE_URL: 'postgres://url_user:url_pass@url-host:5433/url_db',
        DB_HOST: 'explicit-host',
        DB_PASS: 'explicit-pass',
      }),
    ).toMatchObject({
      host: 'explicit-host',
      port: 5433,
      username: 'url_user',
      password: 'explicit-pass',
      database: 'url_db',
    });
  });

  it('uses the PG* variables when there is no URL', () => {
    expect(
      from({
        PGHOST: 'pg-host',
        PGPORT: '5544',
        PGUSER: 'pg_user',
        PGPASSWORD: 'pg_pass',
        PGDATABASE: 'pg_db',
      }),
    ).toMatchObject({
      host: 'pg-host',
      port: 5544,
      username: 'pg_user',
      password: 'pg_pass',
      database: 'pg_db',
    });
  });

  it('defaults the port to 5432 when the URL has none, and enables TLS only on DB_SSL=true', () => {
    expect(from({ DATABASE_URL: 'postgres://u:p@h/db' }).port).toBe(5432);
    expect(from({ DB_SSL: 'true' }).ssl).toEqual({ rejectUnauthorized: true });
    expect(from({ DB_SSL: 'false' }).ssl).toBe(false);
  });

  it('ignores empty variables instead of connecting with blank values', () => {
    expect(
      from({ DB_HOST: '', DATABASE_URL: 'postgres://u:p@url-host/db' }).host,
    ).toBe('url-host');
  });
});
