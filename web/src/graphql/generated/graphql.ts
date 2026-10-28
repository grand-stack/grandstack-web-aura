/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type AuraAccountRelationshipFilters = {
  /** Filter type where all of the related AuraAccounts match this filter */
  all?: AuraAccountWhere | null | undefined;
  /** Filter type where none of the related AuraAccounts match this filter */
  none?: AuraAccountWhere | null | undefined;
  /** Filter type where one of the related AuraAccounts match this filter */
  single?: AuraAccountWhere | null | undefined;
  /** Filter type where some of the related AuraAccounts match this filter */
  some?: AuraAccountWhere | null | undefined;
};

export type AuraAccountTenantsConnectionAggregateInput = {
  AND?: Array<AuraAccountTenantsConnectionAggregateInput> | null | undefined;
  NOT?: AuraAccountTenantsConnectionAggregateInput | null | undefined;
  OR?: Array<AuraAccountTenantsConnectionAggregateInput> | null | undefined;
  count?: ConnectionAggregationCountFilterInput | null | undefined;
  node?: AuraAccountTenantsNodeAggregationWhereInput | null | undefined;
};

export type AuraAccountTenantsConnectionFilters = {
  /** Filter AuraAccounts by aggregating results on related AuraAccountTenantsConnections */
  aggregate?: AuraAccountTenantsConnectionAggregateInput | null | undefined;
  /** Return AuraAccounts where all of the related AuraAccountTenantsConnections match this filter */
  all?: AuraAccountTenantsConnectionWhere | null | undefined;
  /** Return AuraAccounts where none of the related AuraAccountTenantsConnections match this filter */
  none?: AuraAccountTenantsConnectionWhere | null | undefined;
  /** Return AuraAccounts where one of the related AuraAccountTenantsConnections match this filter */
  single?: AuraAccountTenantsConnectionWhere | null | undefined;
  /** Return AuraAccounts where some of the related AuraAccountTenantsConnections match this filter */
  some?: AuraAccountTenantsConnectionWhere | null | undefined;
};

export type AuraAccountTenantsConnectionWhere = {
  AND?: Array<AuraAccountTenantsConnectionWhere> | null | undefined;
  NOT?: AuraAccountTenantsConnectionWhere | null | undefined;
  OR?: Array<AuraAccountTenantsConnectionWhere> | null | undefined;
  node?: TenantWhere | null | undefined;
};

export type AuraAccountTenantsNodeAggregationWhereInput = {
  AND?: Array<AuraAccountTenantsNodeAggregationWhereInput> | null | undefined;
  NOT?: AuraAccountTenantsNodeAggregationWhereInput | null | undefined;
  OR?: Array<AuraAccountTenantsNodeAggregationWhereInput> | null | undefined;
  auraId?: StringScalarAggregationFilters | null | undefined;
  configsSyncedAt?: StringScalarAggregationFilters | null | undefined;
  name?: StringScalarAggregationFilters | null | undefined;
  syncedAt?: StringScalarAggregationFilters | null | undefined;
};

export type AuraAccountWhere = {
  AND?: Array<AuraAccountWhere> | null | undefined;
  NOT?: AuraAccountWhere | null | undefined;
  OR?: Array<AuraAccountWhere> | null | undefined;
  clientIdHint?: StringScalarFilters | null | undefined;
  connectedAt?: StringScalarFilters | null | undefined;
  id?: IdScalarFilters | null | undefined;
  label?: StringScalarFilters | null | undefined;
  lastSyncAt?: StringScalarFilters | null | undefined;
  status?: ConnectionStatusEnumScalarFilters | null | undefined;
  tenants?: TenantRelationshipFilters | null | undefined;
  tenantsConnection?: AuraAccountTenantsConnectionFilters | null | undefined;
};

/** Boolean filters */
export type BooleanScalarFilters = {
  eq?: boolean | null | undefined;
};

export type CloudProviderInstancesConnectionAggregateInput = {
  AND?: Array<CloudProviderInstancesConnectionAggregateInput> | null | undefined;
  NOT?: CloudProviderInstancesConnectionAggregateInput | null | undefined;
  OR?: Array<CloudProviderInstancesConnectionAggregateInput> | null | undefined;
  count?: ConnectionAggregationCountFilterInput | null | undefined;
  node?: CloudProviderInstancesNodeAggregationWhereInput | null | undefined;
};

export type CloudProviderInstancesConnectionFilters = {
  /** Filter CloudProviders by aggregating results on related CloudProviderInstancesConnections */
  aggregate?: CloudProviderInstancesConnectionAggregateInput | null | undefined;
  /** Return CloudProviders where all of the related CloudProviderInstancesConnections match this filter */
  all?: CloudProviderInstancesConnectionWhere | null | undefined;
  /** Return CloudProviders where none of the related CloudProviderInstancesConnections match this filter */
  none?: CloudProviderInstancesConnectionWhere | null | undefined;
  /** Return CloudProviders where one of the related CloudProviderInstancesConnections match this filter */
  single?: CloudProviderInstancesConnectionWhere | null | undefined;
  /** Return CloudProviders where some of the related CloudProviderInstancesConnections match this filter */
  some?: CloudProviderInstancesConnectionWhere | null | undefined;
};

export type CloudProviderInstancesConnectionWhere = {
  AND?: Array<CloudProviderInstancesConnectionWhere> | null | undefined;
  NOT?: CloudProviderInstancesConnectionWhere | null | undefined;
  OR?: Array<CloudProviderInstancesConnectionWhere> | null | undefined;
  node?: InstanceWhere | null | undefined;
};

export type CloudProviderInstancesNodeAggregationWhereInput = {
  AND?: Array<CloudProviderInstancesNodeAggregationWhereInput> | null | undefined;
  NOT?: CloudProviderInstancesNodeAggregationWhereInput | null | undefined;
  OR?: Array<CloudProviderInstancesNodeAggregationWhereInput> | null | undefined;
  auraId?: StringScalarAggregationFilters | null | undefined;
  cdcEnrichmentMode?: StringScalarAggregationFilters | null | undefined;
  connectionUrl?: StringScalarAggregationFilters | null | undefined;
  createdAt?: StringScalarAggregationFilters | null | undefined;
  customerManagedKeyId?: StringScalarAggregationFilters | null | undefined;
  deletedInAuraAt?: StringScalarAggregationFilters | null | undefined;
  graphNodes?: StringScalarAggregationFilters | null | undefined;
  graphRelationships?: StringScalarAggregationFilters | null | undefined;
  memory?: StringScalarAggregationFilters | null | undefined;
  metricsIntegrationUrl?: StringScalarAggregationFilters | null | undefined;
  name?: StringScalarAggregationFilters | null | undefined;
  region?: StringScalarAggregationFilters | null | undefined;
  secondariesCount?: IntScalarAggregationFilters | null | undefined;
  status?: StringScalarAggregationFilters | null | undefined;
  storage?: StringScalarAggregationFilters | null | undefined;
  syncedAt?: StringScalarAggregationFilters | null | undefined;
  version?: StringScalarAggregationFilters | null | undefined;
};

export type CloudProviderRelationshipFilters = {
  /** Filter type where all of the related CloudProviders match this filter */
  all?: CloudProviderWhere | null | undefined;
  /** Filter type where none of the related CloudProviders match this filter */
  none?: CloudProviderWhere | null | undefined;
  /** Filter type where one of the related CloudProviders match this filter */
  single?: CloudProviderWhere | null | undefined;
  /** Filter type where some of the related CloudProviders match this filter */
  some?: CloudProviderWhere | null | undefined;
};

export type CloudProviderWhere = {
  AND?: Array<CloudProviderWhere> | null | undefined;
  NOT?: CloudProviderWhere | null | undefined;
  OR?: Array<CloudProviderWhere> | null | undefined;
  instances?: InstanceRelationshipFilters | null | undefined;
  instancesConnection?: CloudProviderInstancesConnectionFilters | null | undefined;
  name?: StringScalarFilters | null | undefined;
};

export type ConnectionAggregationCountFilterInput = {
  edges?: IntScalarFilters | null | undefined;
  nodes?: IntScalarFilters | null | undefined;
};

/** Whether the Aura account is currently connected. */
export type ConnectionStatus =
  /** Credentials are stored and the account is being synced. */
  | 'CONNECTED'
  /** The stored client secret has been deleted. Instances, passwords and history are kept. */
  | 'DISCONNECTED';

/** ConnectionStatus filters */
export type ConnectionStatusEnumScalarFilters = {
  eq?: ConnectionStatus | null | undefined;
  in?: Array<ConnectionStatus> | null | undefined;
};

