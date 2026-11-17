export type TankLevelSensorQueryMode = 'forecast' | 'state';

const LEVEL_SENSOR_PRIORITY = `CASE s.type::text
         WHEN 'magnetostrictive' THEN 0
         WHEN 'radar_level' THEN 1
         WHEN 'ultrasonic' THEN 2
         WHEN 'pressure' THEN 3
         WHEN 'capacitive' THEN 4
         ELSE 9 END`;

export const tankLevelSensorSql = (
  where: string,
  mode: TankLevelSensorQueryMode = 'forecast',
): string => `SELECT * FROM (
     SELECT DISTINCT ON (t.id)
            t.id, t.code, t.name,
            t."maxLevelThreshold", t."overflowThreshold",
            t."minLevelThreshold", t."lowLevelThreshold",
            (t.dimensions->>'diameter')::numeric AS diameter,
            s.id AS sensor_uuid${
              mode === 'state'
                ? `,
            t.status, s.type::text AS sensor_type, s."lastTransmissionAt"`
                : ''
            }
     FROM tanks t
     ${mode === 'state' ? 'LEFT JOIN' : 'JOIN'} sensors s ON s."tankId" = t.id
                   AND s.type::text <> 'float_switch'
                   AND s.status = 'active'
     WHERE ${where}
     ORDER BY t.id, ${LEVEL_SENSOR_PRIORITY}, s."sensorId"
   ) picked
   ORDER BY code`;
