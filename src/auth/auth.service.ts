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

  async validateUser(employeeNo: string, pass: string): Promise<any> {
    // 1. Cari user berdasarkan employeeNo
    const user = await this.prisma.employee.findUnique({
      where: { employeeNo },
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
    // 4. Buat payload untuk JWT termasuk employeeNo dan Role
    const payload = { 
      sub: user.employeeNo, 
      employeeNo: user.employeeNo, 
      role: user.userTypeEmployee 
    };

    // 5. Kembalikan access_token
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
