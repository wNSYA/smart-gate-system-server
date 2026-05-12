import { Controller, Post, UseGuards, Request, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // 1. Endpoint Login: Menggunakan LocalAuthGuard untuk memicu LocalStrategy
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req) {
    // req.user akan otomatis terisi oleh Passport setelah validasi di LocalStrategy sukses
    return this.authService.login(req.user);
  }

  // 2. Endpoint Profil (Contoh Proteksi): Menggunakan JwtAuthGuard
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    // req.user berisi data dari payload JWT (id, nip, role)
    return req.user;
  }
}
