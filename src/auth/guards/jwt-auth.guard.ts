import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private dataSource: DataSource,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tokenString = request.headers.authorization?.replace('Bearer ', '');

    // Check if it's a Sanctum token
    if (tokenString && tokenString.includes('|')) {
      return this.validateSanctumToken(request, tokenString);
    }

    // Default JWT Logic
    const parentCanActivate = super.canActivate(context);
    if (parentCanActivate instanceof Promise) {
      return parentCanActivate;
    }
    // If it's an observable or boolean, we return it directly, 
    // though usually AuthGuard returns Promise or Observable.
    return parentCanActivate as any;
  }

  private async validateSanctumToken(
    request: any,
    tokenString: string,
  ): Promise<boolean> {
    const [id, token] = tokenString.split('|');
    if (!id || !token) throw new UnauthorizedException();

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const tokens = await this.dataSource.query(
      'SELECT * FROM personal_access_tokens WHERE id = ? AND token = ? LIMIT 1',
      [id, hashedToken],
    );

    if (!tokens || tokens.length === 0) {
      throw new UnauthorizedException();
    }

    const tokenRecord = tokens[0];

    const users = await this.dataSource.query(
      'SELECT * FROM users WHERE id = ? LIMIT 1',
      [tokenRecord.tokenable_id],
    );

    if (!users || users.length === 0) {
      throw new UnauthorizedException();
    }

    const user = users[0];
    request.user = {
      userId: user.id,
      companyId: user.company_id,
      email: user.email,
      ...user,
    };

    return true;
  }
}

