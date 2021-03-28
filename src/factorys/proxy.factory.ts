import { ConfigService } from '@nestjs/config';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';

export const getServerlessProxy = () => {
  return {
    provide: 'serverlessProxyFactory',
    useFactory: (configService: ConfigService) => {
      const guestUrls = [`amqp://${configService.get('RABBIT_USER')}:${configService.get('RABBITMQ_PASSWORD')}@${configService.get('RABBIT_HOST')}:5672`];
      return ClientProxyFactory.create({
        transport: Transport.RMQ,
        options: {
          urls: guestUrls,
          queue: 'microfunctions_serverless',
          queueOptions: {
            durable: true,
          },
        },
      });
    },
    inject: [ConfigService],
  };
};
export const getClusterProxyFactory = () => {
  return {
    provide: 'clusterProxy',
    useFactory: (configService: ConfigService) => {
      const guestUrls = [`amqp://${configService.get('RABBIT_USER')}:${configService.get('RABBITMQ_PASSWORD')}@${configService.get('RABBIT_HOST')}:5672`];
      return ClientProxyFactory.create({
        transport: Transport.RMQ,
        options: {
          urls: guestUrls,
          queue: 'microfunctions_cluster',
          queueOptions: {
            durable: true,
          },
        },
      });
    },
    inject: [ConfigService],
  };
};
