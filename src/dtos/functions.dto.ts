import { RuntimeEnums } from '../enums/runtime.enums';
import { Environments } from '../classes/environments';
import {TriggerEnums} from "../enums/trigger.enums";

export class FunctionsDto {
  name: string;
  allocated: boolean;
  memory: string;
  cpu: string;
  idUser: string;
  idNamespace: string;
  executedName: string;
  runtime: RuntimeEnums;
  trigger: TriggerEnums;
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
