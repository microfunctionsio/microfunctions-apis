import {HttpStatus, Injectable} from '@nestjs/common';
import {from, Observable, throwError, timer} from 'rxjs';
import * as k8s from '@kubernetes/client-node';
import {map, mergeMap, retryWhen} from 'rxjs/operators';
import {Pod} from '../classes/pod';
import {stringify} from 'querystring';
import * as requestPromise from 'request-promise-native';
import {
    ApiRequest,
    IFunctionsLogs,
    IKubParam,
    IMetricsQuery,
    IMetricsReqParams,
    IPodMetrics
} from '@microfunctions/common';

import {RpcException} from '@nestjs/microservices';
import {MessageErrorCode} from '../helpers/error.helpers';
import {Service} from '../classes/service';
import {ExtensionsV1beta1Ingress} from '@kubernetes/client-node/dist/gen/model/extensionsV1beta1Ingress';
import {V1Service} from '@kubernetes/client-node/dist/gen/model/v1Service';
import {fromPromise} from 'rxjs/internal-compatibility';
import {MessagesError} from '../messages';
import {Autoscaler} from "../classes/autoscaler";
import moment = require('moment');


@Injectable()
export class KubernetesService {

    public createKubNamespace(kubParam: IKubParam) {
        const namespace: any = {
            metadata: {
                name: kubParam.namespace,
            },
        };

        const k8sCoreApi = this.getCoreApi(kubParam.kubeConfig);
        return fromPromise(k8sCoreApi.createNamespace(namespace));
    }

    public getkubPodbyFunction(kubParam: IKubParam,
    ): Observable<Pod[]> {
        const k8sCoreApi = this.getCoreApi(kubParam.kubeConfig);
        return from(k8sCoreApi.listNamespacedPod(kubParam.namespace)).pipe(
            map((response: any) => {
                const pods: Pod[] = Object.values(response.body.items).map(
                    (item: any) => {
                        return new Pod(item);
                    },
                );
                return pods.filter(
                    (pod: Pod) => pod.metadata.labels.function == kubParam.functions,
                );
            }),
        );
    }

    public scaleKubDeployments(kubParam: IKubParam,
    ): Observable<any> {
        const k8sAppsApi = this.getAppsApi(kubParam.kubeConfig);

        return from(
            k8sAppsApi.readNamespacedDeploymentStatus(kubParam.functions, kubParam.namespace),
        ).pipe(
            retryWhen(
                this.retryStrategy({
                    maxRetryAttempts: 3,
                }),
            ),
            mergeMap((response: any) => {
                return from(
                    k8sAppsApi.patchNamespacedDeploymentScale(
                        kubParam.functions,
                        kubParam.namespace,
                        {spec: {replicas: parseInt(kubParam.replicas)}},
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        {
                            headers: {'Content-Type': 'application/merge-patch+json'},
                        },
                    ),
                );
            }),
        );
    }

    public enabledAutoscale(kubParam: IKubParam, autoscaler: Autoscaler) {
        const scaleApi = this.getScaleApi(kubParam.kubeConfig);
        const k8sAppsApi = this.getAppsApi(kubParam.kubeConfig);
        return from(
            k8sAppsApi.readNamespacedDeploymentStatus(kubParam.functions, kubParam.namespace),
        ).pipe(
            retryWhen(
                this.retryStrategy({
                    maxRetryAttempts: 3,
                }),
            ),
            mergeMap((response: any) => {
                const minReplicas: number = parseInt(autoscaler.minReplicas.toString(), 10);
                const maxReplicas: number = parseInt(autoscaler.maxReplicas.toString(), 10);
                const autoscaleBody = {
                    kind: 'HorizontalPodAutoscaler',
                    metadata: {
                        name: `${kubParam.functions}`,
                        namespace: kubParam.namespace,
                    },
                    spec: {
                        minReplicas: minReplicas,
                        maxReplicas: maxReplicas > minReplicas ? maxReplicas : (minReplicas + 1),
                        metrics: [{
                            resource: {
                                name: 'cpu',
                                target: {
                                    type: 'Utilization',
                                    averageUtilization: parseInt(autoscaler.averageCpu.toString(), 10)
                                },
                            },
                            type: 'Resource'
                        }, {
                            resource: {
                                name: 'memory',
                                target: {
                                    type: 'Utilization',
                                    averageUtilization: parseInt(autoscaler.averageMemory.toString(), 10)
                                },

                            },
                            type: 'Resource'
                        }],
                        scaleTargetRef: {
                            apiVersion: 'apps/v1beta1',
                            kind: 'Deployment', name: `${kubParam.functions}`
                        }
                    },

                };
                return from(
                    scaleApi.createNamespacedHorizontalPodAutoscaler(kubParam.namespace, autoscaleBody, undefined,
                        undefined,
                        undefined, {
                            headers: {'Content-Type': 'application/json'},
                        })
                );
            }),
        );
    }

