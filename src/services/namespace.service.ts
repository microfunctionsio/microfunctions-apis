import {forwardRef, HttpStatus, Inject, Injectable} from '@nestjs/common';
import {NamespaceDto} from '../dtos/namespace.dto';
import {KubernetesService} from './kubernetes.service';
import {Namespace, NamespaceDocument} from '../entitys/namespace';
import {User} from '../interfaces/user';
import {catchError, map, mergeMap} from 'rxjs/operators';
import {plainToClass} from 'class-transformer';
import {StatusNamespaces} from '../classes/status.namespaces';
import {StatusNameSpacesEnums} from '../enums/status.namespaces.enums';
import {StepEnum} from '../enums/step.enum';
import {ConfigService} from '@nestjs/config';
import {WINSTON_MODULE_PROVIDER} from 'nest-winston';
import {Logger} from 'winston';
import {v4 as uuid} from 'uuid';
import {getMessageError} from '../helpers/error.helpers';

import {ClusterService} from './cluster.service';
import {IkubeConfig} from '../interfaces/Kube';
import {IResponse} from '../interfaces/response';
import {Messages, MessagesError} from '../messages';
import {MicroFunctionException} from '../errors/micro.function.Exception';
import {fromPromise} from 'rxjs/internal-compatibility';

import {Model} from "mongoose";
import {InjectModel} from "@nestjs/mongoose";
import {FunctionsService} from "./functions.service";


@Injectable()
export class NamespaceService {
  constructor(
    @InjectModel(Namespace.name) private namespaceModel: Model<NamespaceDocument>,
    @Inject(forwardRef(() => FunctionsService)) private functionService: FunctionsService,
    private configService: ConfigService,
    private clusterService: ClusterService,
    private kubernetesService: KubernetesService,
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
  ) {
    this.logger = logger.child({ context: NamespaceService.name });
  }

  public async createNamespace(user: User, namespaceDto: NamespaceDto) {


    this.logger.debug('createNamespace', { user, namespaceDto });
    const kubeConfig: IkubeConfig = await this.clusterService.getClusterConfig(user, namespaceDto.idCluster);
    const namespace: Namespace = new Namespace();

    namespace.idNamespace = `${namespaceDto.name.toLowerCase()}00${this.generateId()}`;
    namespace.name = namespaceDto.name;
    namespace.idUser = user.id;
    namespace.apiKey = this.generateApiKey();
    namespace.idCluster = kubeConfig.id;
    namespace.clusterName = kubeConfig.name;
    namespace.host = { host: namespaceDto.host };
    namespace.status = {
      step: StepEnum.CREATING,
      status: StatusNameSpacesEnums.PENDING,
    };
    const namespaceModel = new this.namespaceModel(namespace);
    await namespaceModel.save().catch((error) => {
      const response: IResponse = {
        status: HttpStatus.CONFLICT,
        message: MessagesError.namespaceAlreadyExists,
      };
      throw new MicroFunctionException(response);
    });
    const response: IResponse = {
      status: HttpStatus.CREATED,
      message: Messages.createNamespaceProgress,
      id: namespaceModel.id,
    };

    this.kubernetesService.createKubNamespace(
      {
        kubeConfig: kubeConfig.kubeConfig,
        namespace: namespace.idNamespace,
      }).pipe(
      mergeMap(() => this.kubernetesService.createKongApiKey(
        {
          kubeConfig: kubeConfig.kubeConfig,
          namespace: namespace.idNamespace,
          apiKey: namespace.apiKey,
        })),
      mergeMap(() => this.kubernetesService.getLoadBalancerIp({ kubeConfig: kubeConfig.kubeConfig })),
      mergeMap(() => this.kubernetesService.createIngressMetrics({
        kubeConfig: kubeConfig.kubeConfig, namespace: namespace.idNamespace,
        domain: namespace.host.host,
      })),
      catchError((error) => {
        this.updateStatus(namespaceModel.id, {
          status: StatusNameSpacesEnums.FAILED,
          step: StepEnum.CREATING,
          message: getMessageError(error),
        });
        throw error;
      }),
    ).subscribe(() => {
      this.updateStatus(namespaceModel.id, {
        step: StepEnum.CREATING,
        status: StatusNameSpacesEnums.SUCCEEDED,
      });
    }, error => (error: any) => {
      this.logger.error('createNamespace error', { user, idNamespace: namespaceDto.name, error });
    });
    return response;
  }

