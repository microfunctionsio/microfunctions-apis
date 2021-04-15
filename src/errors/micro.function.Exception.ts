import { IResponse } from '@microfunctions/common';
import {RpcException} from "@nestjs/microservices";
export class MicroFunctionException extends RpcException {
  status: number;
  constructor(private readonly response: IResponse) {
    super(response);
    this.message = response.message;
    this.status = response.status;
  }



  public getError(): string | object {
    return this.message;
  }
}

