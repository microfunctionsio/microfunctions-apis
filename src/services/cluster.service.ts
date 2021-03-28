import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { User } from '../interfaces/user';

import {map} from "rxjs/operators";
import {IResponse} from "../interfaces/response";

@Injectable()
export class ClusterService {

  constructor( @Inject('clusterProxy') private readonly clusterProxy: ClientProxy) {

  }
  getClusterConfig(user: User, idCluster: string) {

    const pattern = { cmd: 'config-cluster' };
    return this.send(user, pattern, {idCluster}).pipe(
        map((response: IResponse) => response.data),
    ).toPromise();
  }



  private send(user: any, pattern: any, payload: any) {
    return this.clusterProxy
      .send(pattern, Object.assign({}, payload, { user }));
  }

}
