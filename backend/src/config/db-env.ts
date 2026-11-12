export interface DbEnv {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: false | { rejectUnauthorized: boolean };
}

/**
 * Resolve as variáveis de conexão com precedência:
 * DB_* explícito > DATABASE_URL (Railway/Neon/Supabase) > PG* (plugin Postgres
 * do Railway) > padrão local. A mesma resolução é usada pela API e pela CLI
 * do TypeORM para que apontem sempre para o mesmo banco.
 */
export function resolveDbEnv(get: (key: string) => string | undefined): DbEnv {
  const val = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = get(key);
      if (value) return value;
    }
    return undefined;
  };

  const rawUrl = val('DATABASE_URL');
  const url = rawUrl ? new URL(rawUrl) : undefined;

  const host = val('DB_HOST') ?? url?.hostname ?? val('PGHOST') ?? 'localhost';
  const portRaw =
    val('DB_PORT') ?? (url?.port || undefined) ?? val('PGPORT') ?? undefined;
  const username =
    val('DB_USER') ??
    (url?.username ? decodeURIComponent(url.username) : undefined) ??
    val('PGUSER') ??
    'flowback_user';
  const password =
    val('DB_PASS') ??
    (url?.password ? decodeURIComponent(url.password) : undefined) ??
    val('PGPASSWORD') ??
    'secure_password';
  const database =
    val('DB_NAME') ??
    (url?.pathname ? url.pathname.replace(/^\//, '') : undefined) ??
    val('PGDATABASE') ??
    'flowback_iot';

  return {
    host,
    port: portRaw ? Number(portRaw) : 5432,
    username,
    password,
    database,
    ssl: val('DB_SSL') === 'true' ? { rejectUnauthorized: true } : false,
  };
}
