import { Transform } from 'class-transformer';

/**
 * Query strings carry booleans as text: "?onlineOnly=true" arrives as the
 * string "true", which @IsBoolean() rejects. Converts "true"/"false" and
 * leaves anything else as is, so @IsBoolean() still refuses it with a 400.
 */
export const QueryBoolean = () =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  );
