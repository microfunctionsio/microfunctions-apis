import {Expose} from 'class-transformer';
import {Environments} from '../classes/environments';

import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';

import {Document} from "mongoose";

export type SourceCodeDocument = SourceCode & Document;
@Schema()
export class SourceCode {
  @Expose()
  id: string;
  @Expose()
  @Prop({ required: true })
  sourceCode: string;
  @Expose()
  @Prop({  })
  dependencies: string;
  @Expose()
  @Prop({ required: true, index: true })
  idFunctions: string;
  @Expose()
  @Prop()
  environments: Environments[];
}
export const SourceCodeSchema = SchemaFactory.createForClass(SourceCode);
