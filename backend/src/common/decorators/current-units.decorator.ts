import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type UnitPreference = 'metric' | 'imperial';

/**
 * Sistema de unidades do request (`?units=metric|imperial`), usado na
 * composição de mensagens de alerta. O padrão permanece métrico — o
 * armazenamento e os cálculos não mudam, só a borda de exibição.
 */
export const CurrentUnits = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UnitPreference => {
    const request = ctx.switchToHttp().getRequest();
    const raw = String(request.query?.units ?? 'metric').toLowerCase();
    return raw === 'imperial' ? 'imperial' : 'metric';
  },
);
