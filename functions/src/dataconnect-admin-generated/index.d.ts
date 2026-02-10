import { ConnectorConfig, DataConnect, OperationOptions, ExecuteOperationResponse } from 'firebase-admin/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;


export interface Application_Key {
  id: UUIDString;
  __typename?: 'Application_Key';
}

export interface Company_Key {
  id: UUIDString;
  __typename?: 'Company_Key';
}

export interface CreateApplicationData {
  application_insert: Application_Key;
}

export interface CreateApplicationVariables {
  companyId: UUIDString;
  userId: UUIDString;
  applicationDate: DateString;
  jobTitle: string;
  status: string;
}

export interface GetApplicationsByUserData {
  applications: ({
    id: UUIDString;
    company: {
      name: string;
    };
      applicationDate: DateString;
      jobTitle: string;
      status: string;
  } & Application_Key)[];
}

export interface GetApplicationsByUserVariables {
  userId: UUIDString;
}

export interface Interview_Key {
  id: UUIDString;
  __typename?: 'Interview_Key';
}

export interface ListCompaniesData {
  companies: ({
    id: UUIDString;
    name: string;
    industry?: string | null;
    location?: string | null;
  } & Company_Key)[];
}

export interface Offer_Key {
  id: UUIDString;
  __typename?: 'Offer_Key';
}

export interface UpdateApplicationStatusData {
  application_update?: Application_Key | null;
}

export interface UpdateApplicationStatusVariables {
  id: UUIDString;
  status: string;
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

/** Generated Node Admin SDK operation action function for the 'CreateApplication' Mutation. Allow users to execute without passing in DataConnect. */
export function createApplication(dc: DataConnect, vars: CreateApplicationVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateApplicationData>>;
/** Generated Node Admin SDK operation action function for the 'CreateApplication' Mutation. Allow users to pass in custom DataConnect instances. */
export function createApplication(vars: CreateApplicationVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateApplicationData>>;

/** Generated Node Admin SDK operation action function for the 'GetApplicationsByUser' Query. Allow users to execute without passing in DataConnect. */
export function getApplicationsByUser(dc: DataConnect, vars: GetApplicationsByUserVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetApplicationsByUserData>>;
/** Generated Node Admin SDK operation action function for the 'GetApplicationsByUser' Query. Allow users to pass in custom DataConnect instances. */
export function getApplicationsByUser(vars: GetApplicationsByUserVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetApplicationsByUserData>>;

/** Generated Node Admin SDK operation action function for the 'UpdateApplicationStatus' Mutation. Allow users to execute without passing in DataConnect. */
export function updateApplicationStatus(dc: DataConnect, vars: UpdateApplicationStatusVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateApplicationStatusData>>;
/** Generated Node Admin SDK operation action function for the 'UpdateApplicationStatus' Mutation. Allow users to pass in custom DataConnect instances. */
export function updateApplicationStatus(vars: UpdateApplicationStatusVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateApplicationStatusData>>;

/** Generated Node Admin SDK operation action function for the 'ListCompanies' Query. Allow users to execute without passing in DataConnect. */
export function listCompanies(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<ListCompaniesData>>;
/** Generated Node Admin SDK operation action function for the 'ListCompanies' Query. Allow users to pass in custom DataConnect instances. */
export function listCompanies(options?: OperationOptions): Promise<ExecuteOperationResponse<ListCompaniesData>>;

