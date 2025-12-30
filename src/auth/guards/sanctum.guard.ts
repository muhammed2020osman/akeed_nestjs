import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';

@Injectable()
export class SanctumGuard implements CanActivate {
    constructor(private dataSource: DataSource) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.warn('[SanctumGuard] Missing or invalid Authorization header');
            throw new UnauthorizedException('Missing or invalid Authorization header');
        }

        const token = authHeader.substring(7);
        console.log(`[SanctumGuard] Checking token: ${token.substring(0, 10)}...`);
        const user = await this.verifySanctumToken(token);

        if (!user) {
            console.error('[SanctumGuard] Invalid Sanctum token');
            throw new UnauthorizedException('Invalid Sanctum token');
        }

        console.log(`[SanctumGuard] User ${user.userId} verified`);
        request.user = user;
        return true;
    }

    private async verifySanctumToken(token: string): Promise<any> {
        if (!token.includes('|')) return null;

        const [id, tokenVal] = token.split('|');
        if (!id || !tokenVal) return null;

        const hashedToken = crypto.createHash('sha256').update(tokenVal).digest('hex');

        const tokens = await this.dataSource.query(
            'SELECT * FROM personal_access_tokens WHERE id = ? AND token = ? LIMIT 1',
            [id, hashedToken],
        );

        if (!tokens || tokens.length === 0) {
            return null;
        }

        const tokenRecord = tokens[0];

        const users = await this.dataSource.query(
            'SELECT * FROM users WHERE id = ? LIMIT 1',
            [tokenRecord.tokenable_id],
        );

        if (!users || users.length === 0) {
            return null;
        }

        const user = users[0];
        return {
            id: user.id,
            userId: user.id,
            companyId: user.company_id,
            email: user.email,
            name: user.name,
        };
    }
}
