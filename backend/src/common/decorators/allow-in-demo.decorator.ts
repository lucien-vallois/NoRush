import { SetMetadata } from '@nestjs/common';

export const ALLOW_IN_DEMO_KEY = 'allowInDemo';

/**
 * Keeps a write route open when DEMO_READ_ONLY=true: actions a visitor of
 * the public demo may take without changing the setup for everyone else
 * (signing out, acknowledging and resolving alerts).
 */
export const AllowInDemo = () => SetMetadata(ALLOW_IN_DEMO_KEY, true);
