import { RuntimeEnums } from '../enums/runtime.enums';
import { Environments } from '../classes/environments';
import {TriggerEnums} from "../enums/trigger.enums";

export interface Serverless {
  name: string;
  allocated: boolean;
  memory: string;
  cpu: string;
  idNamespace: string;
  executedName: string;
  runtime: RuntimeEnums;
  trigger: TriggerEnums;
  crontab: string;
  sourceCode: any;
  namespace: string;
  replicas: number;
  environments: Environments[];
  dependencies: any;
  host: string;
  apiKey:string;

}
