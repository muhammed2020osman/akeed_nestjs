import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import databaseConfig from '../config/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [databaseConfig],
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.database'),
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        synchronize: configService.get<boolean>('database.synchronize'),
        logging: configService.get<boolean>('database.logging'),
        extra: {
          connectionLimit: 10,
          connectTimeout: 60000,
          acquireTimeout: 60000,
          timeout: 60000,
          enableKeepAlive: true,
          keepAliveInitialDelay: 0,
        },
        poolSize: 10,
        connectorPackage: 'mysql2',
        maxQueryExecutionTime: 30000,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule { }

