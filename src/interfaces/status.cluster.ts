import { StepEnum } from '../enums/step.enum';

import { StatusClusterEnums } from '../enums/status.cluster.enums';

export interface StatusCluster {
  step?: StepEnum;
  status?: StatusClusterEnums;
  message?: string;
}
