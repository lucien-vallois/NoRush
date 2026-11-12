import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1793784686236 implements MigrationInterface {
  name = 'InitialSchema1793784686236';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // uuid_generate_v4() vem da extensão uuid-ossp (o synchronize a criava sozinho)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'operator', 'maintenance')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "name" character varying NOT NULL, "passwordHash" character varying(255) NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'operator', "isActive" boolean NOT NULL DEFAULT true, "lastLoginAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "readings" ("id" uuid NOT NULL, "sensorId" uuid NOT NULL, "level" numeric(6,3) NOT NULL, "volume" numeric(10,3), "oilWaterInterface" jsonb, "metadata" jsonb, "quality" numeric(5,2), "isCalibrated" boolean NOT NULL DEFAULT false, "isProcessed" boolean NOT NULL DEFAULT false, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "processedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3303680d190b0e4229e686dcc2c" PRIMARY KEY ("id", "timestamp"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0d96f30d235e2ea4a3a5fad237" ON "readings" ("timestamp") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_307767e753900b5420ceee4a3d" ON "readings" ("sensorId", "timestamp") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."sensors_type_enum" AS ENUM('magnetostrictive', 'radar_level', 'float_switch', 'ultrasonic', 'pressure', 'capacitive')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."sensors_protocol_enum" AS ENUM('mqtt', 'http', 'modbus', 'lorawan')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."sensors_status_enum" AS ENUM('active', 'inactive', 'maintenance', 'error', 'offline')`,
    );
    await queryRunner.query(
      `CREATE TABLE "sensors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sensorId" character varying NOT NULL, "name" character varying NOT NULL, "type" "public"."sensors_type_enum" NOT NULL DEFAULT 'magnetostrictive', "protocol" "public"."sensors_protocol_enum" NOT NULL DEFAULT 'mqtt', "model" character varying, "manufacturer" character varying, "firmwareVersion" character varying, "tankId" uuid NOT NULL, "status" "public"."sensors_status_enum" NOT NULL DEFAULT 'active', "batteryLevel" numeric(5,2), "batteryLastUpdate" TIMESTAMP, "powerVoltage" numeric(6,2), "measurementRangeMin" numeric(5,2), "measurementRangeMax" numeric(5,2), "accuracy" numeric(4,2), "lastTransmissionAt" TIMESTAMP, "transmissionCount" integer NOT NULL DEFAULT '0', "errorCount" integer NOT NULL DEFAULT '0', "lastErrorAt" TIMESTAMP, "lastErrorMessage" character varying, "configuration" jsonb, "credentialHash" character varying, "credentialVersion" integer NOT NULL DEFAULT '0', "credentialRotatedAt" TIMESTAMP, "installationDate" TIMESTAMP, "calibrationDate" TIMESTAMP, "nextCalibrationDate" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_19d463c2140196815c902e5b113" UNIQUE ("sensorId"), CONSTRAINT "PK_b8bd5fcfd700e39e96bcd9ba6b7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."alerts_type_enum" AS ENUM('high_level', 'low_level', 'overflow_risk', 'sensor_offline', 'battery_low', 'sensor_error', 'maintenance_due', 'calibration_due', 'communication_error', 'power_failure')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."alerts_severity_enum" AS ENUM('low', 'medium', 'high', 'critical')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."alerts_status_enum" AS ENUM('active', 'acknowledged', 'resolved', 'false_positive')`,
    );
    await queryRunner.query(
      `CREATE TABLE "alerts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tankId" uuid NOT NULL, "type" "public"."alerts_type_enum" NOT NULL, "severity" "public"."alerts_severity_enum" NOT NULL DEFAULT 'medium', "status" "public"."alerts_status_enum" NOT NULL DEFAULT 'active', "title" character varying NOT NULL, "message" text NOT NULL, "currentLevel" numeric(6,3), "currentVolume" numeric(10,3), "thresholdValue" numeric(6,3), "sensorId" uuid, "metadata" jsonb, "resolvedAt" TIMESTAMP, "resolvedById" uuid, "resolutionNotes" character varying, "acknowledgedAt" TIMESTAMP, "acknowledgedById" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_60f895662df096bfcdfab7f4b96" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8bb8f7c97396b99b57794c5999" ON "alerts" ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6822a26b2b821ef939b82fd0d0" ON "alerts" ("type", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_feca54c27ba1e725280631c941" ON "alerts" ("tankId", "status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tanks_status_enum" AS ENUM('active', 'maintenance', 'inactive', 'error')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tanks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "name" character varying NOT NULL, "description" character varying, "dimensions" jsonb NOT NULL, "arqueacaoTable" jsonb, "latitude" numeric(10,8) NOT NULL, "longitude" numeric(11,8) NOT NULL, "status" "public"."tanks_status_enum" NOT NULL DEFAULT 'active', "maxLevelThreshold" numeric(5,2), "minLevelThreshold" numeric(5,2), "overflowThreshold" numeric(5,2), "lowLevelThreshold" numeric(5,2), "installationDate" TIMESTAMP, "lastMaintenanceDate" TIMESTAMP, "nextMaintenanceDate" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_aa22385965bc241936d8b8cf4c4" UNIQUE ("code"), CONSTRAINT "PK_6f4aa0dd55c110e1ca7cac7b504" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "readings" ADD CONSTRAINT "FK_19636ed582569c8b41e6d95ff0f" FOREIGN KEY ("sensorId") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sensors" ADD CONSTRAINT "FK_30ab52fd70ee3b7692ead74e16e" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "alerts" ADD CONSTRAINT "FK_ddf34e490078bae76d424a54a1b" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "alerts" ADD CONSTRAINT "FK_69192176bfd5ea16d8a56993639" FOREIGN KEY ("sensorId") REFERENCES "sensors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "alerts" ADD CONSTRAINT "FK_2f2e48e39c9513c8916ba5170cb" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "alerts" ADD CONSTRAINT "FK_4c59d288c0d82cdf608bb2674cd" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "alerts" DROP CONSTRAINT "FK_4c59d288c0d82cdf608bb2674cd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "alerts" DROP CONSTRAINT "FK_2f2e48e39c9513c8916ba5170cb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "alerts" DROP CONSTRAINT "FK_69192176bfd5ea16d8a56993639"`,
    );
    await queryRunner.query(
      `ALTER TABLE "alerts" DROP CONSTRAINT "FK_ddf34e490078bae76d424a54a1b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sensors" DROP CONSTRAINT "FK_30ab52fd70ee3b7692ead74e16e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "readings" DROP CONSTRAINT "FK_19636ed582569c8b41e6d95ff0f"`,
    );
    await queryRunner.query(`DROP TABLE "tanks"`);
    await queryRunner.query(`DROP TYPE "public"."tanks_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_feca54c27ba1e725280631c941"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6822a26b2b821ef939b82fd0d0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8bb8f7c97396b99b57794c5999"`,
    );
    await queryRunner.query(`DROP TABLE "alerts"`);
    await queryRunner.query(`DROP TYPE "public"."alerts_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."alerts_severity_enum"`);
    await queryRunner.query(`DROP TYPE "public"."alerts_type_enum"`);
    await queryRunner.query(`DROP TABLE "sensors"`);
    await queryRunner.query(`DROP TYPE "public"."sensors_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."sensors_protocol_enum"`);
    await queryRunner.query(`DROP TYPE "public"."sensors_type_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_307767e753900b5420ceee4a3d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0d96f30d235e2ea4a3a5fad237"`,
    );
    await queryRunner.query(`DROP TABLE "readings"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
