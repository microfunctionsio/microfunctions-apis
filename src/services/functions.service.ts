import {KubernetesService} from './kubernetes.service';
import {Functions, FunctionsDocument} from '../entitys/function';
import {FunctionsDto} from '../dtos/functions.dto';
import {from, merge, of} from 'rxjs';
import {SourceCode, SourceCodeDocument} from '../entitys/sourceCode';
import {catchErrorMongo, getMessageError} from '../helpers/error.helpers';
import {catchError, filter, map, mergeMap, tap, toArray} from 'rxjs/operators';
import {plainToClass} from 'class-transformer';
import {NamespaceService} from './namespace.service';
import {Namespace} from '../entitys/namespace';
import {forwardRef, HttpStatus, Inject} from '@nestjs/common';
import {Pod} from '../classes/pod';
import {ServerlessServices} from './serverless.services';
import {ConfigService} from '@nestjs/config';
import {WINSTON_MODULE_PROVIDER} from 'nest-winston';
import {Logger} from 'winston';
import {StatusFunctions} from '../classes/status.functions';
import {ClusterService} from './cluster.service';
import {
    FunctionsStatus,
    FunctionsSteps,
    IFunctionsLogs,
    IkubeConfig,
    IPodMetrics,
    IResponse,
    IServerless,
    IUser,
    PodStatus
} from '@microfunctions/common';

import {Messages, MessagesError} from '../messages';
import {MicroFunctionException} from '../errors/micro.function.Exception';

import {Model} from "mongoose";
import {InjectModel} from "@nestjs/mongoose";
import {Autoscaler} from "../classes/autoscaler";

export class FunctionsService {
    constructor(
        @InjectModel(Functions.name) private functionModel: Model<FunctionsDocument>,
        @InjectModel(SourceCode.name) private sourceCodeModel: Model<SourceCodeDocument>,
        @Inject(forwardRef(() => NamespaceService))
        private namespaceService: NamespaceService,
        private serverlessServices: ServerlessServices,
        private configService: ConfigService,
        private clusterService: ClusterService,
        private kubernetesService: KubernetesService,
        @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    ) {

        this.logger = logger.child({context: FunctionsService.name});
    }

    public async createFunction(user: IUser, functionDto: FunctionsDto) {
        const {idNamespace} = functionDto;
        this.logger.debug('createFunction', {user, idNamespace});
        const namespaceResponse: IResponse = await this.namespaceService
            .getNamespace(user, functionDto.idNamespace);
        const namespace: Namespace = namespaceResponse.data;
        const kubeConfig: IkubeConfig = await this.clusterService.getClusterConfig(user, namespace.idCluster);

        const functions: Functions = new Functions();
        functions.name = functionDto.name;
        functions.url = this.initUrl(functionDto, namespace);
        functions.executedName = functionDto.executedName;
        functions.memory = functionDto.memory;
        functions.cpu = functionDto.cpu;
        functions.allocated = functionDto.allocated;
        functions.idNamespace = functionDto.idNamespace;
        functions.runtime = functionDto.runtime;
        functions.trigger = functionDto.trigger;
        functions.crontab = functionDto.crontab;
        functions.idUser = user.id;
        functions.replicas = functionDto.replicas;
        functions.autoscaler = new Autoscaler(functionDto.autoscaler);
        functions.status = {
            step: FunctionsSteps.CREATING,
            status: FunctionsStatus.PENDING,
            message: '',
        };

        const functionsModel = new this.functionModel(functions);
        await functionsModel.save().catch((error) => {
            const response: IResponse = {
                status: HttpStatus.CONFLICT,
                message: MessagesError.functionsAlreadyExists,
            };
            throw new MicroFunctionException(response);
        });
        const response: IResponse = {
            status: HttpStatus.ACCEPTED,
            message: Messages.createFunctionsProgress,
            id: functionsModel.id,
        };
        const serverless: IServerless = Object.assign(functionDto, {
            apiKey: namespace.apiKey,
            host: namespace.host.host,
            namespace: namespace.idNamespace,
        }) as IServerless;

        this.createUpdateSourceCode({
            environments: functionDto.environments,
            sourceCode: functionDto.sourceCode,
            dependencies: functionDto.dependencies,
            idFunctions: functionsModel.id,
        }).pipe(
            mergeMap(() => {
                    return this.serverlessServices
                        .deployFunction(serverless, kubeConfig.kubeConfig).pipe(
                            tap((rs) => {
                                    if (functionDto.autoscaler.enabled) {
                                        this.kubernetesService.enabledAutoscale({
                                            kubeConfig: kubeConfig.kubeConfig,
                                            functions: functions.name,
                                            namespace: namespace.idNamespace
                                        },functionDto.autoscaler).subscribe(()=>{},error => {});
                                    }
                                }
                            )
                        )
                }
            ),
            catchError((error) => {
                this.updateStatus(functions.id, {
                    step: FunctionsSteps.DEPLOYED,
                    status: FunctionsStatus.FAILED,
                    message: getMessageError(error),
                });
                throw error;
            }),
        ).subscribe(() => {
            this.updateStatus(functionsModel.id, {
                step: FunctionsSteps.DEPLOYED,
                status: FunctionsStatus.SUCCEEDED,
            });
        }, error => (error: any) => {
            this.logger.error('createFunctions error', {user, id: functions.id, namespace: namespace.name, error});
        });

        return response;
    }