/** Float filters */
export type FloatScalarFilters = {
  eq?: number | null | undefined;
  gt?: number | null | undefined;
  gte?: number | null | undefined;
  in?: Array<number> | null | undefined;
  lt?: number | null | undefined;
  lte?: number | null | undefined;
};

/** ID filters */
export type IdScalarFilters = {
  contains?: string | number | null | undefined;
  endsWith?: string | number | null | undefined;
  eq?: string | number | null | undefined;
  in?: Array<string | number> | null | undefined;
  startsWith?: string | number | null | undefined;
};

export type InstanceCloudConnectionAggregateInput = {
  AND?: Array<InstanceCloudConnectionAggregateInput> | null | undefined;
  NOT?: InstanceCloudConnectionAggregateInput | null | undefined;
  OR?: Array<InstanceCloudConnectionAggregateInput> | null | undefined;
  count?: ConnectionAggregationCountFilterInput | null | undefined;
  node?: InstanceCloudNodeAggregationWhereInput | null | undefined;
};

export type InstanceCloudConnectionFilters = {
  /** Filter Instances by aggregating results on related InstanceCloudConnections */
  aggregate?: InstanceCloudConnectionAggregateInput | null | undefined;
  /** Return Instances where all of the related InstanceCloudConnections match this filter */
  all?: InstanceCloudConnectionWhere | null | undefined;
  /** Return Instances where none of the related InstanceCloudConnections match this filter */
  none?: InstanceCloudConnectionWhere | null | undefined;
  /** Return Instances where one of the related InstanceCloudConnections match this filter */
  single?: InstanceCloudConnectionWhere | null | undefined;
  /** Return Instances where some of the related InstanceCloudConnections match this filter */
  some?: InstanceCloudConnectionWhere | null | undefined;
};

export type InstanceCloudConnectionWhere = {
  AND?: Array<InstanceCloudConnectionWhere> | null | undefined;
  NOT?: InstanceCloudConnectionWhere | null | undefined;
  OR?: Array<InstanceCloudConnectionWhere> | null | undefined;
  node?: CloudProviderWhere | null | undefined;
};

export type InstanceCloudNodeAggregationWhereInput = {
  AND?: Array<InstanceCloudNodeAggregationWhereInput> | null | undefined;
  NOT?: InstanceCloudNodeAggregationWhereInput | null | undefined;
  OR?: Array<InstanceCloudNodeAggregationWhereInput> | null | undefined;
  name?: StringScalarAggregationFilters | null | undefined;
};

export type InstanceConfigurationRelationshipFilters = {
  /** Filter type where all of the related InstanceConfigurations match this filter */
  all?: InstanceConfigurationWhere | null | undefined;
  /** Filter type where none of the related InstanceConfigurations match this filter */
  none?: InstanceConfigurationWhere | null | undefined;
  /** Filter type where one of the related InstanceConfigurations match this filter */
  single?: InstanceConfigurationWhere | null | undefined;
  /** Filter type where some of the related InstanceConfigurations match this filter */
  some?: InstanceConfigurationWhere | null | undefined;
};

export type InstanceConfigurationTenantConnectionAggregateInput = {
  AND?: Array<InstanceConfigurationTenantConnectionAggregateInput> | null | undefined;
  NOT?: InstanceConfigurationTenantConnectionAggregateInput | null | undefined;
  OR?: Array<InstanceConfigurationTenantConnectionAggregateInput> | null | undefined;
  count?: ConnectionAggregationCountFilterInput | null | undefined;
  node?: InstanceConfigurationTenantNodeAggregationWhereInput | null | undefined;
};

export type InstanceConfigurationTenantConnectionFilters = {
  /** Filter InstanceConfigurations by aggregating results on related InstanceConfigurationTenantConnections */
  aggregate?: InstanceConfigurationTenantConnectionAggregateInput | null | undefined;
  /** Return InstanceConfigurations where all of the related InstanceConfigurationTenantConnections match this filter */
  all?: InstanceConfigurationTenantConnectionWhere | null | undefined;
  /** Return InstanceConfigurations where none of the related InstanceConfigurationTenantConnections match this filter */
  none?: InstanceConfigurationTenantConnectionWhere | null | undefined;
  /** Return InstanceConfigurations where one of the related InstanceConfigurationTenantConnections match this filter */
  single?: InstanceConfigurationTenantConnectionWhere | null | undefined;
  /** Return InstanceConfigurations where some of the related InstanceConfigurationTenantConnections match this filter */
  some?: InstanceConfigurationTenantConnectionWhere | null | undefined;
};

export type InstanceConfigurationTenantConnectionWhere = {
  AND?: Array<InstanceConfigurationTenantConnectionWhere> | null | undefined;
  NOT?: InstanceConfigurationTenantConnectionWhere | null | undefined;
  OR?: Array<InstanceConfigurationTenantConnectionWhere> | null | undefined;
  node?: TenantWhere | null | undefined;
};

export type InstanceConfigurationTenantNodeAggregationWhereInput = {
  AND?: Array<InstanceConfigurationTenantNodeAggregationWhereInput> | null | undefined;
  NOT?: InstanceConfigurationTenantNodeAggregationWhereInput | null | undefined;
  OR?: Array<InstanceConfigurationTenantNodeAggregationWhereInput> | null | undefined;
  auraId?: StringScalarAggregationFilters | null | undefined;
  configsSyncedAt?: StringScalarAggregationFilters | null | undefined;
  name?: StringScalarAggregationFilters | null | undefined;
  syncedAt?: StringScalarAggregationFilters | null | undefined;
};

export type InstanceConfigurationWhere = {
  AND?: Array<InstanceConfigurationWhere> | null | undefined;
  NOT?: InstanceConfigurationWhere | null | undefined;
  OR?: Array<InstanceConfigurationWhere> | null | undefined;
  cloudProvider?: StringScalarFilters | null | undefined;
  key?: StringScalarFilters | null | undefined;
  memory?: StringScalarFilters | null | undefined;
  region?: StringScalarFilters | null | undefined;
  regionName?: StringScalarFilters | null | undefined;
  storage?: StringScalarFilters | null | undefined;
  syncedAt?: StringScalarFilters | null | undefined;
  tenant?: TenantRelationshipFilters | null | undefined;
  tenantConnection?: InstanceConfigurationTenantConnectionFilters | null | undefined;
  type?: StringScalarFilters | null | undefined;
  version?: StringScalarFilters | null | undefined;
};

export type InstanceOperationsConnectionAggregateInput = {
  AND?: Array<InstanceOperationsConnectionAggregateInput> | null | undefined;
  NOT?: InstanceOperationsConnectionAggregateInput | null | undefined;
  OR?: Array<InstanceOperationsConnectionAggregateInput> | null | undefined;
  count?: ConnectionAggregationCountFilterInput | null | undefined;
  node?: InstanceOperationsNodeAggregationWhereInput | null | undefined;
};

export type InstanceOperationsConnectionFilters = {
  /** Filter Instances by aggregating results on related InstanceOperationsConnections */
  aggregate?: InstanceOperationsConnectionAggregateInput | null | undefined;
  /** Return Instances where all of the related InstanceOperationsConnections match this filter */
  all?: InstanceOperationsConnectionWhere | null | undefined;
  /** Return Instances where none of the related InstanceOperationsConnections match this filter */
  none?: InstanceOperationsConnectionWhere | null | undefined;
  /** Return Instances where one of the related InstanceOperationsConnections match this filter */
  single?: InstanceOperationsConnectionWhere | null | undefined;
  /** Return Instances where some of the related InstanceOperationsConnections match this filter */
  some?: InstanceOperationsConnectionWhere | null | undefined;
};

export type InstanceOperationsConnectionWhere = {
  AND?: Array<InstanceOperationsConnectionWhere> | null | undefined;
  NOT?: InstanceOperationsConnectionWhere | null | undefined;
  OR?: Array<InstanceOperationsConnectionWhere> | null | undefined;
  node?: OperationWhere | null | undefined;
};

export type InstanceOperationsNodeAggregationWhereInput = {
  AND?: Array<InstanceOperationsNodeAggregationWhereInput> | null | undefined;
  NOT?: InstanceOperationsNodeAggregationWhereInput | null | undefined;
  OR?: Array<InstanceOperationsNodeAggregationWhereInput> | null | undefined;
  basedOnSyncedAt?: StringScalarAggregationFilters | null | undefined;
  before?: StringScalarAggregationFilters | null | undefined;
  confirmedAt?: StringScalarAggregationFilters | null | undefined;
  createdAt?: StringScalarAggregationFilters | null | undefined;
  desired?: StringScalarAggregationFilters | null | undefined;
  diff?: StringScalarAggregationFilters | null | undefined;
  error?: StringScalarAggregationFilters | null | undefined;
  finishedAt?: StringScalarAggregationFilters | null | undefined;
  requestedBy?: StringScalarAggregationFilters | null | undefined;
  updatedAt?: StringScalarAggregationFilters | null | undefined;
};