    public deletekubFunctions(kubParam: IKubParam,
    ) {
        const opts = this.getRequestOpts(kubParam.kubeConfig);
        const path = `${
            opts.basePath
        }/apis/kubeless.io/v1beta1/namespaces/${kubParam.namespace}/functions/${kubParam.functions}`;
        return requestPromise.delete(path, opts.opts);
    }

    public createKongApiKey(kubParam: IKubParam): Observable<any> {

        const Opts = this.getRequestOpts(kubParam.kubeConfig);
        const path = `${
            Opts.basePath
        }/apis/configuration.konghq.com/v1/namespaces/${kubParam.namespace}/kongingresses`;
        const kongIngress: any = {
            apiVersion: 'configuration.konghq.com/v1',
            kind: 'KongIngress',
            metadata: {
                name: `${kubParam.namespace}-apikey`,
            },
            route: {
                headers: {'x-apikey-header': [kubParam.apiKey]},
            },
        };
        return fromPromise(requestPromise.post(path, Object.assign({
            body: kongIngress,
            json: true,

        }, Opts.opts)));
    }

    public deleteKubNamespace(kubParam: IKubParam) {
        const k8sCoreApi = this.getCoreApi(kubParam.kubeConfig);
        return fromPromise(k8sCoreApi.deleteNamespace(kubParam.namespace));
    }

    public getLoadBalancerIp(kubParam: IKubParam): Observable<any> {

        const k8sCoreApi = this.getCoreApi(kubParam.kubeConfig);
        return from(k8sCoreApi.listNamespacedService('microfunctions')).pipe(
            map((response: any) => {
                return Object.values(response.body.items).map(
                    (item: any) => {
                        return new Service(item);
                    },
                );
            }),
            map((services: Service[]) => {
                const service: Service = services.find((service: Service) => service.isLoadBalancer());
                const externalIp: string = service ? service.getExternalIps()[0] : null;
                if (externalIp === null) throwError(MessagesError.loadBalancerIp)
                return externalIp;
            }),
        );

    }

    public createIngressMetrics(kubParam: IKubParam) {
        const k8sApi: k8s.ExtensionsV1beta1Api = this.getNetworkingApi(kubParam.kubeConfig);
        const k8sCoreApi = this.getCoreApi(kubParam.kubeConfig);
        const ingress: ExtensionsV1beta1Ingress = {
            //   apiVersions: 'extensions/v1beta1',
            kind: 'Ingress',
            metadata: {
                name: `ingress-prometheus`,
                annotations: {
                    'kubernetes.io/ingress.class': 'kong',
                    'nginx.ingress.kubernetes.io/rewrite-target': '/$2',
                    'konghq.com/override': `${kubParam.namespace}-apikey`,
                },
            },
            spec: {
                rules: [{
                    host: `${kubParam.domain}`,
                    http: {
                        paths: [{
                            backend: {
                                serviceName: 'prometheus-service',
                                servicePort: new Number(80),
                            },
                            path: '/prometheus(/|$)(.*)',
                        }],
                    },
                }],
            },
        };
        const service: V1Service = {
            kind: 'Service',
            metadata: {
                name: `prometheus-service`,
            },
            spec: {
                type: 'ExternalName',
                externalName: `prometheus.microfunctions.svc.cluster.local`,
                ports: [
                    {
                        'name': 'http',
                        'port': 80,
                    },
                ],
            },
        };
        return from(k8sCoreApi.createNamespacedService(kubParam.namespace, service)).pipe(
            mergeMap(() => fromPromise(k8sApi.createNamespacedIngress(kubParam.namespace, ingress))),
        );

    }

