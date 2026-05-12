import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      usernameField: 'employeeNo', // Menggunakan employeeNo sebagai pengganti username
    });
  }

  async validate(employeeNo: string, pass: string): Promise<any> {
    const user = await this.authService.validateUser(employeeNo, pass);
    if (!user) {
      throw new UnauthorizedException('NIP atau Password salah');
    }
    return user;
  }
}