export type InstanceRelationshipFilters = {
  /** Filter type where all of the related Instances match this filter */
  all?: InstanceWhere | null | undefined;
  /** Filter type where none of the related Instances match this filter */
  none?: InstanceWhere | null | undefined;
  /** Filter type where one of the related Instances match this filter */
  single?: InstanceWhere | null | undefined;
  /** Filter type where some of the related Instances match this filter */
  some?: InstanceWhere | null | undefined;
};

/** The coarse state of an instance, derived from the 13 statuses the Aura API reports. */
export type InstanceStatusGroup =
  /** loading failed. */
  | 'FAILED'
  /** creating, updating, pausing, resuming, suspending, loading, restoring, overwriting or destroying. Edit, pause and delete are locked. */
  | 'IN_PROGRESS'
  /** running. */
  | 'READY'
  /** paused or suspended. */
  | 'STOPPED';

/** InstanceStatusGroup filters */
export type InstanceStatusGroupEnumScalarFilters = {
  eq?: InstanceStatusGroup | null | undefined;
  in?: Array<InstanceStatusGroup> | null | undefined;
};

export type InstanceTenantConnectionAggregateInput = {
  AND?: Array<InstanceTenantConnectionAggregateInput> | null | undefined;
  NOT?: InstanceTenantConnectionAggregateInput | null | undefined;
  OR?: Array<InstanceTenantConnectionAggregateInput> | null | undefined;
  count?: ConnectionAggregationCountFilterInput | null | undefined;
  node?: InstanceTenantNodeAggregationWhereInput | null | undefined;
};

export type InstanceTenantConnectionFilters = {
  /** Filter Instances by aggregating results on related InstanceTenantConnections */
  aggregate?: InstanceTenantConnectionAggregateInput | null | undefined;
  /** Return Instances where all of the related InstanceTenantConnections match this filter */
  all?: InstanceTenantConnectionWhere | null | undefined;
  /** Return Instances where none of the related InstanceTenantConnections match this filter */
  none?: InstanceTenantConnectionWhere | null | undefined;
  /** Return Instances where one of the related InstanceTenantConnections match this filter */
  single?: InstanceTenantConnectionWhere | null | undefined;
  /** Return Instances where some of the related InstanceTenantConnections match this filter */
  some?: InstanceTenantConnectionWhere | null | undefined;
};

export type InstanceTenantConnectionWhere = {
  AND?: Array<InstanceTenantConnectionWhere> | null | undefined;
  NOT?: InstanceTenantConnectionWhere | null | undefined;
  OR?: Array<InstanceTenantConnectionWhere> | null | undefined;
  node?: TenantWhere | null | undefined;
};

export type InstanceTenantNodeAggregationWhereInput = {
  AND?: Array<InstanceTenantNodeAggregationWhereInput> | null | undefined;
  NOT?: InstanceTenantNodeAggregationWhereInput | null | undefined;
  OR?: Array<InstanceTenantNodeAggregationWhereInput> | null | undefined;
  auraId?: StringScalarAggregationFilters | null | undefined;
  configsSyncedAt?: StringScalarAggregationFilters | null | undefined;
  name?: StringScalarAggregationFilters | null | undefined;
  syncedAt?: StringScalarAggregationFilters | null | undefined;
};

export type InstanceTierConnectionAggregateInput = {
  AND?: Array<InstanceTierConnectionAggregateInput> | null | undefined;
  NOT?: InstanceTierConnectionAggregateInput | null | undefined;
  OR?: Array<InstanceTierConnectionAggregateInput> | null | undefined;
  count?: ConnectionAggregationCountFilterInput | null | undefined;
  node?: InstanceTierNodeAggregationWhereInput | null | undefined;
};

export type InstanceTierConnectionFilters = {
  /** Filter Instances by aggregating results on related InstanceTierConnections */
  aggregate?: InstanceTierConnectionAggregateInput | null | undefined;
  /** Return Instances where all of the related InstanceTierConnections match this filter */
  all?: InstanceTierConnectionWhere | null | undefined;
  /** Return Instances where none of the related InstanceTierConnections match this filter */
  none?: InstanceTierConnectionWhere | null | undefined;
  /** Return Instances where one of the related InstanceTierConnections match this filter */
  single?: InstanceTierConnectionWhere | null | undefined;
  /** Return Instances where some of the related InstanceTierConnections match this filter */
  some?: InstanceTierConnectionWhere | null | undefined;
};

export type InstanceTierConnectionWhere = {
  AND?: Array<InstanceTierConnectionWhere> | null | undefined;
  NOT?: InstanceTierConnectionWhere | null | undefined;
  OR?: Array<InstanceTierConnectionWhere> | null | undefined;
  node?: TierWhere | null | undefined;
};

export type InstanceTierNodeAggregationWhereInput = {
  AND?: Array<InstanceTierNodeAggregationWhereInput> | null | undefined;
  NOT?: InstanceTierNodeAggregationWhereInput | null | undefined;
  OR?: Array<InstanceTierNodeAggregationWhereInput> | null | undefined;
  label?: StringScalarAggregationFilters | null | undefined;
  type?: StringScalarAggregationFilters | null | undefined;
};

export type InstanceWhere = {
  AND?: Array<InstanceWhere> | null | undefined;
  NOT?: InstanceWhere | null | undefined;
  OR?: Array<InstanceWhere> | null | undefined;
  auraId?: StringScalarFilters | null | undefined;
  cdcEnrichmentMode?: StringScalarFilters | null | undefined;
  cloud?: CloudProviderRelationshipFilters | null | undefined;
  cloudConnection?: InstanceCloudConnectionFilters | null | undefined;
  connectionUrl?: StringScalarFilters | null | undefined;
  createdAt?: StringScalarFilters | null | undefined;
  credentialUsername?: StringScalarFilters | null | undefined;
  customerManagedKeyId?: StringScalarFilters | null | undefined;
  deletedInAuraAt?: StringScalarFilters | null | undefined;
  graphAnalyticsPlugin?: BooleanScalarFilters | null | undefined;
  graphNodes?: StringScalarFilters | null | undefined;
  graphRelationships?: StringScalarFilters | null | undefined;
  hasStoredPassword?: BooleanScalarFilters | null | undefined;
  memory?: StringScalarFilters | null | undefined;
  metricsIntegrationUrl?: StringScalarFilters | null | undefined;
  name?: StringScalarFilters | null | undefined;
  operations?: OperationRelationshipFilters | null | undefined;
  operationsConnection?: InstanceOperationsConnectionFilters | null | undefined;
  passwordRevealCount?: IntScalarFilters | null | undefined;
  region?: StringScalarFilters | null | undefined;
  secondariesCount?: IntScalarFilters | null | undefined;
  status?: StringScalarFilters | null | undefined;
  statusGroup?: InstanceStatusGroupEnumScalarFilters | null | undefined;
  storage?: StringScalarFilters | null | undefined;
  syncedAt?: StringScalarFilters | null | undefined;
  tenant?: TenantRelationshipFilters | null | undefined;
  tenantConnection?: InstanceTenantConnectionFilters | null | undefined;
  tier?: TierRelationshipFilters | null | undefined;
  tierConnection?: InstanceTierConnectionFilters | null | undefined;
  vectorOptimized?: BooleanScalarFilters | null | undefined;
  version?: StringScalarFilters | null | undefined;
};

/** Filters for an aggregation of an int field */
export type IntScalarAggregationFilters = {
  average?: FloatScalarFilters | null | undefined;
  max?: IntScalarFilters | null | undefined;
  min?: IntScalarFilters | null | undefined;
  sum?: IntScalarFilters | null | undefined;
};

/** Int filters */
export type IntScalarFilters = {
  eq?: number | null | undefined;
  gt?: number | null | undefined;
  gte?: number | null | undefined;
  in?: Array<number> | null | undefined;
  lt?: number | null | undefined;
  lte?: number | null | undefined;
};

/** What an operation does to an instance. */
export type OperationKind =
  /** Create a new instance. */
  | 'CREATE'
  /** Delete an instance. Irreversible. */
  | 'DELETE'
  /** Pause an instance. */
  | 'PAUSE'
  /** Resume a paused instance. */
  | 'RESUME'
  /** Rename, resize or change the vector and analytics settings. */
  | 'UPDATE';