    public async updateFunction(user: IUser, functionDto: FunctionsDto) {
        const {idFunctions, idNamespace} = functionDto;
        this.logger.debug('updateFunction  ', {user, idFunctions, idNamespace});
        const {
            namespace,
            kubeConfig,
            functions
        } = await this.getNameSFunctionsAndKubconfig(user, idNamespace, idFunctions);
        functions.executedName = functionDto.executedName;
        functions.memory = functionDto.memory;
        functions.cpu = functionDto.cpu;
        functions.allocated = functionDto.allocated
        functions.runtime = functionDto.runtime;
        functions.updatedAt = new Date();
        functions.replicas = functions.replicas;
        functions.autoscaler = new Autoscaler(functionDto.autoscaler);
        functions.status = {
            step: FunctionsSteps.COMPILE,
            status: FunctionsStatus.PENDING,
            message: '',
        };
        functions.status = {
            step: FunctionsSteps.DEPLOYED,
            status: FunctionsStatus.PENDING,
        };
        await (functions as any).save().catch((error) => {
            const response: IResponse = {
                status: HttpStatus.CONFLICT,
                message: MessagesError.applicationError,
            };
            throw new MicroFunctionException(response);
        });
        const response: IResponse = {
            status: HttpStatus.ACCEPTED,
            message: Messages.updateFunctionsProgress,
            id: functions.id,
        };
        const serverless: IServerless = Object.assign(functionDto, {
            apiKey: namespace.apiKey,
            host: namespace.host.host,
            namespace: namespace.idNamespace,
            name: functions.name,
        });
        this.createUpdateSourceCode({
            environments: functionDto.environments,
            sourceCode: functionDto.sourceCode,
            dependencies: functionDto.dependencies,
            idFunctions: functions.id,
        }).pipe(
            mergeMap(() => this.serverlessServices
                .deployFunction(serverless, kubeConfig.kubeConfig).pipe(
                    tap((rs) => {
                            if (functionDto.autoscaler.enabled) {
                                this.kubernetesService.enabledAutoscale({
                                    kubeConfig: kubeConfig.kubeConfig,
                                    functions: functions.name,
                                    namespace: namespace.idNamespace
                                },functionDto.autoscaler).subscribe(()=>{},error => {});
                            }
                        }
                    )
                ),
            ),
            catchError((error) => {
                this.updateStatus(functions.id, {
                    step: FunctionsSteps.DEPLOYED,
                    status: FunctionsStatus.FAILED,
                    message: getMessageError(error),
                });
                throw error;
            }),
        ).subscribe(() => {
            this.updateStatus(functions.id, {
                step: FunctionsSteps.DEPLOYED,
                status: FunctionsStatus.SUCCEEDED,
            });
        }, error => (error: any) => {
            this.logger.error('UpdateFunctions error', {user, id: functions.id, namespace: namespace.name, error});
        });

        return response;
    }

