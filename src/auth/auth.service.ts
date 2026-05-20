import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    // 1. Cari user berdasarkan username di tabel account
    const user = await this.prisma.account.findUnique({
      where: { username },
    });

    // 2. Jika user ditemukan, bandingkan password menggunakan bcrypt
    if (user && (await bcrypt.compare(pass, user.password))) {
      // 3. Kembalikan objek user TANPA password
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    // 4. Buat payload untuk JWT termasuk ID, Name, dan Username
    const payload = { 
      sub: user.id, 
      name: user.name,
      username: user.username
    };

    // 5. Kembalikan access_token
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
