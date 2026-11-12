import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRevokedSessions1799000002000 implements MigrationInterface {
    name = 'AddRevokedSessions1799000002000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Per-session sign-out: logout lists the token's session id here
        // instead of bumping the user's token version, so it no longer ends
        // the user's other sessions.
        await queryRunner.query(`CREATE TABLE "revoked_sessions" ("sid" uuid NOT NULL, "userId" uuid NOT NULL, "revokedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_revoked_sessions_sid" PRIMARY KEY ("sid"))`);
        await queryRunner.query(`CREATE INDEX "IDX_revoked_sessions_expiresAt" ON "revoked_sessions" ("expiresAt") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_revoked_sessions_expiresAt"`);
        await queryRunner.query(`DROP TABLE "revoked_sessions"`);
    }

}
