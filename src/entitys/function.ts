
import { Expose } from 'class-transformer';
import { RuntimeEnums } from '../enums/runtime.enums';
import { StatusFunctions } from '../classes/status.functions';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {TriggerEnums} from "../enums/trigger.enums";
import {Autoscaler} from "../classes/autoscaler";

export type FunctionsDocument = Functions & Document;
@Schema()

export class Functions {
  @Expose()
  id: string;
  @Prop({  index: true })
  @Expose()
  name: string;
  @Expose()
  @Prop()
  allocated: boolean;
  @Expose()
  @Prop()
  memory: string;
  @Expose()
  @Prop()
  cpu: string;
  @Prop({ required: true, index: true })
  idUser: string;
  @Prop({ required: true, index: true })
  @Expose()
  idNamespace: string;
  @Expose()
  @Prop({ required: true })
  executedName: string;
  @Expose()
  @Prop({ required: true })
  url: string;
  @Expose()
  @Prop({ enum: RuntimeEnums, required: true })
  runtime: RuntimeEnums;
  @Expose()
  @Prop({ enum: TriggerEnums, required: true })
  trigger: TriggerEnums;
  @Expose()
  @Prop()
  crontab: string;
  @Expose()
  @Prop({ required: true })
  replicas: number;
  @Expose()
  @Prop({type: StatusFunctions})
  status: StatusFunctions;
  @Expose()
  @Prop({type: Autoscaler})
  autoscaler :Autoscaler;
  @Expose()
  createdAt: Date;
  @Expose()
  updatedAt: Date;
}

export const FunctionsSchema = SchemaFactory.createForClass(Functions)
FunctionsSchema.index({ name: 1, idNamespace: 1 }, { unique: true })
