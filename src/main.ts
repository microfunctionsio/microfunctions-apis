import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { MicrofunctionsModule } from './microfunctions.module';
import { ConfigService } from '@nestjs/config';


async function bootstrap() {

  const microFunctionApiModule = await NestFactory.create(MicrofunctionsModule);
  const configService:ConfigService = microFunctionApiModule.get(ConfigService)
  const guestUrls = [`amqp://${configService.get('RABBIT_USER')}:${configService.get('RABBITMQ_PASSWORD')}@${configService.get('RABBIT_HOST')}:5672`];
  microFunctionApiModule.connectMicroservice({
    transport: Transport.RMQ,
    options: {
      urls: guestUrls,
      queue: 'microfunctions_apis',
      queueOptions: {
        durable: true,
      },
    },
  });
  if(process.env.NODE_ENV !== 'local')
  {
    await microFunctionApiModule.listen(4000);
  }

  await microFunctionApiModule.startAllMicroservicesAsync();

}
bootstrap();
