import { QueryFailedError } from 'typeorm';
import { I18nService } from './i18n.service';
import { QueryFailedFilter } from './query-failed.filter';
import { REQUEST_LANG_KEY } from './language.middleware';

describe('Database errors at the HTTP boundary', () => {
  const i18n = new I18nService();
  const filter = new QueryFailedFilter(i18n);
  beforeAll(() => i18n.onModuleInit());

  const run = (driverError: object, lang = 'pt-BR') => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          method: 'GET',
          url: '/sensors/x',
          [REQUEST_LANG_KEY]: lang,
        }),
      }),
    };
    filter.catch(
      new QueryFailedError('SELECT 1', [], driverError as Error),
      host as never,
    );
    return { status, body: json.mock.calls[0][0] };
  };

  it('answers 400 with a translated message for a malformed id', () => {
    const { status, body } = run({ code: '22P02' });
    expect(status).toHaveBeenCalledWith(400);
    expect(body).toMatchObject({
      code: 'invalidIdentifier',
      message: 'Identificador inválido na requisição',
    });
  });

  it('keeps other database failures a 500 without leaking SQL or driver text', () => {
    const { status, body } = run({
      code: '23503',
      message: 'insert violates foreign key "secret_constraint"',
    });
    expect(status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(body)).not.toMatch(/secret_constraint|SELECT/);
  });
});