/** OperationKind filters */
export type OperationKindEnumScalarFilters = {
  eq?: OperationKind | null | undefined;
  in?: Array<OperationKind> | null | undefined;
};

export type OperationRelationshipFilters = {
  /** Filter type where all of the related Operations match this filter */
  all?: OperationWhere | null | undefined;
  /** Filter type where none of the related Operations match this filter */
  none?: OperationWhere | null | undefined;
  /** Filter type where one of the related Operations match this filter */
  single?: OperationWhere | null | undefined;
  /** Filter type where some of the related Operations match this filter */
  some?: OperationWhere | null | undefined;
};

/** Where an operation is in plan, review, confirm, progress. */
export type OperationStatus =
  /** Withdrawn before it was sent. */
  | 'CANCELLED'
  /** Confirmed by a person. The reconciler may now call Aura. */
  | 'CONFIRMED'
  /** Aura rejected it or the instance ended in a failed state. */
  | 'FAILED'
  /** Planned and shown for review. Nothing has been sent to Aura. */
  | 'PLANNED'
  /** Sent to Aura and being followed until the instance settles. */
  | 'RUNNING'
  /** Finished as planned. */
  | 'SUCCEEDED';

/** OperationStatus filters */
export type OperationStatusEnumScalarFilters = {
  eq?: OperationStatus | null | undefined;
  in?: Array<OperationStatus> | null | undefined;
};

export type OperationStepOperationConnectionAggregateInput = {
  AND?: Array<OperationStepOperationConnectionAggregateInput> | null | undefined;
  NOT?: OperationStepOperationConnectionAggregateInput | null | undefined;
  OR?: Array<OperationStepOperationConnectionAggregateInput> | null | undefined;
  count?: ConnectionAggregationCountFilterInput | null | undefined;
  node?: OperationStepOperationNodeAggregationWhereInput | null | undefined;
};

export type OperationStepOperationConnectionFilters = {
  /** Filter OperationSteps by aggregating results on related OperationStepOperationConnections */
  aggregate?: OperationStepOperationConnectionAggregateInput | null | undefined;
  /** Return OperationSteps where all of the related OperationStepOperationConnections match this filter */
  all?: OperationStepOperationConnectionWhere | null | undefined;
  /** Return OperationSteps where none of the related OperationStepOperationConnections match this filter */
  none?: OperationStepOperationConnectionWhere | null | undefined;
  /** Return OperationSteps where one of the related OperationStepOperationConnections match this filter */
  single?: OperationStepOperationConnectionWhere | null | undefined;
  /** Return OperationSteps where some of the related OperationStepOperationConnections match this filter */
  some?: OperationStepOperationConnectionWhere | null | undefined;
};

export type OperationStepOperationConnectionWhere = {
  AND?: Array<OperationStepOperationConnectionWhere> | null | undefined;
  NOT?: OperationStepOperationConnectionWhere | null | undefined;
  OR?: Array<OperationStepOperationConnectionWhere> | null | undefined;
  node?: OperationWhere | null | undefined;
};

export type OperationStepOperationNodeAggregationWhereInput = {
  AND?: Array<OperationStepOperationNodeAggregationWhereInput> | null | undefined;
  NOT?: OperationStepOperationNodeAggregationWhereInput | null | undefined;
  OR?: Array<OperationStepOperationNodeAggregationWhereInput> | null | undefined;
  basedOnSyncedAt?: StringScalarAggregationFilters | null | undefined;
  before?: StringScalarAggregationFilters | null | undefined;
  confirmedAt?: StringScalarAggregationFilters | null | undefined;
  createdAt?: StringScalarAggregationFilters | null | undefined;
  desired?: StringScalarAggregationFilters | null | undefined;
  diff?: StringScalarAggregationFilters | null | undefined;
  error?: StringScalarAggregationFilters | null | undefined;
  finishedAt?: StringScalarAggregationFilters | null | undefined;
  requestedBy?: StringScalarAggregationFilters | null | undefined;
  updatedAt?: StringScalarAggregationFilters | null | undefined;
};

export type OperationStepRelationshipFilters = {
  /** Filter type where all of the related OperationSteps match this filter */
  all?: OperationStepWhere | null | undefined;
  /** Filter type where none of the related OperationSteps match this filter */
  none?: OperationStepWhere | null | undefined;
  /** Filter type where one of the related OperationSteps match this filter */
  single?: OperationStepWhere | null | undefined;
  /** Filter type where some of the related OperationSteps match this filter */
  some?: OperationStepWhere | null | undefined;
};

export type OperationStepWhere = {
  AND?: Array<OperationStepWhere> | null | undefined;
  NOT?: OperationStepWhere | null | undefined;
  OR?: Array<OperationStepWhere> | null | undefined;
  at?: StringScalarFilters | null | undefined;
  detail?: StringScalarFilters | null | undefined;
  label?: StringScalarFilters | null | undefined;
  operation?: OperationRelationshipFilters | null | undefined;
  operationConnection?: OperationStepOperationConnectionFilters | null | undefined;
  seq?: IntScalarFilters | null | undefined;
  status?: StepStatusEnumScalarFilters | null | undefined;
};

export type OperationStepsConnectionAggregateInput = {
  AND?: Array<OperationStepsConnectionAggregateInput> | null | undefined;
  NOT?: OperationStepsConnectionAggregateInput | null | undefined;
  OR?: Array<OperationStepsConnectionAggregateInput> | null | undefined;
  count?: ConnectionAggregationCountFilterInput | null | undefined;
  node?: OperationStepsNodeAggregationWhereInput | null | undefined;
};

export type OperationStepsConnectionFilters = {
  /** Filter Operations by aggregating results on related OperationStepsConnections */
  aggregate?: OperationStepsConnectionAggregateInput | null | undefined;
  /** Return Operations where all of the related OperationStepsConnections match this filter */
  all?: OperationStepsConnectionWhere | null | undefined;
  /** Return Operations where none of the related OperationStepsConnections match this filter */
  none?: OperationStepsConnectionWhere | null | undefined;
  /** Return Operations where one of the related OperationStepsConnections match this filter */
  single?: OperationStepsConnectionWhere | null | undefined;
  /** Return Operations where some of the related OperationStepsConnections match this filter */
  some?: OperationStepsConnectionWhere | null | undefined;
};

export type OperationStepsConnectionWhere = {
  AND?: Array<OperationStepsConnectionWhere> | null | undefined;
  NOT?: OperationStepsConnectionWhere | null | undefined;
  OR?: Array<OperationStepsConnectionWhere> | null | undefined;
  node?: OperationStepWhere | null | undefined;
};

export type OperationStepsNodeAggregationWhereInput = {
  AND?: Array<OperationStepsNodeAggregationWhereInput> | null | undefined;
  NOT?: OperationStepsNodeAggregationWhereInput | null | undefined;
  OR?: Array<OperationStepsNodeAggregationWhereInput> | null | undefined;
  at?: StringScalarAggregationFilters | null | undefined;
  detail?: StringScalarAggregationFilters | null | undefined;
  label?: StringScalarAggregationFilters | null | undefined;
  seq?: IntScalarAggregationFilters | null | undefined;
};

export type OperationTargetConnectionAggregateInput = {
  AND?: Array<OperationTargetConnectionAggregateInput> | null | undefined;
  NOT?: OperationTargetConnectionAggregateInput | null | undefined;
  OR?: Array<OperationTargetConnectionAggregateInput> | null | undefined;
  count?: ConnectionAggregationCountFilterInput | null | undefined;
  node?: OperationTargetNodeAggregationWhereInput | null | undefined;
};

export type OperationTargetConnectionFilters = {
  /** Filter Operations by aggregating results on related OperationTargetConnections */
  aggregate?: OperationTargetConnectionAggregateInput | null | undefined;
  /** Return Operations where all of the related OperationTargetConnections match this filter */
  all?: OperationTargetConnectionWhere | null | undefined;
  /** Return Operations where none of the related OperationTargetConnections match this filter */
  none?: OperationTargetConnectionWhere | null | undefined;
  /** Return Operations where one of the related OperationTargetConnections match this filter */
  single?: OperationTargetConnectionWhere | null | undefined;
  /** Return Operations where some of the related OperationTargetConnections match this filter */
  some?: OperationTargetConnectionWhere | null | undefined;
};

export type OperationTargetConnectionWhere = {
  AND?: Array<OperationTargetConnectionWhere> | null | undefined;
  NOT?: OperationTargetConnectionWhere | null | undefined;
  OR?: Array<OperationTargetConnectionWhere> | null | undefined;
  node?: InstanceWhere | null | undefined;
};

