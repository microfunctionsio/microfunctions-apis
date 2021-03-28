import {ResourceEnums} from "../enums/resource.enums";

export class Autoscaler {
    enabled: boolean;
    averageCpu: number
    averageMemory: number
    maxReplicas: number
    minReplicas: number

    constructor(autoscaler: {
        averageCpu: number
        averageMemory: number
        enabled: boolean
        maxReplicas: number
        minReplicas: number
    }) {
        this.enabled = autoscaler.enabled;
        if(this.enabled){
            this.maxReplicas =autoscaler.maxReplicas;
            this.minReplicas =autoscaler.minReplicas;
            this.averageCpu = autoscaler.averageCpu;
            this.averageMemory = autoscaler.averageMemory;
        }

    }

}

