/**
 * Cria o primeiro administrador de uma instalação de produção (sem o seed
 * de demonstração). A senha vem só de variável de ambiente, para não ficar
 * no histórico do shell.
 *
 *   NORUSH_ADMIN_PASSWORD='...' npm run admin:create --workspace=backend -- --email ops@empresa.com --name "Ops Lead"
 *   (imagem de produção)  NORUSH_ADMIN_PASSWORD='...' node dist/scripts/create-admin.js --email ... --name ...
 *
 * --reset troca a senha e garante o papel admin de um usuário que já existe.
 */
import { parseArgs } from 'node:util';
import * as bcrypt from 'bcrypt';
import dataSource from '../data-source';
import { User, UserRole } from '../entities/user.entity';

const MIN_PASSWORD = 12;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      reset: { type: 'boolean', default: false },
    },
  });
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim() || 'Administrator';
  const password = process.env.NORUSH_ADMIN_PASSWORD ?? '';

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Use --email <address> (a valid e-mail).');
    return 1;
  }
  if (password.length < MIN_PASSWORD) {
    console.error(
      `Set NORUSH_ADMIN_PASSWORD with at least ${MIN_PASSWORD} characters.`,
    );
    return 1;
  }

  await dataSource.initialize();
  try {
    const pending = await dataSource.showMigrations();
    if (pending) {
      console.error(
        'The database has pending migrations. Start the API once (it applies them) or run migration:run first.',
      );
      return 1;
    }
    const users = dataSource.getRepository(User);
    const existing = await users.findOne({ where: { email } });
    const passwordHash = await bcrypt.hash(password, 12);
    if (existing && !values.reset) {
      console.error(
        `User ${email} already exists. Use --reset to set a new password and make it admin.`,
      );
      return 1;
    }
    if (existing) {
      await users.update(existing.id, {
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
      });
      console.log(`Updated ${email}: role admin, new password set.`);
    } else {
      await users.save(
        users.create({
          email,
          name,
          passwordHash,
          role: UserRole.ADMIN,
          isActive: true,
        }),
      );
      console.log(`Created admin ${email}.`);
    }
    return 0;
  } finally {
    await dataSource.destroy();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('create-admin failed:', err?.message ?? err);
    process.exit(1);
  },
);
