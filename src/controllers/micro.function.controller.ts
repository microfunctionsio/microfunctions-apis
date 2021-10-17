import { Controller, UseInterceptors } from '@nestjs/common';
import { NamespaceDto } from '../dtos/namespace.dto';
import { GetUser } from '../decorators/get-user.decorator';
import { NamespaceService } from '../services/namespace.service';

import { MessagePattern, Payload } from '@nestjs/microservices';

import {ErrorsMicroFunctionInterceptor} from '../interceptors/errors.interceptor';
import { FunctionsService } from '../services/functions.service';
import { FunctionsDto } from '../dtos/functions.dto';
import {IUser} from "@microfunctions/common";

@Controller()
@UseInterceptors(new ErrorsMicroFunctionInterceptor())
export class MicroFunctionController {
  constructor(
    private namespaceService: NamespaceService,
    private functionService: FunctionsService
  ) {}

  @MessagePattern({ cmd: 'post-function' })
  createFunction(@Payload() functionDto: FunctionsDto, @GetUser() user: IUser) {
    return this.functionService.createFunction(user, functionDto);
  }

  @MessagePattern({ cmd: 'put-function' })
  updateFunction(@Payload() functionDto: FunctionsDto, @GetUser() user: IUser) {
    return this.functionService.updateFunction(user, functionDto);
  }


  @MessagePattern({ cmd: 'get-function' })
  getFunction(@GetUser() user: IUser, @Payload() functions: any) {
    return this.functionService.getFunction(user, functions);
  }

  @MessagePattern({ cmd: 'delete-function' })
  deleteFunction(@GetUser() user: IUser, @Payload() functions: any) {
    return this.functionService.deleteFunction(user, functions);
  }

  @MessagePattern({ cmd: 'get-functions' })
  getFunctions(@GetUser() user: IUser, @Payload() functions: any) {
    return this.functionService.getFunctions(user, functions);
  }

  @MessagePattern({ cmd: 'get-functions-status' })
  getFunctionStatus(@GetUser() user: IUser, @Payload() functions: any) {
    return this.functionService.getFunctionStatus(user, functions);
  }

  @MessagePattern({ cmd: 'put-functions-scale' })
  scaleFunction(@GetUser() user: IUser, @Payload() functions: any) {
    return this.functionService.scaleFunction(user, functions);
  }

  @MessagePattern({ cmd: 'functions-stop' })
  stopFunction(@GetUser() user: IUser, @Payload() functions: any) {
    return this.functionService.stopFunction(user, functions);
  }
  @MessagePattern({ cmd: 'functions-start' })
  startFunction(@GetUser() user: IUser, @Payload() functions: any) {
    return this.functionService.startFunction(user, functions);
  }

  @MessagePattern({ cmd: 'get-functions-logs' })
  getFunctionsLogs(@GetUser() user: IUser, @Payload() functions: any) {
    return this.functionService.getFunctionLogs(user, functions);
  }
  @MessagePattern({ cmd: 'get-functions-metrics' })
  getFunctionsMetrics(@GetUser() user: IUser, @Payload() functions: any) {
    return this.functionService.getFunctionMetrics(user, functions);
  }
  @MessagePattern({ cmd: 'get-namespace-metrics' })
  getNamespaceMetrics(@GetUser() user: IUser, @Payload() payload: any) {
    return this.namespaceService.getNamespaceMetrics(user, payload.id,payload.range);
  }

  @MessagePattern({ cmd: 'post-namespaces' })
  createNamespace(@Payload() namespace: NamespaceDto, @GetUser() user: IUser) {
    return this.namespaceService.createNamespace(user, namespace);
  }

  @MessagePattern({ cmd: 'get-namespaces' })
  getNamespaces(@GetUser() user: IUser) {
    return this.namespaceService.getNamespaces(user);
  }

  @MessagePattern({ cmd: 'get-namespaces-id' })
  getNamespace(@Payload() payload: any, @GetUser() user: IUser) {
    return this.namespaceService.getNamespace(user, payload.id);
  }

  @MessagePattern({ cmd: 'delete-namespaces-id' })
  deleteNamespace(@Payload() payload: any, @GetUser() user: IUser) {
    return this.namespaceService.deleteNamespace(user, payload.id);
  }


}