    public getPodsLogs(kubeConfig: string,
                       namepods: string,
                       namespace: string,
                       logsTimestamp?: string,
                       container: string = undefined,
                       showsMetrics = false,
    ): Observable<IFunctionsLogs> {
        let lastLogDate = new Date(0);

        if (
            !!logsTimestamp &&
            moment(logsTimestamp, moment.ISO_8601, true).isValid()
        ) {
            lastLogDate = new Date(logsTimestamp);
            lastLogDate.setSeconds(lastLogDate.getSeconds() + 1); // avoid duplicates from last second
        }
        const opts = this.getRequestOpts(kubeConfig);
        let path = `${
            opts.basePath
        }/api/v1/namespaces/${namespace}/pods/${namepods}/log`;
        const podLogsQuery: any = {
            container: container,
            timestamps: true,
            tailLines: 1000,
            sinceTime: lastLogDate.toISOString(),
        };

        if (podLogsQuery) {
            const queryString = stringify(podLogsQuery);
            path += (path.includes('?') ? '&' : '?') + queryString;
        }
        return from(requestPromise.get(path, opts.opts)).pipe(
            map((response: string) => {
                let logs: string[] = response?.split('\n') || [];
                if (!showsMetrics) {
                    logs = logs.filter(
                        (l: string) =>
                            l.indexOf('node') < 0 && l.indexOf('metrics') < 0 && l.indexOf('healthz') < 0 && l != '',
                    );
                }

                return {
                    logs: logs,
                    logsTimestamp: this.getTimestamps(response)?.slice(-1)[0],
                    pod: namepods,
                };
            }),
        );
    }

    public getPodsMetrics(
        baseUrl: string,
        apiKey: string,
        pods: Pod[],
        namespace: string,
        rangePrame: number,
        functions: string,
        selector = 'pod, namespace',
    ): Observable<IPodMetrics> {
        //const rateAccuracy = "1m";
       /* const bytesSent = (route: string, statuses: string) =>
            `sum(rate(kong_http_status{route="${route}" ,code=~"${statuses}"}[${rateAccuracy}])) by (route)`;*/
        const countSent = (route: string, statuses: string) =>
            `sum(kong_http_status{code=~"${statuses}",route="${route}"}) by (route)`;

        const podSelector = pods.map(pod => pod.name).join('|');
        const cpuUsage = `sum(rate(container_cpu_usage_seconds_total{container!="POD",container!="",pod=~"${podSelector}",namespace="${namespace}"}[2m])) by (${selector})`;
        const cpuRequests = `sum(kube_pod_container_resource_requests{pod=~"${podSelector}",resource="cpu",namespace="${namespace}"}) by (${selector})`;
        const cpuLimits = `sum(kube_pod_container_resource_limits{pod=~"${podSelector}",resource="cpu",namespace="${namespace}"}) by (${selector})`;
        const memoryUsage = `sum(container_memory_working_set_bytes{container!="POD",container!="",pod=~"${podSelector}",namespace="${namespace}"}) by (${selector})`;
        const memoryRequests = `sum(kube_pod_container_resource_requests{app_kubernetes_io_name!="kube-state-metrics",pod=~"${podSelector}",resource="memory",namespace="${namespace}"}) by (${selector})`;
        const memoryLimits = `sum(kube_pod_container_resource_limits{app_kubernetes_io_name!="kube-state-metrics",pod=~"${podSelector}",container!="POD",container!="",resource="memory",namespace="${namespace}"}) by (${selector})`;
        const countSentSuccess = countSent(`${namespace}.${functions}.00`, "2[0-9]{2}");
        const countSentFailure = countSent(`${namespace}.${functions}.00`, "5[0-9]{2}");
        const requestTime= `histogram_quantile(0.99, sum(rate(kong_latency_bucket{type="request",route=~"${namespace}.${functions}.00"}[15m])) by (route,le))`;
        const reqParams: IMetricsReqParams = {};
        const {range = rangePrame || 1, step = 60} = reqParams;
        let {start, end} = reqParams;
        if (!start && !end) {
            const timeNow = Date.now() / 1000;
            const now = moment
                .unix(timeNow)
                .startOf('minute')
                .unix(); // round date to minutes
            start = now - range;
            end = now;
        }
        const metrics: IMetricsQuery = {
            cpuUsage,
            cpuRequests,
            cpuLimits,
            memoryUsage,
            memoryRequests,
            memoryLimits,
            requestTime,
            countSentSuccess,
            countSentFailure
        };
        const path = `http://${baseUrl}/prometheus/api/v1/query_range`;

        const query: URLSearchParams = new URLSearchParams(
            stringify({
                start,
                end,
                step,
                // eslint-disable-next-line @typescript-eslint/camelcase
                kubernetes_namespace: namespace,
            }),
        );
        const headers = {
            'Content-type': 'application/json',
            'x-apikey-header': apiKey,
        };
        const request: ApiRequest = {
            payload: metrics,
            query: query,
            path,
            headers,
        };

        return from(this.getMetrics(request)).pipe(
            map((response: any) => {
                return response as IPodMetrics;
            }),
        );
    }

