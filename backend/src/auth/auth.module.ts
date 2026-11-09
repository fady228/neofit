import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, Post, UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthUser, Me, Public } from '../common/auth.js';

class RegisterDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsIn(['ATHLETE', 'COACH']) role: 'ATHLETE' | 'COACH';
  @IsOptional() @Matches(/^[a-z0-9_]{3,20}$/) username?: string;
}
class LoginDto { @IsEmail() email: string; @IsString() password: string }

@Injectable()
export class AuthService {
  constructor(private db: PrismaService, private jwt: JwtService) {}
  private sign(u: { id: string; role: string }) {
    return this.jwt.signAsync({ sub: u.id, role: u.role }, { secret: process.env.JWT_SECRET, expiresIn: '30d' });
  }
  async register(d: RegisterDto) {
    const email = d.email.toLowerCase();
    if (await this.db.user.findUnique({ where: { email } })) throw new ConflictException('That email already has an account. Log in instead');
    const username = d.username ?? email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase().slice(0, 20);
    if (d.role === 'ATHLETE' && (await this.db.athleteProfile.findUnique({ where: { username } })))
      throw new ConflictException('That username is taken. Choose another');
    const user = await this.db.user.create({
      data: {
        email, role: d.role, authId: `local:${email}`, passwordHash: await bcrypt.hash(d.password, 10),
        ...(d.role === 'ATHLETE' ? { athlete: { create: { username } } } : { coach: { create: {} } }),
      },
    });
    return { token: await this.sign(user), user: { id: user.id, email, role: user.role } };
  }
  async login(d: LoginDto) {
    const user = await this.db.user.findUnique({ where: { email: d.email.toLowerCase() } });
    if (!user?.passwordHash || !(await bcrypt.compare(d.password, user.passwordHash)) || user.deletedAt)
      throw new UnauthorizedException('Email or password is incorrect');
    return { token: await this.sign(user), user: { id: user.id, email: user.email, role: user.role } };
  }
  async me(id: string) {
    const u = await this.db.user.findUnique({ where: { id }, include: { athlete: true, coach: true } });
    if (!u) throw new BadRequestException('Account not found');
    const { passwordHash, authId, ...safe } = u;
    return safe;
  }
}

@Controller()
export class AuthController {
  constructor(private s: AuthService) {}
  @Public() @Post('auth/register') register(@Body() d: RegisterDto) { return this.s.register(d); }
  @Public() @Post('auth/login') login(@Body() d: LoginDto) { return this.s.login(d); }
  @Get('me') me(@Me() u: AuthUser) { return this.s.me(u.id); }
}

@Module({ imports: [JwtModule.register({})], controllers: [AuthController], providers: [AuthService], exports: [JwtModule] })
export class AuthModule {}