export type OperationTargetNodeAggregationWhereInput = {
  AND?: Array<OperationTargetNodeAggregationWhereInput> | null | undefined;
  NOT?: OperationTargetNodeAggregationWhereInput | null | undefined;
  OR?: Array<OperationTargetNodeAggregationWhereInput> | null | undefined;
  auraId?: StringScalarAggregationFilters | null | undefined;
  cdcEnrichmentMode?: StringScalarAggregationFilters | null | undefined;
  connectionUrl?: StringScalarAggregationFilters | null | undefined;
  createdAt?: StringScalarAggregationFilters | null | undefined;
  customerManagedKeyId?: StringScalarAggregationFilters | null | undefined;
  deletedInAuraAt?: StringScalarAggregationFilters | null | undefined;
  graphNodes?: StringScalarAggregationFilters | null | undefined;
  graphRelationships?: StringScalarAggregationFilters | null | undefined;
  memory?: StringScalarAggregationFilters | null | undefined;
  metricsIntegrationUrl?: StringScalarAggregationFilters | null | undefined;
  name?: StringScalarAggregationFilters | null | undefined;
  region?: StringScalarAggregationFilters | null | undefined;
  secondariesCount?: IntScalarAggregationFilters | null | undefined;
  status?: StringScalarAggregationFilters | null | undefined;
  storage?: StringScalarAggregationFilters | null | undefined;
  syncedAt?: StringScalarAggregationFilters | null | undefined;
  version?: StringScalarAggregationFilters | null | undefined;
};

export type OperationWhere = {
  AND?: Array<OperationWhere> | null | undefined;
  NOT?: OperationWhere | null | undefined;
  OR?: Array<OperationWhere> | null | undefined;
  basedOnSyncedAt?: StringScalarFilters | null | undefined;
  before?: StringScalarFilters | null | undefined;
  confirmedAt?: StringScalarFilters | null | undefined;
  createdAt?: StringScalarFilters | null | undefined;
  desired?: StringScalarFilters | null | undefined;
  diff?: StringScalarFilters | null | undefined;
  error?: StringScalarFilters | null | undefined;
  finishedAt?: StringScalarFilters | null | undefined;
  id?: IdScalarFilters | null | undefined;
  kind?: OperationKindEnumScalarFilters | null | undefined;
  requestedBy?: StringScalarFilters | null | undefined;
  status?: OperationStatusEnumScalarFilters | null | undefined;
  steps?: OperationStepRelationshipFilters | null | undefined;
  stepsConnection?: OperationStepsConnectionFilters | null | undefined;
  target?: InstanceRelationshipFilters | null | undefined;
  targetConnection?: OperationTargetConnectionFilters | null | undefined;
  updatedAt?: StringScalarFilters | null | undefined;
};

/** State of one step in an operation's timeline. */
export type StepStatus =
  /** In progress. */
  | 'ACTIVE'
  /** Finished. */
  | 'DONE'
  /** Failed. */
  | 'FAILED'
  /** Not started. */
  | 'PENDING';

/** StepStatus filters */
export type StepStatusEnumScalarFilters = {
  eq?: StepStatus | null | undefined;
  in?: Array<StepStatus> | null | undefined;
};

/** Filters for an aggregation of a string field */
export type StringScalarAggregationFilters = {
  averageLength?: FloatScalarFilters | null | undefined;
  longestLength?: IntScalarFilters | null | undefined;
  shortestLength?: IntScalarFilters | null | undefined;
};

/** String filters */
export type StringScalarFilters = {
  contains?: string | null | undefined;
  endsWith?: string | null | undefined;
  eq?: string | null | undefined;
  in?: Array<string> | null | undefined;
  startsWith?: string | null | undefined;
};

/** How a sync run ended. */
export type SyncStatus =
  /** Stopped with an error. */
  | 'FAILED'
  /** Still running. */
  | 'RUNNING'
  /** Finished, but Aura asked us to slow down and we retried. */
  | 'SLOWED'
  /** Finished without trouble. */
  | 'SUCCEEDED';

export type TenantAccountConnectionAggregateInput = {
  AND?: Array<TenantAccountConnectionAggregateInput> | null | undefined;
  NOT?: TenantAccountConnectionAggregateInput | null | undefined;
  OR?: Array<TenantAccountConnectionAggregateInput> | null | undefined;
  count?: ConnectionAggregationCountFilterInput | null | undefined;
  node?: TenantAccountNodeAggregationWhereInput | null | undefined;
};

export type TenantAccountConnectionFilters = {
  /** Filter Tenants by aggregating results on related TenantAccountConnections */
  aggregate?: TenantAccountConnectionAggregateInput | null | undefined;
  /** Return Tenants where all of the related TenantAccountConnections match this filter */
  all?: TenantAccountConnectionWhere | null | undefined;
  /** Return Tenants where none of the related TenantAccountConnections match this filter */
  none?: TenantAccountConnectionWhere | null | undefined;
  /** Return Tenants where one of the related TenantAccountConnections match this filter */
  single?: TenantAccountConnectionWhere | null | undefined;
  /** Return Tenants where some of the related TenantAccountConnections match this filter */
  some?: TenantAccountConnectionWhere | null | undefined;
};

export type TenantAccountConnectionWhere = {
  AND?: Array<TenantAccountConnectionWhere> | null | undefined;
  NOT?: TenantAccountConnectionWhere | null | undefined;
  OR?: Array<TenantAccountConnectionWhere> | null | undefined;
  node?: AuraAccountWhere | null | undefined;
};

export type TenantAccountNodeAggregationWhereInput = {
  AND?: Array<TenantAccountNodeAggregationWhereInput> | null | undefined;
  NOT?: TenantAccountNodeAggregationWhereInput | null | undefined;
  OR?: Array<TenantAccountNodeAggregationWhereInput> | null | undefined;
  clientIdHint?: StringScalarAggregationFilters | null | undefined;
  connectedAt?: StringScalarAggregationFilters | null | undefined;
  label?: StringScalarAggregationFilters | null | undefined;
  lastSyncAt?: StringScalarAggregationFilters | null | undefined;
};

export type TenantConfigurationsConnectionAggregateInput = {
  AND?: Array<TenantConfigurationsConnectionAggregateInput> | null | undefined;
  NOT?: TenantConfigurationsConnectionAggregateInput | null | undefined;
  OR?: Array<TenantConfigurationsConnectionAggregateInput> | null | undefined;
  count?: ConnectionAggregationCountFilterInput | null | undefined;
  node?: TenantConfigurationsNodeAggregationWhereInput | null | undefined;
};

export type TenantConfigurationsConnectionFilters = {
  /** Filter Tenants by aggregating results on related TenantConfigurationsConnections */
  aggregate?: TenantConfigurationsConnectionAggregateInput | null | undefined;
  /** Return Tenants where all of the related TenantConfigurationsConnections match this filter */
  all?: TenantConfigurationsConnectionWhere | null | undefined;
  /** Return Tenants where none of the related TenantConfigurationsConnections match this filter */
  none?: TenantConfigurationsConnectionWhere | null | undefined;
  /** Return Tenants where one of the related TenantConfigurationsConnections match this filter */
  single?: TenantConfigurationsConnectionWhere | null | undefined;
  /** Return Tenants where some of the related TenantConfigurationsConnections match this filter */
  some?: TenantConfigurationsConnectionWhere | null | undefined;
};

export type TenantConfigurationsConnectionWhere = {
  AND?: Array<TenantConfigurationsConnectionWhere> | null | undefined;
  NOT?: TenantConfigurationsConnectionWhere | null | undefined;
  OR?: Array<TenantConfigurationsConnectionWhere> | null | undefined;
  node?: InstanceConfigurationWhere | null | undefined;
};

export type TenantConfigurationsNodeAggregationWhereInput = {
  AND?: Array<TenantConfigurationsNodeAggregationWhereInput> | null | undefined;
  NOT?: TenantConfigurationsNodeAggregationWhereInput | null | undefined;
  OR?: Array<TenantConfigurationsNodeAggregationWhereInput> | null | undefined;
  cloudProvider?: StringScalarAggregationFilters | null | undefined;
  key?: StringScalarAggregationFilters | null | undefined;
  memory?: StringScalarAggregationFilters | null | undefined;
  region?: StringScalarAggregationFilters | null | undefined;
  regionName?: StringScalarAggregationFilters | null | undefined;
  storage?: StringScalarAggregationFilters | null | undefined;
  syncedAt?: StringScalarAggregationFilters | null | undefined;
  type?: StringScalarAggregationFilters | null | undefined;
  version?: StringScalarAggregationFilters | null | undefined;
};

