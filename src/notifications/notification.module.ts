import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { FCMModule } from '../fcm/fcm.module';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [FCMModule, TypeOrmModule],
    providers: [NotificationService],
    exports: [NotificationService],
})
export class NotificationModule {}
