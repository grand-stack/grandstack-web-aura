/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query Setup {\n    auraSetup { required connected clientIdHint lastSyncAt syncing lastSyncRunId lastSyncStatus lastSyncError }\n  }\n": typeof types.SetupDocument,
    "\n  mutation Connect($clientId: String!, $clientSecret: String!) {\n    connectAura(clientId: $clientId, clientSecret: $clientSecret) { connected syncRunId }\n  }\n": typeof types.ConnectDocument,
    "\n  mutation SyncNow { syncNow { started syncRunId } }\n": typeof types.SyncNowDocument,
    "\n  mutation Disconnect { disconnectAura }\n": typeof types.DisconnectDocument,
    "\n  mutation ResetStore { resetStore { started syncRunId } }\n": typeof types.ResetStoreDocument,
    "\n  mutation PlanUpdate($instanceId: String!, $changes: InstanceChange!) {\n    planUpdate(instanceId: $instanceId, changes: $changes) { operationId }\n  }\n": typeof types.PlanUpdateDocument,
    "\n  mutation PlanPause($instanceId: String!) { planPause(instanceId: $instanceId) { operationId } }\n": typeof types.PlanPauseDocument,
    "\n  mutation PlanResume($instanceId: String!) { planResume(instanceId: $instanceId) { operationId } }\n": typeof types.PlanResumeDocument,
    "\n  mutation PlanCreate($input: InstanceCreate!) { planCreate(input: $input) { operationId } }\n": typeof types.PlanCreateDocument,
    "\n  mutation PlanDelete($instanceId: String!) { planDelete(instanceId: $instanceId) { operationId } }\n": typeof types.PlanDeleteDocument,
    "\n  mutation Confirm($id: ID!, $typedName: String) { confirmOperation(operationId: $id, typedName: $typedName) { operationId status } }\n": typeof types.ConfirmDocument,
    "\n  mutation Reveal($instanceId: String!) { revealInstancePassword(instanceId: $instanceId) { username password } }\n": typeof types.RevealDocument,
    "\n  query CheckInstance($instanceId: String!) { checkInstance(instanceId: $instanceId) { checkedAt inAura differences { field label stored live } } }\n": typeof types.CheckInstanceDocument,
    "\n  query CreateTenants {\n    tenants(sort: [{ name: ASC }]) { auraId name }\n  }\n": typeof types.CreateTenantsDocument,
    "\n  query CreateOptions($tenant: String!) {\n    tenants(where: { auraId: { eq: $tenant } }) {\n      auraId\n      configurations { cloudProvider region regionName type memory storage version }\n    }\n  }\n": typeof types.CreateOptionsDocument,
    "\n  mutation Cancel($id: ID!) { cancelOperation(operationId: $id) }\n": typeof types.CancelDocument,
    "\n  fragment InstanceCardFields on Instance {\n    auraId name status statusGroup memory storage region createdAt deletedInAuraAt\n    tenant { auraId name }\n    cloud { name }\n    tier { type label }\n  }\n": typeof types.InstanceCardFieldsFragmentDoc,
    "\n  query Home {\n    total: instancesConnection(where: { deletedInAuraAt: { eq: null } }) { totalCount }\n    tenants(sort: [{ name: ASC }]) { auraId name instancesConnection(where: { node: { deletedInAuraAt: { eq: null } } }) { totalCount } }\n    cloudProviders(sort: [{ name: ASC }]) { name instancesConnection(where: { node: { deletedInAuraAt: { eq: null } } }) { totalCount } }\n    tiers(sort: [{ label: ASC }]) { type label instancesConnection(where: { node: { deletedInAuraAt: { eq: null } } }) { totalCount } }\n    attention: instances(\n      where: { AND: [{ deletedInAuraAt: { eq: null } }, { statusGroup: { in: [FAILED, IN_PROGRESS, STOPPED] } }] }\n      sort: [{ name: ASC }]\n      limit: 12\n    ) { ...InstanceCardFields }\n    running: instances(\n      where: { AND: [{ deletedInAuraAt: { eq: null } }, { statusGroup: { eq: READY } }] }\n      sort: [{ name: ASC }]\n      limit: 12\n    ) { ...InstanceCardFields }\n  }\n": typeof types.HomeDocument,
    "\n  query Results(\n    $where: InstanceWhere!\n    $base: InstanceWhere!\n    $noTenant: InstanceWhere!\n    $noCloud: InstanceWhere!\n    $noTier: InstanceWhere!\n    $ready: InstanceWhere!\n    $stopped: InstanceWhere!\n    $inProgress: InstanceWhere!\n    $failed: InstanceWhere!\n  ) {\n    items: instances(where: $where) { ...InstanceCardFields }\n    matching: instancesConnection(where: $where) { totalCount }\n    all: instancesConnection(where: $base) { totalCount }\n    tenants(sort: [{ name: ASC }]) { auraId name instancesConnection(where: { node: $noTenant }) { totalCount } }\n    cloudProviders(sort: [{ name: ASC }]) { name instancesConnection(where: { node: $noCloud }) { totalCount } }\n    tiers(sort: [{ label: ASC }]) { type label instancesConnection(where: { node: $noTier }) { totalCount } }\n    ready: instancesConnection(where: $ready) { totalCount }\n    stopped: instancesConnection(where: $stopped) { totalCount }\n    inProgress: instancesConnection(where: $inProgress) { totalCount }\n    failed: instancesConnection(where: $failed) { totalCount }\n  }\n": typeof types.ResultsDocument,
    "\n  query Detail($id: String!) {\n    instances(where: { auraId: { eq: $id } }) {\n      ...InstanceCardFields\n      connectionUrl version vectorOptimized graphAnalyticsPlugin secondariesCount cdcEnrichmentMode\n      metricsIntegrationUrl graphNodes graphRelationships customerManagedKeyId syncedAt\n      hasStoredPassword credentialUsername passwordRevealCount\n      operations(sort: [{ createdAt: DESC }]) { id kind status createdAt finishedAt error }\n    }\n  }\n": typeof types.DetailDocument,
    "\n  query Operation($id: ID!) {\n    operations(where: { id: { eq: $id } }) {\n      id kind status error diff requestedBy createdAt confirmedAt finishedAt\n      target { auraId name }\n      steps(sort: [{ seq: ASC }]) { seq label status detail at }\n    }\n  }\n": typeof types.OperationDocument,
    "\n  query Edit($id: String!) {\n    instances(where: { auraId: { eq: $id } }) {\n      auraId name status statusGroup memory storage region vectorOptimized graphAnalyticsPlugin deletedInAuraAt\n      tenant { auraId name }\n      cloud { name }\n      tier { type label }\n    }\n  }\n": typeof types.EditDocument,
    "\n  query SizeOptions($tenant: String!, $cloud: String!, $region: String!, $type: String!) {\n    instanceConfigurations(\n      where: { AND: [{ tenant: { some: { auraId: { eq: $tenant } } } }, { cloudProvider: { eq: $cloud } }, { region: { eq: $region } }, { type: { eq: $type } }] }\n    ) { memory storage }\n  }\n": typeof types.SizeOptionsDocument,
    "\n  query Operations {\n    operations(sort: [{ createdAt: DESC }]) {\n      id kind status requestedBy createdAt confirmedAt finishedAt error\n      target { auraId name }\n      steps { seq status }\n    }\n  }\n": typeof types.OperationsDocument,
    "\n  query Account {\n    auraSetup { required connected clientIdHint lastSyncAt syncing lastSyncRunId lastSyncStatus lastSyncError }\n    auraAccounts { id status clientIdHint connectedAt lastSyncAt }\n    instancesConnection { totalCount }\n    tenants(sort: [{ name: ASC }]) { auraId name configsSyncedAt configurationsConnection { totalCount } instancesConnection { totalCount } }\n    instanceConfigurationsConnection { totalCount }\n    syncRuns(sort: [{ startedAt: DESC }], limit: 5) { id status startedAt finishedAt tenants instances configurations requests retries error }\n  }\n": typeof types.AccountDocument,
};
const documents: Documents = {
    "\n  query Setup {\n    auraSetup { required connected clientIdHint lastSyncAt syncing lastSyncRunId lastSyncStatus lastSyncError }\n  }\n": types.SetupDocument,
    "\n  mutation Connect($clientId: String!, $clientSecret: String!) {\n    connectAura(clientId: $clientId, clientSecret: $clientSecret) { connected syncRunId }\n  }\n": types.ConnectDocument,
    "\n  mutation SyncNow { syncNow { started syncRunId } }\n": types.SyncNowDocument,
    "\n  mutation Disconnect { disconnectAura }\n": types.DisconnectDocument,
    "\n  mutation ResetStore { resetStore { started syncRunId } }\n": types.ResetStoreDocument,
    "\n  mutation PlanUpdate($instanceId: String!, $changes: InstanceChange!) {\n    planUpdate(instanceId: $instanceId, changes: $changes) { operationId }\n  }\n": types.PlanUpdateDocument,
    "\n  mutation PlanPause($instanceId: String!) { planPause(instanceId: $instanceId) { operationId } }\n": types.PlanPauseDocument,
    "\n  mutation PlanResume($instanceId: String!) { planResume(instanceId: $instanceId) { operationId } }\n": types.PlanResumeDocument,
    "\n  mutation PlanCreate($input: InstanceCreate!) { planCreate(input: $input) { operationId } }\n": types.PlanCreateDocument,
    "\n  mutation PlanDelete($instanceId: String!) { planDelete(instanceId: $instanceId) { operationId } }\n": types.PlanDeleteDocument,
    "\n  mutation Confirm($id: ID!, $typedName: String) { confirmOperation(operationId: $id, typedName: $typedName) { operationId status } }\n": types.ConfirmDocument,
    "\n  mutation Reveal($instanceId: String!) { revealInstancePassword(instanceId: $instanceId) { username password } }\n": types.RevealDocument,
    "\n  query CheckInstance($instanceId: String!) { checkInstance(instanceId: $instanceId) { checkedAt inAura differences { field label stored live } } }\n": types.CheckInstanceDocument,
    "\n  query CreateTenants {\n    tenants(sort: [{ name: ASC }]) { auraId name }\n  }\n": types.CreateTenantsDocument,
    "\n  query CreateOptions($tenant: String!) {\n    tenants(where: { auraId: { eq: $tenant } }) {\n      auraId\n      configurations { cloudProvider region regionName type memory storage version }\n    }\n  }\n": types.CreateOptionsDocument,
    "\n  mutation Cancel($id: ID!) { cancelOperation(operationId: $id) }\n": types.CancelDocument,
    "\n  fragment InstanceCardFields on Instance {\n    auraId name status statusGroup memory storage region createdAt deletedInAuraAt\n    tenant { auraId name }\n    cloud { name }\n    tier { type label }\n  }\n": types.InstanceCardFieldsFragmentDoc,
    "\n  query Home {\n    total: instancesConnection(where: { deletedInAuraAt: { eq: null } }) { totalCount }\n    tenants(sort: [{ name: ASC }]) { auraId name instancesConnection(where: { node: { deletedInAuraAt: { eq: null } } }) { totalCount } }\n    cloudProviders(sort: [{ name: ASC }]) { name instancesConnection(where: { node: { deletedInAuraAt: { eq: null } } }) { totalCount } }\n    tiers(sort: [{ label: ASC }]) { type label instancesConnection(where: { node: { deletedInAuraAt: { eq: null } } }) { totalCount } }\n    attention: instances(\n      where: { AND: [{ deletedInAuraAt: { eq: null } }, { statusGroup: { in: [FAILED, IN_PROGRESS, STOPPED] } }] }\n      sort: [{ name: ASC }]\n      limit: 12\n    ) { ...InstanceCardFields }\n    running: instances(\n      where: { AND: [{ deletedInAuraAt: { eq: null } }, { statusGroup: { eq: READY } }] }\n      sort: [{ name: ASC }]\n      limit: 12\n    ) { ...InstanceCardFields }\n  }\n": types.HomeDocument,
    "\n  query Results(\n    $where: InstanceWhere!\n    $base: InstanceWhere!\n    $noTenant: InstanceWhere!\n    $noCloud: InstanceWhere!\n    $noTier: InstanceWhere!\n    $ready: InstanceWhere!\n    $stopped: InstanceWhere!\n    $inProgress: InstanceWhere!\n    $failed: InstanceWhere!\n  ) {\n    items: instances(where: $where) { ...InstanceCardFields }\n    matching: instancesConnection(where: $where) { totalCount }\n    all: instancesConnection(where: $base) { totalCount }\n    tenants(sort: [{ name: ASC }]) { auraId name instancesConnection(where: { node: $noTenant }) { totalCount } }\n    cloudProviders(sort: [{ name: ASC }]) { name instancesConnection(where: { node: $noCloud }) { totalCount } }\n    tiers(sort: [{ label: ASC }]) { type label instancesConnection(where: { node: $noTier }) { totalCount } }\n    ready: instancesConnection(where: $ready) { totalCount }\n    stopped: instancesConnection(where: $stopped) { totalCount }\n    inProgress: instancesConnection(where: $inProgress) { totalCount }\n    failed: instancesConnection(where: $failed) { totalCount }\n  }\n": types.ResultsDocument,
    "\n  query Detail($id: String!) {\n    instances(where: { auraId: { eq: $id } }) {\n      ...InstanceCardFields\n      connectionUrl version vectorOptimized graphAnalyticsPlugin secondariesCount cdcEnrichmentMode\n      metricsIntegrationUrl graphNodes graphRelationships customerManagedKeyId syncedAt\n      hasStoredPassword credentialUsername passwordRevealCount\n      operations(sort: [{ createdAt: DESC }]) { id kind status createdAt finishedAt error }\n    }\n  }\n": types.DetailDocument,
    "\n  query Operation($id: ID!) {\n    operations(where: { id: { eq: $id } }) {\n      id kind status error diff requestedBy createdAt confirmedAt finishedAt\n      target { auraId name }\n      steps(sort: [{ seq: ASC }]) { seq label status detail at }\n    }\n  }\n": types.OperationDocument,
    "\n  query Edit($id: String!) {\n    instances(where: { auraId: { eq: $id } }) {\n      auraId name status statusGroup memory storage region vectorOptimized graphAnalyticsPlugin deletedInAuraAt\n      tenant { auraId name }\n      cloud { name }\n      tier { type label }\n    }\n  }\n": types.EditDocument,
    "\n  query SizeOptions($tenant: String!, $cloud: String!, $region: String!, $type: String!) {\n    instanceConfigurations(\n      where: { AND: [{ tenant: { some: { auraId: { eq: $tenant } } } }, { cloudProvider: { eq: $cloud } }, { region: { eq: $region } }, { type: { eq: $type } }] }\n    ) { memory storage }\n  }\n": types.SizeOptionsDocument,
    "\n  query Operations {\n    operations(sort: [{ createdAt: DESC }]) {\n      id kind status requestedBy createdAt confirmedAt finishedAt error\n      target { auraId name }\n      steps { seq status }\n    }\n  }\n": types.OperationsDocument,
    "\n  query Account {\n    auraSetup { required connected clientIdHint lastSyncAt syncing lastSyncRunId lastSyncStatus lastSyncError }\n    auraAccounts { id status clientIdHint connectedAt lastSyncAt }\n    instancesConnection { totalCount }\n    tenants(sort: [{ name: ASC }]) { auraId name configsSyncedAt configurationsConnection { totalCount } instancesConnection { totalCount } }\n    instanceConfigurationsConnection { totalCount }\n    syncRuns(sort: [{ startedAt: DESC }], limit: 5) { id status startedAt finishedAt tenants instances configurations requests retries error }\n  }\n": types.AccountDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Setup {\n    auraSetup { required connected clientIdHint lastSyncAt syncing lastSyncRunId lastSyncStatus lastSyncError }\n  }\n"): (typeof documents)["\n  query Setup {\n    auraSetup { required connected clientIdHint lastSyncAt syncing lastSyncRunId lastSyncStatus lastSyncError }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation Connect($clientId: String!, $clientSecret: String!) {\n    connectAura(clientId: $clientId, clientSecret: $clientSecret) { connected syncRunId }\n  }\n"): (typeof documents)["\n  mutation Connect($clientId: String!, $clientSecret: String!) {\n    connectAura(clientId: $clientId, clientSecret: $clientSecret) { connected syncRunId }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SyncNow { syncNow { started syncRunId } }\n"): (typeof documents)["\n  mutation SyncNow { syncNow { started syncRunId } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation Disconnect { disconnectAura }\n"): (typeof documents)["\n  mutation Disconnect { disconnectAura }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ResetStore { resetStore { started syncRunId } }\n"): (typeof documents)["\n  mutation ResetStore { resetStore { started syncRunId } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation PlanUpdate($instanceId: String!, $changes: InstanceChange!) {\n    planUpdate(instanceId: $instanceId, changes: $changes) { operationId }\n  }\n"): (typeof documents)["\n  mutation PlanUpdate($instanceId: String!, $changes: InstanceChange!) {\n    planUpdate(instanceId: $instanceId, changes: $changes) { operationId }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation PlanPause($instanceId: String!) { planPause(instanceId: $instanceId) { operationId } }\n"): (typeof documents)["\n  mutation PlanPause($instanceId: String!) { planPause(instanceId: $instanceId) { operationId } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation PlanResume($instanceId: String!) { planResume(instanceId: $instanceId) { operationId } }\n"): (typeof documents)["\n  mutation PlanResume($instanceId: String!) { planResume(instanceId: $instanceId) { operationId } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation PlanCreate($input: InstanceCreate!) { planCreate(input: $input) { operationId } }\n"): (typeof documents)["\n  mutation PlanCreate($input: InstanceCreate!) { planCreate(input: $input) { operationId } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation PlanDelete($instanceId: String!) { planDelete(instanceId: $instanceId) { operationId } }\n"): (typeof documents)["\n  mutation PlanDelete($instanceId: String!) { planDelete(instanceId: $instanceId) { operationId } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation Confirm($id: ID!, $typedName: String) { confirmOperation(operationId: $id, typedName: $typedName) { operationId status } }\n"): (typeof documents)["\n  mutation Confirm($id: ID!, $typedName: String) { confirmOperation(operationId: $id, typedName: $typedName) { operationId status } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation Reveal($instanceId: String!) { revealInstancePassword(instanceId: $instanceId) { username password } }\n"): (typeof documents)["\n  mutation Reveal($instanceId: String!) { revealInstancePassword(instanceId: $instanceId) { username password } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CheckInstance($instanceId: String!) { checkInstance(instanceId: $instanceId) { checkedAt inAura differences { field label stored live } } }\n"): (typeof documents)["\n  query CheckInstance($instanceId: String!) { checkInstance(instanceId: $instanceId) { checkedAt inAura differences { field label stored live } } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CreateTenants {\n    tenants(sort: [{ name: ASC }]) { auraId name }\n  }\n"): (typeof documents)["\n  query CreateTenants {\n    tenants(sort: [{ name: ASC }]) { auraId name }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CreateOptions($tenant: String!) {\n    tenants(where: { auraId: { eq: $tenant } }) {\n      auraId\n      configurations { cloudProvider region regionName type memory storage version }\n    }\n  }\n"): (typeof documents)["\n  query CreateOptions($tenant: String!) {\n    tenants(where: { auraId: { eq: $tenant } }) {\n      auraId\n      configurations { cloudProvider region regionName type memory storage version }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation Cancel($id: ID!) { cancelOperation(operationId: $id) }\n"): (typeof documents)["\n  mutation Cancel($id: ID!) { cancelOperation(operationId: $id) }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment InstanceCardFields on Instance {\n    auraId name status statusGroup memory storage region createdAt deletedInAuraAt\n    tenant { auraId name }\n    cloud { name }\n    tier { type label }\n  }\n"): (typeof documents)["\n  fragment InstanceCardFields on Instance {\n    auraId name status statusGroup memory storage region createdAt deletedInAuraAt\n    tenant { auraId name }\n    cloud { name }\n    tier { type label }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Home {\n    total: instancesConnection(where: { deletedInAuraAt: { eq: null } }) { totalCount }\n    tenants(sort: [{ name: ASC }]) { auraId name instancesConnection(where: { node: { deletedInAuraAt: { eq: null } } }) { totalCount } }\n    cloudProviders(sort: [{ name: ASC }]) { name instancesConnection(where: { node: { deletedInAuraAt: { eq: null } } }) { totalCount } }\n    tiers(sort: [{ label: ASC }]) { type label instancesConnection(where: { node: { deletedInAuraAt: { eq: null } } }) { totalCount } }\n    attention: instances(\n      where: { AND: [{ deletedInAuraAt: { eq: null } }, { statusGroup: { in: [FAILED, IN_PROGRESS, STOPPED] } }] }\n      sort: [{ name: ASC }]\n      limit: 12\n    ) { ...InstanceCardFields }\n    running: instances(\n      where: { AND: [{ deletedInAuraAt: { eq: null } }, { statusGroup: { eq: READY } }] }\n      sort: [{ name: ASC }]\n      limit: 12\n    ) { ...InstanceCardFields }\n  }\n"): (typeof documents)["\n  query Home {\n    total: instancesConnection(where: { deletedInAuraAt: { eq: null } }) { totalCount }\n    tenants(sort: [{ name: ASC }]) { auraId name instancesConnection(where: { node: { deletedInAuraAt: { eq: null } } }) { totalCount } }\n    cloudProviders(sort: [{ name: ASC }]) { name instancesConnection(where: { node: { deletedInAuraAt: { eq: null } } }) { totalCount } }\n    tiers(sort: [{ label: ASC }]) { type label instancesConnection(where: { node: { deletedInAuraAt: { eq: null } } }) { totalCount } }\n    attention: instances(\n      where: { AND: [{ deletedInAuraAt: { eq: null } }, { statusGroup: { in: [FAILED, IN_PROGRESS, STOPPED] } }] }\n      sort: [{ name: ASC }]\n      limit: 12\n    ) { ...InstanceCardFields }\n    running: instances(\n      where: { AND: [{ deletedInAuraAt: { eq: null } }, { statusGroup: { eq: READY } }] }\n      sort: [{ name: ASC }]\n      limit: 12\n    ) { ...InstanceCardFields }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Results(\n    $where: InstanceWhere!\n    $base: InstanceWhere!\n    $noTenant: InstanceWhere!\n    $noCloud: InstanceWhere!\n    $noTier: InstanceWhere!\n    $ready: InstanceWhere!\n    $stopped: InstanceWhere!\n    $inProgress: InstanceWhere!\n    $failed: InstanceWhere!\n  ) {\n    items: instances(where: $where) { ...InstanceCardFields }\n    matching: instancesConnection(where: $where) { totalCount }\n    all: instancesConnection(where: $base) { totalCount }\n    tenants(sort: [{ name: ASC }]) { auraId name instancesConnection(where: { node: $noTenant }) { totalCount } }\n    cloudProviders(sort: [{ name: ASC }]) { name instancesConnection(where: { node: $noCloud }) { totalCount } }\n    tiers(sort: [{ label: ASC }]) { type label instancesConnection(where: { node: $noTier }) { totalCount } }\n    ready: instancesConnection(where: $ready) { totalCount }\n    stopped: instancesConnection(where: $stopped) { totalCount }\n    inProgress: instancesConnection(where: $inProgress) { totalCount }\n    failed: instancesConnection(where: $failed) { totalCount }\n  }\n"): (typeof documents)["\n  query Results(\n    $where: InstanceWhere!\n    $base: InstanceWhere!\n    $noTenant: InstanceWhere!\n    $noCloud: InstanceWhere!\n    $noTier: InstanceWhere!\n    $ready: InstanceWhere!\n    $stopped: InstanceWhere!\n    $inProgress: InstanceWhere!\n    $failed: InstanceWhere!\n  ) {\n    items: instances(where: $where) { ...InstanceCardFields }\n    matching: instancesConnection(where: $where) { totalCount }\n    all: instancesConnection(where: $base) { totalCount }\n    tenants(sort: [{ name: ASC }]) { auraId name instancesConnection(where: { node: $noTenant }) { totalCount } }\n    cloudProviders(sort: [{ name: ASC }]) { name instancesConnection(where: { node: $noCloud }) { totalCount } }\n    tiers(sort: [{ label: ASC }]) { type label instancesConnection(where: { node: $noTier }) { totalCount } }\n    ready: instancesConnection(where: $ready) { totalCount }\n    stopped: instancesConnection(where: $stopped) { totalCount }\n    inProgress: instancesConnection(where: $inProgress) { totalCount }\n    failed: instancesConnection(where: $failed) { totalCount }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Detail($id: String!) {\n    instances(where: { auraId: { eq: $id } }) {\n      ...InstanceCardFields\n      connectionUrl version vectorOptimized graphAnalyticsPlugin secondariesCount cdcEnrichmentMode\n      metricsIntegrationUrl graphNodes graphRelationships customerManagedKeyId syncedAt\n      hasStoredPassword credentialUsername passwordRevealCount\n      operations(sort: [{ createdAt: DESC }]) { id kind status createdAt finishedAt error }\n    }\n  }\n"): (typeof documents)["\n  query Detail($id: String!) {\n    instances(where: { auraId: { eq: $id } }) {\n      ...InstanceCardFields\n      connectionUrl version vectorOptimized graphAnalyticsPlugin secondariesCount cdcEnrichmentMode\n      metricsIntegrationUrl graphNodes graphRelationships customerManagedKeyId syncedAt\n      hasStoredPassword credentialUsername passwordRevealCount\n      operations(sort: [{ createdAt: DESC }]) { id kind status createdAt finishedAt error }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Operation($id: ID!) {\n    operations(where: { id: { eq: $id } }) {\n      id kind status error diff requestedBy createdAt confirmedAt finishedAt\n      target { auraId name }\n      steps(sort: [{ seq: ASC }]) { seq label status detail at }\n    }\n  }\n"): (typeof documents)["\n  query Operation($id: ID!) {\n    operations(where: { id: { eq: $id } }) {\n      id kind status error diff requestedBy createdAt confirmedAt finishedAt\n      target { auraId name }\n      steps(sort: [{ seq: ASC }]) { seq label status detail at }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Edit($id: String!) {\n    instances(where: { auraId: { eq: $id } }) {\n      auraId name status statusGroup memory storage region vectorOptimized graphAnalyticsPlugin deletedInAuraAt\n      tenant { auraId name }\n      cloud { name }\n      tier { type label }\n    }\n  }\n"): (typeof documents)["\n  query Edit($id: String!) {\n    instances(where: { auraId: { eq: $id } }) {\n      auraId name status statusGroup memory storage region vectorOptimized graphAnalyticsPlugin deletedInAuraAt\n      tenant { auraId name }\n      cloud { name }\n      tier { type label }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SizeOptions($tenant: String!, $cloud: String!, $region: String!, $type: String!) {\n    instanceConfigurations(\n      where: { AND: [{ tenant: { some: { auraId: { eq: $tenant } } } }, { cloudProvider: { eq: $cloud } }, { region: { eq: $region } }, { type: { eq: $type } }] }\n    ) { memory storage }\n  }\n"): (typeof documents)["\n  query SizeOptions($tenant: String!, $cloud: String!, $region: String!, $type: String!) {\n    instanceConfigurations(\n      where: { AND: [{ tenant: { some: { auraId: { eq: $tenant } } } }, { cloudProvider: { eq: $cloud } }, { region: { eq: $region } }, { type: { eq: $type } }] }\n    ) { memory storage }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Operations {\n    operations(sort: [{ createdAt: DESC }]) {\n      id kind status requestedBy createdAt confirmedAt finishedAt error\n      target { auraId name }\n      steps { seq status }\n    }\n  }\n"): (typeof documents)["\n  query Operations {\n    operations(sort: [{ createdAt: DESC }]) {\n      id kind status requestedBy createdAt confirmedAt finishedAt error\n      target { auraId name }\n      steps { seq status }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Account {\n    auraSetup { required connected clientIdHint lastSyncAt syncing lastSyncRunId lastSyncStatus lastSyncError }\n    auraAccounts { id status clientIdHint connectedAt lastSyncAt }\n    instancesConnection { totalCount }\n    tenants(sort: [{ name: ASC }]) { auraId name configsSyncedAt configurationsConnection { totalCount } instancesConnection { totalCount } }\n    instanceConfigurationsConnection { totalCount }\n    syncRuns(sort: [{ startedAt: DESC }], limit: 5) { id status startedAt finishedAt tenants instances configurations requests retries error }\n  }\n"): (typeof documents)["\n  query Account {\n    auraSetup { required connected clientIdHint lastSyncAt syncing lastSyncRunId lastSyncStatus lastSyncError }\n    auraAccounts { id status clientIdHint connectedAt lastSyncAt }\n    instancesConnection { totalCount }\n    tenants(sort: [{ name: ASC }]) { auraId name configsSyncedAt configurationsConnection { totalCount } instancesConnection { totalCount } }\n    instanceConfigurationsConnection { totalCount }\n    syncRuns(sort: [{ startedAt: DESC }], limit: 5) { id status startedAt finishedAt tenants instances configurations requests retries error }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;