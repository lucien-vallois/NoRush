import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { resolveDbEnv } from './config/db-env';

// Mesmos arquivos .env que o backend lê; variáveis já definidas no ambiente
// têm precedência (loadEnvFile não sobrescreve).
for (const file of ['.env.local', '.env', '../.env']) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) process.loadEnvFile(path);
}

/**
 * DataSource da CLI do TypeORM (gerar e aplicar migrations). Usa as mesmas
 * variáveis do backend. Em produção a API aplica as migrations pendentes ao
 * iniciar (migrationsRun); esta configuração serve para rodá-las à mão:
 *
 *   npm run migration:run --workspace=backend        (código TypeScript)
 *   node ../node_modules/typeorm/cli.js migration:run -d dist/data-source.js   (imagem de produção, em /app/backend)
 */
export default new DataSource({
  type: 'postgres',
  ...resolveDbEnv((key) => process.env[key]),
  entities: [__dirname + '/entities/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});
