import { JwtService } from '@nestjs/jwt';
import { WebsocketGateway } from './websocket.gateway';

describe('Authenticated realtime channel', () => {
  const auth = { validateToken: jest.fn() };
  const jwt = new JwtService({ secret: 'test-secret' });
  let middleware: (socket: any, next: (error?: Error) => void) => Promise<void>;
  let gateway: WebsocketGateway;
  beforeEach(() => {
    jest.useFakeTimers();
    auth.validateToken.mockReset();
    gateway = new WebsocketGateway(auth as never, jwt);
    gateway.afterInit({
      use: (fn: typeof middleware) => {
        middleware = fn;
      },
    } as never);
  });
  afterEach(() => jest.useRealTimers());
  it('rejects anonymous clients before they can receive broadcasts', async () => {
    const next = jest.fn();
    await middleware({ handshake: { auth: {} } }, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(auth.validateToken).not.toHaveBeenCalled();
  });
  it('rejects invalid or deactivated sessions', async () => {
    auth.validateToken.mockResolvedValue(null);
    const next = jest.fn();
    await middleware({ handshake: { auth: { token: 'invalid' } } }, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
  it('accepts a valid session and disconnects it when its token expires', async () => {
    auth.validateToken.mockResolvedValue({ id: 'user-1' });
    const token = jwt.sign({ sub: 'user-1' }, { expiresIn: 60 });
    const socket = {
      handshake: { auth: { token } },
      data: {},
      id: 'socket-1',
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
    const next = jest.fn();
    await middleware(socket, next);
    expect(next).toHaveBeenCalledWith();
    gateway.handleConnection(socket as never);
    expect(socket.emit).toHaveBeenCalledWith(
      'connected',
      expect.objectContaining({ status: 'ok' }),
    );
    jest.advanceTimersByTime(60000);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    gateway.handleDisconnect(socket as never);
  });
  it('refuses connections without a finite expiration', () => {
    const socket = { data: {}, disconnect: jest.fn() };
    gateway.handleConnection(socket as never);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
});