    public async getFunction(user: IUser, functionsDto: FunctionsDto) {
        const {idFunctions, idNamespace} = functionsDto;
        this.logger.debug('getFunction', {user, idFunctions, idNamespace});
        const functionsDb = await this.functionModel.findOne({_id: idFunctions, idNamespace});
        const functions: Functions = plainToClass(Functions, functionsDb, {
            excludeExtraneousValues: true,
        });
        if (functions == null) {
            const response: IResponse = {
                status: HttpStatus.NOT_FOUND,
                message: MessagesError.functionsNotExists,
            };
            throw new MicroFunctionException(response);
        }
        const sourceCode: SourceCode = plainToClass(
            SourceCode,
            await this.sourceCodeModel.findOne({idFunctions: functions.id}),
            {excludeExtraneousValues: true},
        );

        const response: IResponse = {
            status: HttpStatus.OK,
            data: Object.assign(functions, sourceCode),
        };
        return response;
    }

    public getFunctions(user: IUser, functions: FunctionsDto) {
        const {idNamespace} = functions;
        this.logger.debug('getFunctions', {user, idNamespace});
        return from(
            this.functionModel.find({idNamespace}).sort({createdAt: -1}),
        ).pipe(
            catchError(err => catchErrorMongo(err, 'The application encountered an unexpected error')),
            map((functions$: any) => {
                const response: IResponse = {
                    status: HttpStatus.OK,
                    data: plainToClass(Functions, functions$, {
                        excludeExtraneousValues: true,
                    }),
                };
                return response;
            }),
        );
    }

    public deleteFunctionsByIdNameSpace(user: IUser, idNamespace: string) {

        return from(this.updateFunctionsByNameSpaceStatus(idNamespace, {
            step: FunctionsSteps.REMOVING,
            status: FunctionsStatus.PENDING,
        })).pipe(
            tap(() => {
                this.functionModel.deleteMany({idNamespace}).catch((deleteResulte: any) => {
                        this.logger.debug('deleteFunctionsByIdNameSpace  ', {user, idNamespace, deleteResulte});
                    },
                );
            }),
        );
    }

    public async scaleFunction(user: IUser, functionDto: FunctionsDto) {
        const {replicas, idNamespace, idFunctions} = functionDto;
        this.logger.debug('scaleFunction  ', {user, replicas, idNamespace, idFunctions});
        const {
            namespace,
            kubeConfig,
            functions
        } = await this.getNameSFunctionsAndKubconfig(user, idNamespace, idFunctions);
        this.kubernetesService.scaleKubDeployments(
            {
                kubeConfig: kubeConfig.kubeConfig,
                functions: functions.name,
                namespace: namespace.idNamespace,
                replicas: replicas,
            },
        ).pipe(
            mergeMap(() => this.updateFunctionLive(user, functions, replicas)),
            catchError((error) => {
                this.updateStatus(functions.id, {
                    step: FunctionsSteps.DEPLOYED,
                    status: FunctionsStatus.FAILED,
                    message: getMessageError(error),
                });
                throw error;
            }),
        ).subscribe(() => {
            this.updateStatus(functions.id, {
                step: FunctionsSteps.DEPLOYED,
                status: FunctionsStatus.SUCCEEDED,
            });
        }, error => (error: any) => {
            this.logger.error('UpdateFunctions error', {user, id: functions.id, namespace: namespace.name, error});
        });
        ;

    }