    public getNamespaceMetrics(
        baseUrl: string,
        apiKey: string,
        namespace: string,
        rangePrame: number,
        selector = 'namespace',
    ): Observable<IPodMetrics> {

        const cpuUsage = `sum(rate(container_cpu_usage_seconds_total{container!="POD",container!="",namespace="${namespace}"}[2m])) by (${selector})`;
        const cpuRequests = `sum(kube_pod_container_resource_requests{resource="cpu",namespace="${namespace}"}) by (${selector})`;
        const cpuLimits = `sum(kube_pod_container_resource_limits{resource="cpu",namespace="${namespace}"}) by (${selector})`;
        const memoryUsage = `sum(container_memory_working_set_bytes{container!="POD",container!="",namespace="${namespace}"}) by (${selector})`;
        const memoryRequests = `sum(kube_pod_container_resource_requests{app_kubernetes_io_name!="kube-state-metrics",container!="POD",container!="",resource="memory",namespace="${namespace}"}) by (${selector})`;
        const memoryLimits = `sum(kube_pod_container_resource_limits{app_kubernetes_io_name!="kube-state-metrics",container!="POD",container!="",resource="memory",namespace="${namespace}"}) by (${selector})`;

        const reqParams: IMetricsReqParams = {};
        const {range = rangePrame || 1,  step = 60} = reqParams;
        let {start, end} = reqParams;
        if (!start && !end) {
            const timeNow = Date.now() / 1000;
            const now = moment
                .unix(timeNow)
                .startOf('minute')
                .unix(); // round date to minutes
            start = now - range;
            end = now;
        }
        const metrics: IMetricsQuery = {
            cpuUsage,
            cpuRequests,
            cpuLimits,
            memoryUsage,
            memoryRequests,
            memoryLimits
        };
        const path = `http://${baseUrl}/prometheus/api/v1/query_range`;

        const query: URLSearchParams = new URLSearchParams(
            stringify({
                start,
                end,
                step,
                // eslint-disable-next-line @typescript-eslint/camelcase
                kubernetes_namespace: namespace,
            }),
        );
        const headers = {
            'Content-type': 'application/json',
            'x-apikey-header': apiKey,
        };
        const request: ApiRequest = {
            payload: metrics,
            query: query,
            path,
            headers,
        };

        return from(this.getMetrics(request)).pipe(
            map((response: any) => {
                return response as IPodMetrics;
            }),
        );
    }

