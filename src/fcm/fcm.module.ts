import { Module } from '@nestjs/common';
import { FCMService } from './fcm.service';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [TypeOrmModule],
    providers: [
        {
            provide: FCMService,
            useFactory: (configService: ConfigService, dataSource: any) => {
                return new FCMService(configService, dataSource);
            },
            inject: [ConfigService, 'DATA_SOURCE'],
        },
    ],
    exports: [FCMService],
})
export class FCMModule {}
