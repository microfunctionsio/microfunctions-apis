import {HttpModule, Module} from '@nestjs/common';
import {KubernetesService} from './services/kubernetes.service';

import {NamespaceService} from './services/namespace.service';
import {FunctionsService} from './services/functions.service';
import {ServerlessServices} from './services/serverless.services';
import {MicroFunctionController} from './controllers/micro.function.controller';
import winston from 'winston';

import {utilities as nestWinstonModuleUtilities, WinstonModule} from 'nest-winston';
import {ClusterService} from './services/cluster.service';

import {ConfigModule, ConfigService} from '@nestjs/config';

import {Namespace, NamespaceSchema} from './entitys/namespace';
import {Functions, FunctionsSchema} from './entitys/function';
import {SourceCode, SourceCodeSchema} from './entitys/sourceCode';
import {getClusterProxyFactory, getServerlessProxy} from './factorys/proxy.factory';
import {TerminusModule} from "@nestjs/terminus";
import {HealthModule} from "./health/health.module";
import {MongooseModule} from '@nestjs/mongoose';

const {
    combine,
} = winston.format;

console.log(process.env.NODE_ENV)

@Module({
    providers: [
        KubernetesService,
        NamespaceService,
        FunctionsService,
        ServerlessServices,
        ClusterService,
        getServerlessProxy(), getClusterProxyFactory()
    ],
    imports: [
        TerminusModule,
        HealthModule,
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: `./config.${process.env.NODE_ENV}.env`,
        }),

        MongooseModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => {
                const uri: string = `mongodb://${configService.get('MONGODB_USERNAME')}:${configService.get('MONGODB_PASSWORD')}@${configService.get('MONGODB_HOST')}:27017/${configService.get('MONGODB_DB')}`;
                return {
                    uri,
                    useNewUrlParser: true,
                    useCreateIndex: true,
                    useFindAndModify: false,
                    useUnifiedTopology: false,
                    reconnectTries: Number.MAX_VALUE, // Never stop trying to reconnect
                    reconnectInterval: 1000, // Reconnect every 500ms
                    bufferMaxEntries: 0,
                    connectTimeoutMS: 20000,
                    socketTimeoutMS: 45000,
                    connectionFactory: (connection) => {
                        connection.plugin(require('mongoose-timestamp'));
                        return connection;
                    }
                }
            },
            inject: [ConfigService],
        }),
        MongooseModule.forFeature([{name: Namespace.name, schema: NamespaceSchema},
            {name: Functions.name, schema: FunctionsSchema},
            {name: SourceCode.name, schema: SourceCodeSchema}]),
        WinstonModule.forRootAsync({
            useFactory: () => ({
                // options
                format: combine(
                    winston.format.timestamp(),
                    nestWinstonModuleUtilities.format.nestLike(),
                ),
                transports: [
                    new winston.transports.Console({level: 'error'}),
                    new winston.transports.Console({level: 'debug'}),
                ],
                exceptionHandlers: [
                    new winston.transports.Console({level: 'error'}),
                ],
            }),
            inject: [],
        }),
        HttpModule,
    ],
    exports: [],
    controllers: [MicroFunctionController],
})
export class MicrofunctionsModule {
}
