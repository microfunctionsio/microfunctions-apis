import {CallHandler, Catch, ExecutionContext, HttpStatus, Injectable, NestInterceptor} from '@nestjs/common';
import {Observable, of, throwError} from 'rxjs';
import {RpcException} from '@nestjs/microservices';
import {catchError} from 'rxjs/operators';
import {MicroFunctionException} from '../errors/micro.function.Exception';

@Injectable()
@Catch(MicroFunctionException)
export class ErrorsMicroFunctionInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next
            .handle()
            .pipe(
                catchError((err: MicroFunctionException) => {
                    console.error('ErrorsInterceptor:', err);
                    if (err instanceof MicroFunctionException) {
                        return of(err);
                    }
                    return throwError(new RpcException(err).getError());
                }),
            );
    }
}


@Injectable()
@Catch(Error)
export class ErrorsInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next
            .handle()
            .pipe(
                catchError((err:any) => {
                    console.error('ErrorsInterceptor',err)
                    if(err instanceof RpcException )return throwError(err)
                    return throwError(new RpcException({
                        status: HttpStatus.EXPECTATION_FAILED,
                        message:'Internal server error ',
                    }));
                } ),
            );
    }
}
