import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReadingMessageId1799000003000 implements MigrationInterface {
  name = 'AddReadingMessageId1799000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "readings" ADD "messageId" uuid`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_readings_sensor_message_timestamp" ON "readings" ("sensorId", "messageId", "timestamp")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_readings_sensor_message_timestamp"`,
    );
    await queryRunner.query(`ALTER TABLE "readings" DROP COLUMN "messageId"`);
  }
}
