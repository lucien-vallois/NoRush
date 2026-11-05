import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserTokenVersion1799000001000 implements MigrationInterface {
    name = 'AddUserTokenVersion1799000001000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Sessões revogáveis: o logout incrementa a versão e invalida os
        // tokens (access e refresh) emitidos com a versão anterior.
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "tokenVersion" integer NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "tokenVersion"`);
    }

}
