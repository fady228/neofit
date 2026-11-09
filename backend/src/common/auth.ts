import { CanActivate, createParamDecorator, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

export const Public = () => SetMetadata('isPublic', true);
export interface AuthUser { id: string; role: 'ATHLETE' | 'COACH' | 'ADMIN' }
export const Me = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>('isPublic', [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const token = (req.headers.authorization as string | undefined)?.replace(/^Bearer /, '');
    if (!token) throw new UnauthorizedException('Sign in to continue');
    try {
      const p = await this.jwt.verifyAsync(token, { secret: process.env.JWT_SECRET });
      req.user = { id: p.sub, role: p.role } as AuthUser;
      return true;
    } catch {
      throw new UnauthorizedException('Your session expired. Sign in again');
    }
  }
}
