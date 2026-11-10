import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  const authService = {
    verifyAccessToken: jest.fn(),
  };
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const createContext = (authorization?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: authorization ? { authorization } : {},
          header: () => undefined,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as ExecutionContext;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('throws unauthorized when token is missing', () => {
    const guard = new AuthGuard(authService as never, reflector);
    expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException);
  });

  it('allows access when token valid and no roles required', () => {
    authService.verifyAccessToken.mockReturnValue({
      sub: 'u1',
      email: 'a@a.com',
      companyId: 'c1',
      roles: ['admin'],
    });
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    const guard = new AuthGuard(authService as never, reflector);
    expect(guard.canActivate(createContext('Bearer token'))).toBe(true);
  });

  it('throws forbidden when role requirement is not met', () => {
    authService.verifyAccessToken.mockReturnValue({
      sub: 'u1',
      email: 'a@a.com',
      companyId: 'c1',
      roles: ['viewer'],
    });
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['admin']);
    const guard = new AuthGuard(authService as never, reflector);
    expect(() => guard.canActivate(createContext('Bearer token'))).toThrow(ForbiddenException);
  });
});