    public async stopFunction(user: IUser, functionsDto: FunctionsDto) {
        const {replicas, idNamespace, idFunctions} = functionsDto;
        this.logger.debug('stopFunction  ', {user, replicas, idNamespace, idFunctions});
        const {
            namespace,
            kubeConfig,
            functions
        } = await this.getNameSFunctionsAndKubconfig(user, idNamespace, idFunctions);

        const response: IResponse = {
            status: HttpStatus.ACCEPTED,
            message: Messages.stopFunctionsProgres,
            id: functions.id,
        };
        this.kubernetesService.scaleKubDeployments({
            kubeConfig: kubeConfig.kubeConfig,
            functions: functions.name,
            namespace: namespace.idNamespace,
            replicas: 0,
        }).pipe(
            catchError((error) => {
                this.updateStatus(functions.id, {
                    step: FunctionsSteps.STOP,
                    status: FunctionsStatus.FAILED,
                    message: getMessageError(error),
                });
                throw error;
            }),
        ).subscribe(() => {
            this.updateStatus(functions.id, {
                step: FunctionsSteps.STOP,
                status: FunctionsStatus.STOP,
            });
        }, error => (error: any) => {
            this.logger.error('stopFunction error', {user, id: functions.id, namespace: namespace.name, error});
        });

        return response;
    }

    public async startFunction(user: IUser, functionsDto: FunctionsDto) {
        const {replicas, idNamespace, idFunctions} = functionsDto;
        this.logger.debug('startFunction  ', {user, replicas, idNamespace, idFunctions});
        const {
            namespace,
            kubeConfig,
            functions
        } = await this.getNameSFunctionsAndKubconfig(user, idNamespace, idFunctions);

        const response: IResponse = {
            status: HttpStatus.ACCEPTED,
            message: Messages.startFunctionsProgres,
            id: functions.id,
        };
        this.kubernetesService.scaleKubDeployments({
            kubeConfig: kubeConfig.kubeConfig,
            functions: functions.name,
            namespace: namespace.idNamespace,
            replicas: functions.replicas,
        }).pipe(
            catchError((error) => {
                this.updateStatus(functions.id, {
                    step: FunctionsSteps.DEPLOYED,
                    status: FunctionsStatus.FAILED,
                    message: getMessageError(error),
                });
                throw error;
            }),
        ).subscribe(() => {
            this.updateStatus(functions.id, {
                step: FunctionsSteps.DEPLOYED,
                status: FunctionsStatus.SUCCEEDED,
            });
        }, error => (error: any) => {
            this.logger.error('createFunctions error', {user, id: functions.id, namespace: namespace.name, error});
        });

        return response;
    }

    public async deleteFunction(user: IUser, functionsDto: FunctionsDto) {
        const {idFunctions, idNamespace} = functionsDto;
        this.logger.debug('deleteFunction  ', {user, idNamespace, idFunctions});
        const {
            namespace,
            kubeConfig,
            functions
        } = await this.getNameSFunctionsAndKubconfig(user, idNamespace, idFunctions);
        const response: IResponse = {
            status: HttpStatus.ACCEPTED,
            message: Messages.deleteFunctionsProgres,
            id: functions.id,
        };
        this.updateStatus(idFunctions, {
            step: FunctionsSteps.REMOVING,
            status: FunctionsStatus.PENDING,
        });

        from(this.kubernetesService.deletekubFunctions({
            kubeConfig: kubeConfig.kubeConfig,
            functions: functions.name,
            namespace: namespace.idNamespace,
        })).pipe(
            mergeMap(() => from(this.functionModel.deleteOne({_id: functions.id}))),
            mergeMap(() => from(
                this.sourceCodeModel.deleteOne({
                    idFunctions: functions.id,
                }),
            )),
            catchError((error) => {

                this.updateStatus(functions.id, {
                    status: FunctionsStatus.FAILED,
                    step: FunctionsSteps.REMOVING,
                    message: getMessageError(error),
                });
                throw error;
            }),
        ).subscribe(() => {
        }, error => (error: any) => {
            this.logger.error('deleteFunction error', {user, idNamespace: namespace.name, error});
        });
        return response;
    }

