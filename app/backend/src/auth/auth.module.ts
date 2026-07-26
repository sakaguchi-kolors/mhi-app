import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      // .env の JWT_SECRET を実行時(初期化時)に読む（本番は必ず十分に長い値へ差し替え）
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'mhi-dev-secret-change-me',
        signOptions: { expiresIn: '12h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // グローバルガード（Jwt → Roles の順で全ルートに適用）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
