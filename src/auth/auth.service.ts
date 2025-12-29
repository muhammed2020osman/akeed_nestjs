import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    // TODO: Replace with actual database query
    // const user = await this.usersService.findByEmail(email);
    // if (user && await bcrypt.compare(password, user.password)) {
    //   const { password, ...result } = user;
    //   return result;
    // }
    // return null;
    
    // Temporary mock for testing
    if (email === 'test@example.com' && password === 'password123') {
      return {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
      };
    }
    return null;
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
      token_type: 'Bearer',
      expires_in: this.configService.get<string>('jwt.expiresIn'),
    };
  }

  async register(registerDto: any) {
    // TODO: Replace with actual database query
    // const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    // const user = await this.usersService.create({
    //   ...registerDto,
    //   password: hashedPassword,
    // });
    // const { password, ...result } = user;
    // return result;
    
    // Temporary mock for testing
    return {
      id: 1,
      name: registerDto.name,
      email: registerDto.email,
    };
  }
}