    public async getFunctionLogs(user: IUser, functionsDto: FunctionsDto) {
        const {logstimestamps} = functionsDto;
        const {idFunctions, idNamespace} = functionsDto;
        this.logger.debug('getFunctionLogs  ', {user, idNamespace, idFunctions});
        const {
            namespace,
            kubeConfig,
            functions
        } = await this.getNameSFunctionsAndKubconfig(user, idNamespace, idFunctions);
        return this.kubernetesService.getkubPodbyFunction({
                kubeConfig: kubeConfig.kubeConfig,
                functions: functions.name,
                namespace: namespace.idNamespace,
            },
        ).pipe(
            mergeMap((pods: Pod[]) => {
                return from(pods).pipe(
                    mergeMap((pod: Pod) => {
                        const logsTimestampPod: any = logstimestamps
                            ? logstimestamps.find(
                                (logsTimestamps: any) => logsTimestamps.pod == pod.name,
                            )
                            : null;

                        const container: any = pod.getInitContainers().find((c) => c.name === 'compile' || c.name === 'install')
                        const containerName = pod.getStatus() === PodStatus.PENDING ? container.name : undefined;
                        return this.kubernetesService.getPodsLogs(kubeConfig.kubeConfig,
                            pod.name,
                            namespace.idNamespace,
                            logsTimestampPod?.logstimestamp,
                            containerName
                        );
                    }),
                );
            }),
            toArray(),
            map((functionsLogs: IFunctionsLogs[]) => {
                return {
                    status: HttpStatus.OK,
                    data: functionsLogs,
                };
            }),
        );
    }

    public async getFunctionMetrics(user: IUser, functionsDto: FunctionsDto) {
        const {range} = functionsDto;
        const {idFunctions, idNamespace} = functionsDto;
        this.logger.debug('getFunctionMetrics  ', {user, idNamespace, idFunctions});
        const {
            namespace,
            kubeConfig,
            functions
        } = await this.getNameSFunctionsAndKubconfig(user, idNamespace, idFunctions);

        return this.kubernetesService.getkubPodbyFunction({
            kubeConfig: kubeConfig.kubeConfig,
            functions: functions.name,
            namespace: namespace.idNamespace,

        }).pipe(
            mergeMap((pods: Pod[]) => {
                console.log('range',range)
                return this.kubernetesService.getPodsMetrics(namespace.host.host, namespace.apiKey, pods, namespace.idNamespace, range,functions.name,range?'container, namespace':'pod, namespace');
            }),
            map((iPodMetrics: IPodMetrics) => {
                return {
                    status: HttpStatus.OK,
                    data: iPodMetrics,
                };
            }),
        );
    }

    public async getFunctionStatus(user: IUser, functionsDto: FunctionsDto) {
        const {idFunctions, idNamespace} = functionsDto;
        this.logger.debug('getFunctionStatus  ', {user, idNamespace, idFunctions});
        const {
            namespace,
            kubeConfig,
            functions
        } = await this.getNameSFunctionsAndKubconfig(user, idNamespace, idFunctions);
        return this.kubernetesService.getkubPodbyFunction({
            kubeConfig: kubeConfig.kubeConfig,
            functions: functions.name,
            namespace: namespace.idNamespace,

        }).pipe(
            mergeMap((pods: Pod[]) => {
                if (pods.length > 0) {
                    return from(pods).pipe(
                        map((pod: Pod) => {
                            return {
                                StatusFunctions: functions.status,
                                name: pod.name,
                                status: pod.getStatus(),
                                statusMessage: pod.getStatusMessage(),
                                statusPhase: pod.getStatusPhase(),
                                restartsCount: pod.getRestartsCount(),
                            };
                        }),
                    );
                } else {
                    return from([{
                        StatusFunctions: functions.status,
                        status: functions.status.status,
                    }]);
                }

            }),
            toArray(),
            map((statusFunctions: any) => {
                return {
                    status: HttpStatus.OK,
                    data: statusFunctions,
                };
            }),
        );

    }

