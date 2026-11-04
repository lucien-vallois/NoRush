import { ValidationPipe } from '@nestjs/common';
import { CreateUserDto, LoginDto, RefreshTokenDto } from './auth.dto';

describe('Authentication input boundaries', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const validate = (value: unknown, metatype: any) =>
    pipe.transform(value, { type: 'body', metatype });
  it('normalizes email and strips unsupported fields', async () => {
    expect(
      await validate(
        { email: ' OPERATOR@EXAMPLE.TEST ', password: 'valid', role: 'admin' },
        LoginDto,
      ),
    ).toEqual({ email: 'operator@example.test', password: 'valid' });
  });
  it.each([
    { email: 'invalid', password: 'ok' },
    { email: 'a@b.test' },
    { email: 'a@b.test', password: 123 },
    { email: 'a@b.test', password: '' },
  ])('rejects malformed login %j', async (body) => {
    await expect(validate(body, LoginDto)).rejects.toMatchObject({
      status: 400,
    });
  });
  it('requires a bounded refresh token string', async () => {
    await expect(validate({}, RefreshTokenDto)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      validate({ refreshToken: 'x'.repeat(4097) }, RefreshTokenDto),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('rejects unknown roles and short passwords during user creation', async () => {
    await expect(
      validate(
        {
          email: 'a@b.test',
          name: 'Operator',
          password: 'short',
          role: 'root',
        },
        CreateUserDto,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      await validate(
        {
          email: 'a@b.test',
          name: 'Operator',
          password: 'long-enough-password',
          role: 'operator',
        },
        CreateUserDto,
      ),
    ).toBeInstanceOf(CreateUserDto);
  });
});
