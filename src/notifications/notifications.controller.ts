import { Controller, Post, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SanctumGuard } from '../auth/guards/sanctum.guard';

@Controller('push')
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Post('subscribe')
    @UseGuards(SanctumGuard)
    @HttpCode(HttpStatus.OK)
    async subscribe(@Request() req, @Body() body: { fcm_token: string, device_type: string, device_id?: string }) {
        await this.notificationsService.subscribeToPush(req.user.id, body);
        return {
            success: true,
            message: 'Subscribed to push notifications successfully',
            payload: null,
            status: 200
        };
    }

    @Post('unsubscribe')
    @UseGuards(SanctumGuard)
    @HttpCode(HttpStatus.OK)
    async unsubscribe(@Request() req, @Body() body: { fcm_token: string }) {
        await this.notificationsService.unsubscribeFromPush(req.user.id, body.fcm_token);
        return {
            success: true,
            message: 'Unsubscribed from push notifications successfully',
            payload: null,
            status: 200
        };
    }
}