    private async getNameSFunctionsAndKubconfig(user: IUser, idNamespace: string, idFunctions: string) {
        const namespaceResponse: IResponse = await this.namespaceService
            .getNamespace(user, idNamespace);
        const namespace: Namespace = namespaceResponse.data;
        const kubeConfig: IkubeConfig = await this.clusterService.getClusterConfig(user, namespace.idCluster);
        const functions: Functions = await this.functionModel.findById(idFunctions).catch((error) => {
            const response: IResponse = {
                status: HttpStatus.CONFLICT,
                message: error.message,
            };
            throw new MicroFunctionException(response);
        });
        return {namespace, kubeConfig, functions};
    }

    private updateFunctionLive(user: IUser, functions: Functions, replicas: number) {

        const source$ = of(functions);
        return source$.pipe(
            mergeMap((functionsModelUpdate: any) => {
                functionsModelUpdate.updatedAt = new Date();
                functionsModelUpdate.replicas = replicas;
                return from(functionsModelUpdate.save()).pipe(
                    catchError(err => catchErrorMongo(err, 'The application encountered an unexpected error')),
                );
            }),
        );
    }

    private createUpdateSourceCode(sourceCode: any) {
        const codeSource: SourceCode = new SourceCode();
        codeSource.sourceCode = sourceCode.sourceCode;
        codeSource.dependencies = sourceCode.dependencies;
        codeSource.idFunctions = sourceCode.idFunctions;
        codeSource.environments = sourceCode.environments;
        const codeSourceModel = new this.sourceCodeModel(codeSource);
        const source$ = from(
            this.sourceCodeModel.findOne({idFunctions: sourceCode.idFunctions}),
        );
        const update$ = source$.pipe(
            filter((codeSource$: any) => codeSource$ != null),
            mergeMap((codeSourceModelUpdate: any) => {
                codeSourceModelUpdate.sourceCode = sourceCode.sourceCode;
                codeSourceModelUpdate.dependencies = sourceCode.dependencies;
                codeSourceModelUpdate.environments = sourceCode.environments;
                return from(codeSourceModelUpdate.save()).pipe(
                    catchError(err => catchErrorMongo(err, 'The application encountered an unexpected error')),
                    map((codeSource$: any) => {
                        const sourceCode: SourceCode = plainToClass(
                            SourceCode,
                            codeSource$,
                            {excludeExtraneousValues: true},
                        );
                        return sourceCode;
                    }),
                );
            }),
        );

        const save$ = source$.pipe(
            filter((codeSource$: any) => codeSource$ == null),
            mergeMap(() => {
                return from(codeSourceModel.save()).pipe(
                    catchError(err => catchErrorMongo(err, 'The application encountered an unexpected error')),
                    map((codeSource$: any) => {
                        const sourceCode: SourceCode = plainToClass(
                            SourceCode,
                            codeSource$,
                            {excludeExtraneousValues: true},
                        );
                        return sourceCode;
                    }),
                );
            }),
        );

        const saveOrUpdate$ = merge(save$, update$);

        return saveOrUpdate$;
    }

    private updateStatus(id: string, StatusFunctions: StatusFunctions) {
        this.functionModel.updateOne({_id: id}, {status: StatusFunctions}).then((data) => {
        }).catch((error) => this.logger.error('updateStatus error', {
            idFunctions: id,
            error,
        }));
    }

    private updateFunctionsByNameSpaceStatus(
        idNamespace: string,
        StatusFunctions: StatusFunctions,
    ) {
        return this.functionModel.updateMany(
            {idNamespace},
            {status: StatusFunctions},
        ).catch((error) => this.logger.error('updateFunctionsByNameSpaceStatus error', {
            idNamespace: idNamespace,
            error,
        }));
    }


    private initUrl(functionDto: any, namespace: Namespace, https?: boolean) {

        return `${https ? 'http' : 'https'}://${namespace.host.host}/${namespace.idNamespace}/apis/${functionDto.name}`;
    }
}