    private async getMetrics(request: ApiRequest) {

        const query: IMetricsQuery = request.payload;

        const metricsUrl = request.path;

        const queryParams: IMetricsQuery = {};
        request.query.forEach((value: string, key: string) => {
            queryParams[key] = value;
        });

        // prometheus metrics loader
        const attempts: { [query: string]: number } = {};
        const maxAttempts = 5;

        const loadMetrics = (orgQuery: string): Promise<any> => {
            const query = orgQuery.trim();
            const attempt = (attempts[query] = (attempts[query] || 0) + 1);
            return requestPromise
                .get(metricsUrl, {
                    resolveWithFullResponse: false,
                    headers: request.headers,
                    json: true,
                    // timeout: '333',
                    qs: {
                        query: query,
                        ...queryParams,
                    },
                })
                .catch(async error => {
                    console.log(error)
                    if (
                        attempt < maxAttempts &&
                        error.statusCode && error.statusCode != 404
                    ) {
                        await new Promise(resolve => setTimeout(resolve, attempt * 1000)); // add delay before repeating request
                        return loadMetrics(query);
                    }
                    return {
                        status: error.toString(),
                        data: {
                            result: [],
                        },
                    };
                });
        };

        // return data in same structure as query
        // return data in same structure as query
        let data: any;
        if (typeof query === 'string') {
            data = await loadMetrics(query);
        } else if (Array.isArray(query)) {
            data = await Promise.all(query.map(loadMetrics));
        } else {
            data = {};
            const result = await Promise.all(Object.values(query).map(loadMetrics));
            Object.keys(query).forEach((metricName, index) => {
                data[metricName] = result[index];
            });
        }
        return data;
    }

    private getTimestamps(logs: string) {
        return logs.match(/^\d+\S+/gm);
    }

    private retryStrategy = ({
                                 maxRetryAttempts = 20,
                                 retryDuration = 1000,
                                 excludedStatusCodes = [],
                             }: {
        maxRetryAttempts?: number;
        retryDuration?: number;
        excludedStatusCodes?: number[];
    } = {}) => (attempts: Observable<any>) => {
        return attempts.pipe(
            mergeMap((error: any, i) => {
                // console.log('error***',error)
                const retryAttempt = i + 1;

                if (retryAttempt > maxRetryAttempts) {
                    console.error(`Falied to k8s action ${maxRetryAttempts} retries `);
                    return throwError(error);
                }
                console.error(`retryDuration ${retryDuration * i}  retries ${i} `);
                return timer(retryDuration * i);
            }),
        );
    };

    private getRequestOpts(clusterconfig: string) {

        const kc = new k8s.KubeConfig();
        const opts: any = {};
        kc.loadFromString(clusterconfig);
        kc.applyToRequest(opts);

        return {opts, basePath: kc.getCurrentCluster().server};
    }

    private getCoreApi(kubeConfig: string) {
        try {
            const kc = new k8s.KubeConfig();
            kc.loadFromString(kubeConfig);
            const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);
            return k8sCoreApi;
        } catch (e) {
            throw new RpcException({
                status: HttpStatus.BAD_REQUEST,
                code: MessageErrorCode.CLUSTER_ERROR,
                message: e.message,
            });
        }

    }

    private getNetworkingApi(kubeConfig: string) {
        try {
            const kc = new k8s.KubeConfig();
            kc.loadFromString(kubeConfig);
            const k8sExtensionsApi = kc.makeApiClient(k8s.ExtensionsV1beta1Api);
            return k8sExtensionsApi;
        } catch (e) {
            throw new RpcException({
                status: HttpStatus.BAD_REQUEST,
                code: MessageErrorCode.CLUSTER_ERROR,
                message: e.message,
            });
        }

    }

    private getAppsApi(kubeConfig: string) {
        try {
            const kc = new k8s.KubeConfig();
            kc.loadFromString(kubeConfig);
            const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
            return k8sAppsApi;

        } catch (e) {
            throw new RpcException({
                status: HttpStatus.BAD_REQUEST,
                code: MessageErrorCode.CLUSTER_ERROR,
                message: e.message,
            });

        }
    }

    private getScaleApi(kubeConfig: string) {
        try {
            const kc = new k8s.KubeConfig();
            kc.loadFromString(kubeConfig);
            const k8sScaleApi = kc.makeApiClient(k8s.AutoscalingV2beta2Api);
            return k8sScaleApi;

        } catch (e) {
            throw new RpcException({
                status: HttpStatus.BAD_REQUEST,
                code: MessageErrorCode.CLUSTER_ERROR,
                message: e.message,
            });

        }
    }
}
