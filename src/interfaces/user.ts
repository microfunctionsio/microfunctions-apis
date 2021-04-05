import {ClientType} from "@microfunctions/common";

export interface User {
  email: string;
  id: string;
  provider?: string;
  profileId?: string;
  profiles?: any[];
  namespaces?: any[];
  typeClient?: ClientType;
}
