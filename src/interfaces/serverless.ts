import { Environments } from '../classes/environments';
import {RuntimesType, TriggersType} from "@microfunctions/common";

export interface Serverless {
  name: string;
  allocated: boolean;
  memory: string;
  cpu: string;
  idNamespace: string;
  executedName: string;
  runtime: RuntimesType;
  trigger: TriggersType;
  crontab: string;
  sourceCode: any;
  namespace: string;
  replicas: number;
  environments: Environments[];
  dependencies: any;
  host: string;
  apiKey:string;

}
