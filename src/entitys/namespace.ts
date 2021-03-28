import {Expose} from 'class-transformer';

import {StatusNamespaces} from '../classes/status.namespaces';

import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';
import {Document} from 'mongoose'

export class Host {
  host:string;
  id?:string;
}

export type NamespaceDocument = Namespace & Document;
@Schema()
export class Namespace {
  @Expose()
  id: string;
  @Prop({ unique: true, index: true })
  @Expose()
  name: string;
  @Prop({ unique: true, index: true })
  @Expose()
  idNamespace: string;
  @Prop()
  idUser: string;
  @Prop()
  @Expose()
  apiKey: string;
  @Prop()
  @Expose()
  idCluster: string;
  @Prop()
  @Expose()
  clusterName: string;
  @Prop({type:Host})
  @Expose()
  host: Host;

  @Expose()
  @Prop({type: StatusNamespaces})
  status: StatusNamespaces;
  @Expose()
  createdAt: Date;
  @Expose()
  updatedAt: Date;
}
export const NamespaceSchema = SchemaFactory.createForClass(Namespace);
