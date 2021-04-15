import { Environments } from '../classes/environments';
import {RuntimesType} from '@microfunctions/common';
import {TriggersType} from '@microfunctions/common';

export class FunctionsDto {
  name: string;
  allocated: boolean;
  memory: string;
  cpu: string;
  idUser: string;
  idNamespace: string;
  executedName: string;
  runtime: RuntimesType;
  trigger: TriggersType;
  crontab: string;
  sourceCode: any;
  namespace: string;
  idFunctions: string;
  replicas: number;
  autoscaler: {
    averageCpu: number
    averageMemory: number
    enabled: boolean
    maxReplicas: number
    minReplicas: number
  };
  environments: Environments[];
  dependencies: any;
  logstimestamps:any;
  range:any;
}