export type TenantInstancesConnectionAggregateInput = {
  AND?: Array<TenantInstancesConnectionAggregateInput> | null | undefined;
  NOT?: TenantInstancesConnectionAggregateInput | null | undefined;
  OR?: Array<TenantInstancesConnectionAggregateInput> | null | undefined;
  count?: ConnectionAggregationCountFilterInput | null | undefined;
  node?: TenantInstancesNodeAggregationWhereInput | null | undefined;
};

export type TenantInstancesConnectionFilters = {
  /** Filter Tenants by aggregating results on related TenantInstancesConnections */
  aggregate?: TenantInstancesConnectionAggregateInput | null | undefined;
  /** Return Tenants where all of the related TenantInstancesConnections match this filter */
  all?: TenantInstancesConnectionWhere | null | undefined;
  /** Return Tenants where none of the related TenantInstancesConnections match this filter */
  none?: TenantInstancesConnectionWhere | null | undefined;
  /** Return Tenants where one of the related TenantInstancesConnections match this filter */
  single?: TenantInstancesConnectionWhere | null | undefined;
  /** Return Tenants where some of the related TenantInstancesConnections match this filter */
  some?: TenantInstancesConnectionWhere | null | undefined;
};

export type TenantInstancesConnectionWhere = {
  AND?: Array<TenantInstancesConnectionWhere> | null | undefined;
  NOT?: TenantInstancesConnectionWhere | null | undefined;
  OR?: Array<TenantInstancesConnectionWhere> | null | undefined;
  node?: InstanceWhere | null | undefined;
};

export type TenantInstancesNodeAggregationWhereInput = {
  AND?: Array<TenantInstancesNodeAggregationWhereInput> | null | undefined;
  NOT?: TenantInstancesNodeAggregationWhereInput | null | undefined;
  OR?: Array<TenantInstancesNodeAggregationWhereInput> | null | undefined;
  auraId?: StringScalarAggregationFilters | null | undefined;
  cdcEnrichmentMode?: StringScalarAggregationFilters | null | undefined;
  connectionUrl?: StringScalarAggregationFilters | null | undefined;
  createdAt?: StringScalarAggregationFilters | null | undefined;
  customerManagedKeyId?: StringScalarAggregationFilters | null | undefined;
  deletedInAuraAt?: StringScalarAggregationFilters | null | undefined;
  graphNodes?: StringScalarAggregationFilters | null | undefined;
  graphRelationships?: StringScalarAggregationFilters | null | undefined;
  memory?: StringScalarAggregationFilters | null | undefined;
  metricsIntegrationUrl?: StringScalarAggregationFilters | null | undefined;
  name?: StringScalarAggregationFilters | null | undefined;
  region?: StringScalarAggregationFilters | null | undefined;
  secondariesCount?: IntScalarAggregationFilters | null | undefined;
  status?: StringScalarAggregationFilters | null | undefined;
  storage?: StringScalarAggregationFilters | null | undefined;
  syncedAt?: StringScalarAggregationFilters | null | undefined;
  version?: StringScalarAggregationFilters | null | undefined;
};

export type TenantRelationshipFilters = {
  /** Filter type where all of the related Tenants match this filter */
  all?: TenantWhere | null | undefined;
  /** Filter type where none of the related Tenants match this filter */
  none?: TenantWhere | null | undefined;
  /** Filter type where one of the related Tenants match this filter */
  single?: TenantWhere | null | undefined;
  /** Filter type where some of the related Tenants match this filter */
  some?: TenantWhere | null | undefined;
};

export type TenantWhere = {
  AND?: Array<TenantWhere> | null | undefined;
  NOT?: TenantWhere | null | undefined;
  OR?: Array<TenantWhere> | null | undefined;
  account?: AuraAccountRelationshipFilters | null | undefined;
  accountConnection?: TenantAccountConnectionFilters | null | undefined;
  auraId?: StringScalarFilters | null | undefined;
  configsSyncedAt?: StringScalarFilters | null | undefined;
  configurations?: InstanceConfigurationRelationshipFilters | null | undefined;
  configurationsConnection?: TenantConfigurationsConnectionFilters | null | undefined;
  instances?: InstanceRelationshipFilters | null | undefined;
  instancesConnection?: TenantInstancesConnectionFilters | null | undefined;
  name?: StringScalarFilters | null | undefined;
  syncedAt?: StringScalarFilters | null | undefined;
};

export type TierInstancesConnectionAggregateInput = {
  AND?: Array<TierInstancesConnectionAggregateInput> | null | undefined;
  NOT?: TierInstancesConnectionAggregateInput | null | undefined;
  OR?: Array<TierInstancesConnectionAggregateInput> | null | undefined;
  count?: ConnectionAggregationCountFilterInput | null | undefined;
  node?: TierInstancesNodeAggregationWhereInput | null | undefined;
};

export type TierInstancesConnectionFilters = {
  /** Filter Tiers by aggregating results on related TierInstancesConnections */
  aggregate?: TierInstancesConnectionAggregateInput | null | undefined;
  /** Return Tiers where all of the related TierInstancesConnections match this filter */
  all?: TierInstancesConnectionWhere | null | undefined;
  /** Return Tiers where none of the related TierInstancesConnections match this filter */
  none?: TierInstancesConnectionWhere | null | undefined;
  /** Return Tiers where one of the related TierInstancesConnections match this filter */
  single?: TierInstancesConnectionWhere | null | undefined;
  /** Return Tiers where some of the related TierInstancesConnections match this filter */
  some?: TierInstancesConnectionWhere | null | undefined;
};

export type TierInstancesConnectionWhere = {
  AND?: Array<TierInstancesConnectionWhere> | null | undefined;
  NOT?: TierInstancesConnectionWhere | null | undefined;
  OR?: Array<TierInstancesConnectionWhere> | null | undefined;
  node?: InstanceWhere | null | undefined;
};

export type TierInstancesNodeAggregationWhereInput = {
  AND?: Array<TierInstancesNodeAggregationWhereInput> | null | undefined;
  NOT?: TierInstancesNodeAggregationWhereInput | null | undefined;
  OR?: Array<TierInstancesNodeAggregationWhereInput> | null | undefined;
  auraId?: StringScalarAggregationFilters | null | undefined;
  cdcEnrichmentMode?: StringScalarAggregationFilters | null | undefined;
  connectionUrl?: StringScalarAggregationFilters | null | undefined;
  createdAt?: StringScalarAggregationFilters | null | undefined;
  customerManagedKeyId?: StringScalarAggregationFilters | null | undefined;
  deletedInAuraAt?: StringScalarAggregationFilters | null | undefined;
  graphNodes?: StringScalarAggregationFilters | null | undefined;
  graphRelationships?: StringScalarAggregationFilters | null | undefined;
  memory?: StringScalarAggregationFilters | null | undefined;
  metricsIntegrationUrl?: StringScalarAggregationFilters | null | undefined;
  name?: StringScalarAggregationFilters | null | undefined;
  region?: StringScalarAggregationFilters | null | undefined;
  secondariesCount?: IntScalarAggregationFilters | null | undefined;
  status?: StringScalarAggregationFilters | null | undefined;
  storage?: StringScalarAggregationFilters | null | undefined;
  syncedAt?: StringScalarAggregationFilters | null | undefined;
  version?: StringScalarAggregationFilters | null | undefined;
};

export type TierRelationshipFilters = {
  /** Filter type where all of the related Tiers match this filter */
  all?: TierWhere | null | undefined;
  /** Filter type where none of the related Tiers match this filter */
  none?: TierWhere | null | undefined;
  /** Filter type where one of the related Tiers match this filter */
  single?: TierWhere | null | undefined;
  /** Filter type where some of the related Tiers match this filter */
  some?: TierWhere | null | undefined;
};

export type TierWhere = {
  AND?: Array<TierWhere> | null | undefined;
  NOT?: TierWhere | null | undefined;
  OR?: Array<TierWhere> | null | undefined;
  instances?: InstanceRelationshipFilters | null | undefined;
  instancesConnection?: TierInstancesConnectionFilters | null | undefined;
  label?: StringScalarFilters | null | undefined;
  type?: StringScalarFilters | null | undefined;
};

export type SetupQueryVariables = Exact<{ [key: string]: never; }>;


export type SetupQuery = { auraSetup: { required: boolean, connected: boolean, clientIdHint: string | null, lastSyncAt: string | null, syncing: boolean, lastSyncRunId: string | null, lastSyncStatus: string | null, lastSyncError: string | null } };

