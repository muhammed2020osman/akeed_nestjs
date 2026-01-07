import { Module } from '@nestjs/common';
import { FCMService } from './fcm.service';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [ConfigModule, TypeOrmModule],
    providers: [FCMService],
    exports: [FCMService],
})
export class FCMModule { }
