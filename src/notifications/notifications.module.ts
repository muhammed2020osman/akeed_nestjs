import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [ConfigModule],
    providers: [NotificationsService],
    exports: [NotificationsService],
})
export class NotificationsModule { }
