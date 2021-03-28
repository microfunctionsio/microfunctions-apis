
import { Observable, of } from 'rxjs';
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { FunctionsDto } from '../dtos/functions.dto';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { catchError } from 'rxjs/operators';
import { Serverless } from '../interfaces/serverless';

@Injectable()
export class ServerlessServices {
  constructor(
    @Inject('serverlessProxyFactory') private readonly clientProxy: ClientProxy,
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
  ) {}

  deployFunction(serverless: Serverless,kubeConfig:string): Observable<any> {
    const pattern = { cmd: 'deployFunction' };
    return this.clientProxy.send(pattern,Object.assign(serverless,{kubeConfig}) );
  }
}
