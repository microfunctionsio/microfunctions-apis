import { Controller, UseInterceptors } from '@nestjs/common';
import { NamespaceDto } from '../dtos/namespace.dto';
import { GetUser } from '../decorators/get-user.decorator';
import { NamespaceService } from '../services/namespace.service';

import { MessagePattern, Payload } from '@nestjs/microservices';
import { User } from '../interfaces/user';
import {ErrorsMicroFunctionInterceptor} from '../interceptors/errors.interceptor';
import { FunctionsService } from '../services/functions.service';
import { FunctionsDto } from '../dtos/functions.dto';

@Controller()
@UseInterceptors(new ErrorsMicroFunctionInterceptor())
export class MicroFunctionController {
  constructor(
    private namespaceService: NamespaceService,
    private functionService: FunctionsService
  ) {}

  @MessagePattern({ cmd: 'post-function' })
  createFunction(@Payload() functionDto: FunctionsDto, @GetUser() user: User) {
    return this.functionService.createFunction(user, functionDto);
  }

  @MessagePattern({ cmd: 'put-function' })
  updateFunction(@Payload() functionDto: FunctionsDto, @GetUser() user: User) {
    return this.functionService.updateFunction(user, functionDto);
  }


  @MessagePattern({ cmd: 'get-function' })
  getFunction(@GetUser() user: User, @Payload() functions: any) {
    return this.functionService.getFunction(user, functions);
  }

  @MessagePattern({ cmd: 'delete-function' })
  deleteFunction(@GetUser() user: User, @Payload() functions: any) {
    return this.functionService.deleteFunction(user, functions);
  }

  @MessagePattern({ cmd: 'get-functions' })
  getFunctions(@GetUser() user: User, @Payload() functions: any) {
    return this.functionService.getFunctions(user, functions);
  }

  @MessagePattern({ cmd: 'get-functions-status' })
  getFunctionStatus(@GetUser() user: User, @Payload() functions: any) {
    return this.functionService.getFunctionStatus(user, functions);
  }

  @MessagePattern({ cmd: 'put-functions-scale' })
  scaleFunction(@GetUser() user: User, @Payload() functions: any) {
    return this.functionService.scaleFunction(user, functions);
  }

  @MessagePattern({ cmd: 'functions-stop' })
  stopFunction(@GetUser() user: User, @Payload() functions: any) {
    return this.functionService.stopFunction(user, functions);
  }
  @MessagePattern({ cmd: 'functions-start' })
  startFunction(@GetUser() user: User, @Payload() functions: any) {
    return this.functionService.startFunction(user, functions);
  }

  @MessagePattern({ cmd: 'get-functions-logs' })
  getFunctionsLogs(@GetUser() user: User, @Payload() functions: any) {
    return this.functionService.getFunctionLogs(user, functions);
  }
  @MessagePattern({ cmd: 'get-functions-metrics' })
  getFunctionsMetrics(@GetUser() user: User, @Payload() functions: any) {
    return this.functionService.getFunctionMetrics(user, functions);
  }
  @MessagePattern({ cmd: 'post-namespaces' })
  createNamespace(@Payload() namespace: NamespaceDto, @GetUser() user: User) {
    return this.namespaceService.createNamespace(user, namespace);
  }

  @MessagePattern({ cmd: 'get-namespaces' })
  getNamespaces(@GetUser() user: User) {
    return this.namespaceService.getNamespaces(user);
  }

  @MessagePattern({ cmd: 'get-namespaces-id' })
  getNamespace(@Payload() payload: any, @GetUser() user: User) {
    return this.namespaceService.getNamespace(user, payload.id);
  }

  @MessagePattern({ cmd: 'delete-namespaces-id' })
  deleteNamespace(@Payload() payload: any, @GetUser() user: User) {
    return this.namespaceService.deleteNamespace(user, payload.id);
  }


}
