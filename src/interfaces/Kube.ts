
import * as http from 'http';
import {Cluster} from "../classes/cluster";
export interface IKubeApiLinkRef {
  apiPrefix?: string;
  apiVersion: string;
  resource: string;
  name: string;
  namespace?: string;
}

export interface IKubeObjectMetadata {
  uid: string;
  name: string;
  namespace?: string;
  creationTimestamp: string;
  resourceVersion: string;
  selfLink: string;
  deletionTimestamp?: string;
  finalizers?: string[];
  continue?: string; // provided when used "?limit=" query param to fetch objects list
  labels?: {
    [label: string]: string;
  };
  annotations?: {
    [annotation: string]: string;
  };
}

interface RouteParams {
  [key: string]: string | undefined;
}
export type ApiRequest = {
  cluster?: Cluster;
  payload: any;
  raw?: {
    req: http.IncomingMessage;
  };
  params?: RouteParams;
  response?: http.ServerResponse;
  query: URLSearchParams;
  path: string;
  headers:any;
};

export interface IkubeConfig {
  kubeConfig: string,
  name?: string;
  id?: string;
}

