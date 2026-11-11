import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  const authService = { authenticateAccessToken: jest.fn() };
  const requiredRoles = jest.fn();
  const reflector = { getAllAndOverride: requiredRoles } as unknown as Reflector;
  const context = (authorization?: string) => ({
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
    getHandler: () => ({}), getClass: () => ({}),
  }) as ExecutionContext;
  beforeEach(() => jest.resetAllMocks());

  it('rejects a missing token', async () => {
    await expect(new AuthGuard(authService as never, reflector).canActivate(context()))
      .rejects.toThrow(UnauthorizedException);
  });
  it('awaits live session validation', async () => {
    authService.authenticateAccessToken.mockResolvedValue({ roles: ['admin'] });
    await expect(new AuthGuard(authService as never, reflector).canActivate(context('Bearer test-token')))
      .resolves.toBe(true);
    expect(authService.authenticateAccessToken).toHaveBeenCalledWith('test-token');
  });
  it('rejects insufficient roles', async () => {
    authService.authenticateAccessToken.mockResolvedValue({ roles: ['employee'] });
    requiredRoles.mockReturnValue(['admin']);
    await expect(new AuthGuard(authService as never, reflector).canActivate(context('Bearer test-token')))
      .rejects.toThrow(ForbiddenException);
  });
  it('rejects revoked sessions', async () => {
    authService.authenticateAccessToken.mockRejectedValue(new UnauthorizedException());
    await expect(new AuthGuard(authService as never, reflector).canActivate(context('Bearer test-token')))
      .rejects.toThrow(UnauthorizedException);
  });
});
