import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

import {map} from "rxjs/operators";
import {IResponse, IUser} from '@microfunctions/common';

@Injectable()
export class ClusterService {

  constructor( @Inject('clusterProxy') private readonly clusterProxy: ClientProxy) {

  }
  getClusterConfig(user: IUser, idCluster: string) {

    const pattern = { cmd: 'config-cluster' };
    return this.send(user, pattern, {idCluster}).pipe(
        map((response: IResponse) => response.data),
    ).toPromise();
  }



  private send(user: IUser, pattern: any, payload: any) {
    return this.clusterProxy
      .send(pattern, Object.assign({}, payload, { user }));
  }

}