  public getNamespaces(user: User): Promise<IResponse> {
    this.logger.debug('getNamespaces', { user });
    return this.namespaceModel.find({ idUser: user.id }).then(
      ((namespace: Namespace[]) => {
        const response: IResponse = {
          status: HttpStatus.OK,
          data: plainToClass(Namespace, namespace, {
            excludeExtraneousValues: true,
          }),
        };
        return response;
      }),
    );
  }

  public getNamespace(user: User, id: string) {
    this.logger.debug('getNamespace', { user, namespaces: id });
    return this.namespaceModel.findById(id).then(
      ((namespace: any) => {
        if (namespace) {
          const response: IResponse = {
            status: HttpStatus.OK,
            data: plainToClass(Namespace, namespace, {
              excludeExtraneousValues: true,
            }),
          };
          return response;
        }
        const response: IResponse = {
          status: HttpStatus.NOT_FOUND,
          message: MessagesError.namespaceNotExists,
        };
        throw new MicroFunctionException(response);
      }),
    );
  }

  public async deleteNamespace(user: User, id: string) {
    this.logger.debug('deleteNamespace', { user, namespaces: id });

    const namespace: Namespace = await this.namespaceModel.findById(id).catch((error) => {
      const response: IResponse = {
        status: HttpStatus.CONFLICT,
        message: error.message,
      };
      throw new MicroFunctionException(response);
    });
    const response: IResponse = {
      status: HttpStatus.ACCEPTED,
      message: Messages.deleteNamespaceProgres,
      id: namespace.id,
    };
    this.updateStatus(id, {
      step: StepEnum.REMOVING,
      status: StatusNameSpacesEnums.PENDING,
    });

    const kubeConfig: IkubeConfig = await this.clusterService.getClusterConfig(user, namespace.idCluster);
    this.kubernetesService.deleteKubNamespace(
      {
        kubeConfig: kubeConfig.kubeConfig,
        namespace: namespace.idNamespace,
        apiKey: namespace.apiKey,
      }).pipe(
      mergeMap(() => this.functionService.deleteFunctionsByIdNameSpace(user, namespace.id)),
      mergeMap(() => fromPromise(this.namespaceModel.deleteOne({ _id: namespace.id }))),
      catchError((error) => {
        console.log(error)
        this.updateStatus(namespace.id, {
          status: StatusNameSpacesEnums.FAILED,
          step: StepEnum.REMOVING,
          message: getMessageError(error),
        });
        throw error;
      }),
    ).subscribe(() => {
    }, error => (error: any) => {
      this.logger.error('deleteNamespace error', { user, idNamespace: namespace.name, error });
    });

    return response;
  }

  private updateStatus(id: string, statusNameSpaces: StatusNamespaces) {
    this.namespaceModel.updateOne({ _id: id }, { status: statusNameSpaces }).catch((error) => this.logger.error('updateStatus error', {
      idNamespace: id,
      error,
    }));
  }

  private setIdDomaine(id: string, idDomain: string) {
    this.namespaceModel.updateOne({ _id: id }, { 'domain.id': idDomain }).catch((error) => this.logger.error('updateStatus error', {
      idNamespace: id,
      error,
    }));
  }

  private generateApiKey() {
    const apiKey: string = uuid();
    return apiKey;
  }

  private generateId() {
    let length = 8,
      charset = 'abcdefghijklmnopqrstuvwxyz123456789',
      retVal = '';
    for (let i = 0, n = charset.length; i < length; ++i) {
      retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    return retVal;
  }

}