export type ConnectMutationVariables = Exact<{
  clientId: string;
  clientSecret: string;
}>;


export type ConnectMutation = { connectAura: { connected: boolean, syncRunId: string } };

export type SyncNowMutationVariables = Exact<{ [key: string]: never; }>;


export type SyncNowMutation = { syncNow: { started: boolean, syncRunId: string } };

export type DisconnectMutationVariables = Exact<{ [key: string]: never; }>;


export type DisconnectMutation = { disconnectAura: boolean };

export type InstanceCardFieldsFragment = { auraId: string, name: string, status: string, statusGroup: InstanceStatusGroup, memory: string | null, storage: string | null, region: string | null, createdAt: string | null, deletedInAuraAt: string | null, tenant: Array<{ auraId: string, name: string }>, cloud: Array<{ name: string }>, tier: Array<{ type: string, label: string }> };

export type HomeQueryVariables = Exact<{ [key: string]: never; }>;


export type HomeQuery = { total: { totalCount: number }, tenants: Array<{ auraId: string, name: string, instancesConnection: { totalCount: number } }>, cloudProviders: Array<{ name: string, instancesConnection: { totalCount: number } }>, tiers: Array<{ type: string, label: string, instancesConnection: { totalCount: number } }>, attention: Array<{ auraId: string, name: string, status: string, statusGroup: InstanceStatusGroup, memory: string | null, storage: string | null, region: string | null, createdAt: string | null, deletedInAuraAt: string | null, tenant: Array<{ auraId: string, name: string }>, cloud: Array<{ name: string }>, tier: Array<{ type: string, label: string }> }>, running: Array<{ auraId: string, name: string, status: string, statusGroup: InstanceStatusGroup, memory: string | null, storage: string | null, region: string | null, createdAt: string | null, deletedInAuraAt: string | null, tenant: Array<{ auraId: string, name: string }>, cloud: Array<{ name: string }>, tier: Array<{ type: string, label: string }> }> };

export type ResultsQueryVariables = Exact<{
  where: InstanceWhere;
  base: InstanceWhere;
  noTenant: InstanceWhere;
  noCloud: InstanceWhere;
  noTier: InstanceWhere;
  ready: InstanceWhere;
  stopped: InstanceWhere;
  inProgress: InstanceWhere;
  failed: InstanceWhere;
}>;


export type ResultsQuery = { items: Array<{ auraId: string, name: string, status: string, statusGroup: InstanceStatusGroup, memory: string | null, storage: string | null, region: string | null, createdAt: string | null, deletedInAuraAt: string | null, tenant: Array<{ auraId: string, name: string }>, cloud: Array<{ name: string }>, tier: Array<{ type: string, label: string }> }>, matching: { totalCount: number }, all: { totalCount: number }, tenants: Array<{ auraId: string, name: string, instancesConnection: { totalCount: number } }>, cloudProviders: Array<{ name: string, instancesConnection: { totalCount: number } }>, tiers: Array<{ type: string, label: string, instancesConnection: { totalCount: number } }>, ready: { totalCount: number }, stopped: { totalCount: number }, inProgress: { totalCount: number }, failed: { totalCount: number } };

export type DetailQueryVariables = Exact<{
  id: string;
}>;


export type DetailQuery = { instances: Array<{ connectionUrl: string | null, version: string | null, vectorOptimized: boolean | null, graphAnalyticsPlugin: boolean | null, secondariesCount: number | null, cdcEnrichmentMode: string | null, metricsIntegrationUrl: string | null, graphNodes: string | null, graphRelationships: string | null, customerManagedKeyId: string | null, syncedAt: string | null, hasStoredPassword: boolean, credentialUsername: string | null, passwordRevealCount: number, auraId: string, name: string, status: string, statusGroup: InstanceStatusGroup, memory: string | null, storage: string | null, region: string | null, createdAt: string | null, deletedInAuraAt: string | null, operations: Array<{ id: string, kind: OperationKind, status: OperationStatus, createdAt: string, finishedAt: string | null, error: string | null }>, tenant: Array<{ auraId: string, name: string }>, cloud: Array<{ name: string }>, tier: Array<{ type: string, label: string }> }> };

export type OperationsQueryVariables = Exact<{ [key: string]: never; }>;


export type OperationsQuery = { operations: Array<{ id: string, kind: OperationKind, status: OperationStatus, requestedBy: string | null, createdAt: string, confirmedAt: string | null, finishedAt: string | null, error: string | null, target: Array<{ auraId: string, name: string }>, steps: Array<{ seq: number, status: StepStatus }> }> };

export type AccountQueryVariables = Exact<{ [key: string]: never; }>;


export type AccountQuery = { auraSetup: { required: boolean, connected: boolean, clientIdHint: string | null, lastSyncAt: string | null, syncing: boolean, lastSyncRunId: string | null, lastSyncStatus: string | null, lastSyncError: string | null }, auraAccounts: Array<{ id: string, status: ConnectionStatus, clientIdHint: string | null, connectedAt: string | null, lastSyncAt: string | null }>, instancesConnection: { totalCount: number }, tenants: Array<{ auraId: string, name: string, configsSyncedAt: string | null, configurationsConnection: { totalCount: number }, instancesConnection: { totalCount: number } }>, instanceConfigurationsConnection: { totalCount: number }, syncRuns: Array<{ id: string, status: SyncStatus, startedAt: string, finishedAt: string | null, tenants: number | null, instances: number | null, configurations: number | null, requests: number | null, retries: number | null, error: string | null }> };

