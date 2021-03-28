import { IKubeApiLinkRef } from '../interfaces/Kube';
const k8s = require('@kubernetes/client-node');
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const opts = {};
kc.applyToRequest(opts);

export class KubeApiHelper {
  static createLink(ref: IKubeApiLinkRef): string {
    const { apiPrefix = '/apis', resource, apiVersion, name } = ref;
    let { namespace } = ref;
    if (namespace) {
      namespace = `namespaces/${namespace}`;
    }
    return (
      kc.getCurrentCluster().server +
      [apiPrefix, apiVersion, namespace, resource, name]
        .filter(v => !!v)
        .join('/')
    );
  }


}
