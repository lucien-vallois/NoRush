import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

const contents = `# Local demonstration only. Generated secrets must not be committed.
NODE_ENV=development
API_PORT=3000
CORS_ORIGIN=http://localhost:3001,http://127.0.0.1:3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=flowback_iot
DB_USER=flowback_user
DB_PASS=secure_password
DB_SSL=false
JWT_SECRET=${randomBytes(48).toString("hex")}
JWT_REFRESH_SECRET=${randomBytes(48).toString("hex")}
JWT_EXPIRE=1h
JWT_REFRESH_EXPIRE=7d
IOT_INGEST_KEY=${randomBytes(32).toString("hex")}
MQTT_HOST=localhost
MQTT_PORT=1883
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=flowback
RABBITMQ_PASS=flowback_dev
SIM_INTERVAL=5000
SIM_DURATION=300000
SIM_SPEED=60
`;
try {
  await writeFile(new URL("../.env", import.meta.url), contents, {
    flag: "wx",
  });
  console.log(
    "Created .env with unique access, refresh and ingestion secrets. Existing database data was preserved.",
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log(
    "Existing .env preserved. Compare required settings with env.example.",
  );
}