export const InstanceCardFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"InstanceCardFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Instance"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"auraId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"statusGroup"}},{"kind":"Field","name":{"kind":"Name","value":"memory"}},{"kind":"Field","name":{"kind":"Name","value":"storage"}},{"kind":"Field","name":{"kind":"Name","value":"region"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedInAuraAt"}},{"kind":"Field","name":{"kind":"Name","value":"tenant"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"auraId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cloud"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"tier"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"label"}}]}}]}}]} as unknown as DocumentNode<InstanceCardFieldsFragment, unknown>;
export const SetupDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Setup"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"auraSetup"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"required"}},{"kind":"Field","name":{"kind":"Name","value":"connected"}},{"kind":"Field","name":{"kind":"Name","value":"clientIdHint"}},{"kind":"Field","name":{"kind":"Name","value":"lastSyncAt"}},{"kind":"Field","name":{"kind":"Name","value":"syncing"}},{"kind":"Field","name":{"kind":"Name","value":"lastSyncRunId"}},{"kind":"Field","name":{"kind":"Name","value":"lastSyncStatus"}},{"kind":"Field","name":{"kind":"Name","value":"lastSyncError"}}]}}]}}]} as unknown as DocumentNode<SetupQuery, SetupQueryVariables>;
export const ConnectDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Connect"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"clientId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"clientSecret"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"connectAura"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"clientId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"clientId"}}},{"kind":"Argument","name":{"kind":"Name","value":"clientSecret"},"value":{"kind":"Variable","name":{"kind":"Name","value":"clientSecret"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"connected"}},{"kind":"Field","name":{"kind":"Name","value":"syncRunId"}}]}}]}}]} as unknown as DocumentNode<ConnectMutation, ConnectMutationVariables>;
export const SyncNowDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SyncNow"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"syncNow"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"started"}},{"kind":"Field","name":{"kind":"Name","value":"syncRunId"}}]}}]}}]} as unknown as DocumentNode<SyncNowMutation, SyncNowMutationVariables>;
export const DisconnectDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Disconnect"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"disconnectAura"}}]}}]} as unknown as DocumentNode<DisconnectMutation, DisconnectMutationVariables>;
export const HomeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Home"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","alias":{"kind":"Name","value":"total"},"name":{"kind":"Name","value":"instancesConnection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"deletedInAuraAt"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"eq"},"value":{"kind":"NullValue"}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"tenants"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sort"},"value":{"kind":"ListValue","values":[{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"EnumValue","value":"ASC"}}]}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"auraId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"instancesConnection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"node"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"deletedInAuraAt"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"eq"},"value":{"kind":"NullValue"}}]}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"cloudProviders"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sort"},"value":{"kind":"ListValue","values":[{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"EnumValue","value":"ASC"}}]}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"instancesConnection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"node"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"deletedInAuraAt"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"eq"},"value":{"kind":"NullValue"}}]}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"tiers"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sort"},"value":{"kind":"ListValue","values":[{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"label"},"value":{"kind":"EnumValue","value":"ASC"}}]}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"label"}},{"kind":"Field","name":{"kind":"Name","value":"instancesConnection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"node"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"deletedInAuraAt"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"eq"},"value":{"kind":"NullValue"}}]}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"Field","alias":{"kind":"Name","value":"attention"},"name":{"kind":"Name","value":"instances"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"AND"},"value":{"kind":"ListValue","values":[{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"deletedInAuraAt"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"eq"},"value":{"kind":"NullValue"}}]}}]},{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"statusGroup"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"in"},"value":{"kind":"ListValue","values":[{"kind":"EnumValue","value":"FAILED"},{"kind":"EnumValue","value":"IN_PROGRESS"},{"kind":"EnumValue","value":"STOPPED"}]}}]}}]}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"sort"},"value":{"kind":"ListValue","values":[{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"EnumValue","value":"ASC"}}]}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"12"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"InstanceCardFields"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"running"},"name":{"kind":"Name","value":"instances"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"AND"},"value":{"kind":"ListValue","values":[{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"deletedInAuraAt"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"eq"},"value":{"kind":"NullValue"}}]}}]},{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"statusGroup"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"eq"},"value":{"kind":"EnumValue","value":"READY"}}]}}]}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"sort"},"value":{"kind":"ListValue","values":[{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"EnumValue","value":"ASC"}}]}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"12"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"InstanceCardFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"InstanceCardFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Instance"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"auraId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"statusGroup"}},{"kind":"Field","name":{"kind":"Name","value":"memory"}},{"kind":"Field","name":{"kind":"Name","value":"storage"}},{"kind":"Field","name":{"kind":"Name","value":"region"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedInAuraAt"}},{"kind":"Field","name":{"kind":"Name","value":"tenant"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"auraId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cloud"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"tier"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"label"}}]}}]}}]} as unknown as DocumentNode<HomeQuery, HomeQueryVariables>;
export const ResultsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Results"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"where"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"InstanceWhere"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"base"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"InstanceWhere"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"noTenant"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"InstanceWhere"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"noCloud"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"InstanceWhere"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"noTier"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"InstanceWhere"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"ready"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"InstanceWhere"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"stopped"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"InstanceWhere"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"inProgress"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"InstanceWhere"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"failed"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"InstanceWhere"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","alias":{"kind":"Name","value":"items"},"name":{"kind":"Name","value":"instances"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"InstanceCardFields"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"matching"},"name":{"kind":"Name","value":"instancesConnection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"all"},"name":{"kind":"Name","value":"instancesConnection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"base"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"tenants"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sort"},"value":{"kind":"ListValue","values":[{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"EnumValue","value":"ASC"}}]}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"auraId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"instancesConnection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"node"},"value":{"kind":"Variable","name":{"kind":"Name","value":"noTenant"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"cloudProviders"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sort"},"value":{"kind":"ListValue","values":[{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"EnumValue","value":"ASC"}}]}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"instancesConnection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"node"},"value":{"kind":"Variable","name":{"kind":"Name","value":"noCloud"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"tiers"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sort"},"value":{"kind":"ListValue","values":[{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"label"},"value":{"kind":"EnumValue","value":"ASC"}}]}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"label"}},{"kind":"Field","name":{"kind":"Name","value":"instancesConnection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"node"},"value":{"kind":"Variable","name":{"kind":"Name","value":"noTier"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"Field","alias":{"kind":"Name","value":"ready"},"name":{"kind":"Name","value":"instancesConnection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"ready"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"stopped"},"name":{"kind":"Name","value":"instancesConnection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"stopped"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"inProgress"},"name":{"kind":"Name","value":"instancesConnection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"inProgress"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"failed"},"name":{"kind":"Name","value":"instancesConnection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"failed"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"InstanceCardFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Instance"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"auraId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"statusGroup"}},{"kind":"Field","name":{"kind":"Name","value":"memory"}},{"kind":"Field","name":{"kind":"Name","value":"storage"}},{"kind":"Field","name":{"kind":"Name","value":"region"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedInAuraAt"}},{"kind":"Field","name":{"kind":"Name","value":"tenant"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"auraId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cloud"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"tier"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"label"}}]}}]}}]} as unknown as DocumentNode<ResultsQuery, ResultsQueryVariables>;
export const DetailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Detail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"instances"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"auraId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"InstanceCardFields"}},{"kind":"Field","name":{"kind":"Name","value":"connectionUrl"}},{"kind":"Field","name":{"kind":"Name","value":"version"}},{"kind":"Field","name":{"kind":"Name","value":"vectorOptimized"}},{"kind":"Field","name":{"kind":"Name","value":"graphAnalyticsPlugin"}},{"kind":"Field","name":{"kind":"Name","value":"secondariesCount"}},{"kind":"Field","name":{"kind":"Name","value":"cdcEnrichmentMode"}},{"kind":"Field","name":{"kind":"Name","value":"metricsIntegrationUrl"}},{"kind":"Field","name":{"kind":"Name","value":"graphNodes"}},{"kind":"Field","name":{"kind":"Name","value":"graphRelationships"}},{"kind":"Field","name":{"kind":"Name","value":"customerManagedKeyId"}},{"kind":"Field","name":{"kind":"Name","value":"syncedAt"}},{"kind":"Field","name":{"kind":"Name","value":"hasStoredPassword"}},{"kind":"Field","name":{"kind":"Name","value":"credentialUsername"}},{"kind":"Field","name":{"kind":"Name","value":"passwordRevealCount"}},{"kind":"Field","name":{"kind":"Name","value":"operations"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sort"},"value":{"kind":"ListValue","values":[{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"createdAt"},"value":{"kind":"EnumValue","value":"DESC"}}]}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"finishedAt"}},{"kind":"Field","name":{"kind":"Name","value":"error"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"InstanceCardFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Instance"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"auraId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"statusGroup"}},{"kind":"Field","name":{"kind":"Name","value":"memory"}},{"kind":"Field","name":{"kind":"Name","value":"storage"}},{"kind":"Field","name":{"kind":"Name","value":"region"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedInAuraAt"}},{"kind":"Field","name":{"kind":"Name","value":"tenant"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"auraId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cloud"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"tier"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"label"}}]}}]}}]} as unknown as DocumentNode<DetailQuery, DetailQueryVariables>;
export const OperationsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Operations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"operations"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sort"},"value":{"kind":"ListValue","values":[{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"createdAt"},"value":{"kind":"EnumValue","value":"DESC"}}]}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"requestedBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedAt"}},{"kind":"Field","name":{"kind":"Name","value":"finishedAt"}},{"kind":"Field","name":{"kind":"Name","value":"error"}},{"kind":"Field","name":{"kind":"Name","value":"target"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"auraId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"steps"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"seq"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]}}]}}]} as unknown as DocumentNode<OperationsQuery, OperationsQueryVariables>;
export const AccountDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Account"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"auraSetup"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"required"}},{"kind":"Field","name":{"kind":"Name","value":"connected"}},{"kind":"Field","name":{"kind":"Name","value":"clientIdHint"}},{"kind":"Field","name":{"kind":"Name","value":"lastSyncAt"}},{"kind":"Field","name":{"kind":"Name","value":"syncing"}},{"kind":"Field","name":{"kind":"Name","value":"lastSyncRunId"}},{"kind":"Field","name":{"kind":"Name","value":"lastSyncStatus"}},{"kind":"Field","name":{"kind":"Name","value":"lastSyncError"}}]}},{"kind":"Field","name":{"kind":"Name","value":"auraAccounts"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"clientIdHint"}},{"kind":"Field","name":{"kind":"Name","value":"connectedAt"}},{"kind":"Field","name":{"kind":"Name","value":"lastSyncAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"instancesConnection"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"tenants"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sort"},"value":{"kind":"ListValue","values":[{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"EnumValue","value":"ASC"}}]}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"auraId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"configsSyncedAt"}},{"kind":"Field","name":{"kind":"Name","value":"configurationsConnection"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"instancesConnection"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"instanceConfigurationsConnection"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"syncRuns"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sort"},"value":{"kind":"ListValue","values":[{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"startedAt"},"value":{"kind":"EnumValue","value":"DESC"}}]}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"5"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"startedAt"}},{"kind":"Field","name":{"kind":"Name","value":"finishedAt"}},{"kind":"Field","name":{"kind":"Name","value":"tenants"}},{"kind":"Field","name":{"kind":"Name","value":"instances"}},{"kind":"Field","name":{"kind":"Name","value":"configurations"}},{"kind":"Field","name":{"kind":"Name","value":"requests"}},{"kind":"Field","name":{"kind":"Name","value":"retries"}},{"kind":"Field","name":{"kind":"Name","value":"error"}}]}}]}}]} as unknown as DocumentNode<AccountQuery, AccountQueryVariables>;