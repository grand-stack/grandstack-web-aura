// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { graphql } from "./generated";

// Every read goes to the gateway, which answers from the store (the cached copy of Aura). Instances Aura no longer lists are kept
// in the store with deletedInAuraAt set; the gallery leaves them out unless asked, so the counts below filter them out too.
export const SetupQuery = graphql(`
  query Setup {
    auraSetup { required connected clientIdHint lastSyncAt syncing lastSyncRunId lastSyncStatus lastSyncError }
  }
`);

export const ConnectMutation = graphql(`
  mutation Connect($clientId: String!, $clientSecret: String!) {
    connectAura(clientId: $clientId, clientSecret: $clientSecret) { connected syncRunId }
  }
`);

export const SyncNowMutation = graphql(`
  mutation SyncNow { syncNow { started syncRunId } }
`);

export const DisconnectMutation = graphql(`
  mutation Disconnect { disconnectAura }
`);

// Removes what came from Aura (tenants, options, instances) and reads it again. Keeps the credentials, past changes and stored passwords.
export const ResetStoreMutation = graphql(`
  mutation ResetStore { resetStore { started syncRunId } }
`);

export const PlanUpdateMutation = graphql(`
  mutation PlanUpdate($instanceId: String!, $changes: InstanceChange!) {
    planUpdate(instanceId: $instanceId, changes: $changes) { operationId }
  }
`);

export const PlanPauseMutation = graphql(`
  mutation PlanPause($instanceId: String!) { planPause(instanceId: $instanceId) { operationId } }
`);

export const PlanResumeMutation = graphql(`
  mutation PlanResume($instanceId: String!) { planResume(instanceId: $instanceId) { operationId } }
`);

export const PlanCreateMutation = graphql(`
  mutation PlanCreate($input: InstanceCreate!) { planCreate(input: $input) { operationId } }
`);

export const PlanDeleteMutation = graphql(`
  mutation PlanDelete($instanceId: String!) { planDelete(instanceId: $instanceId) { operationId } }
`);

// typedName is only for a delete: the instance's name, typed by the person. The server checks it.
export const ConfirmMutation = graphql(`
  mutation Confirm($id: ID!, $typedName: String) { confirmOperation(operationId: $id, typedName: $typedName) { operationId status } }
`);

// The only query or mutation that returns a password. Called when the eye is clicked, never on load.
export const RevealMutation = graphql(`
  mutation Reveal($instanceId: String!) { revealInstancePassword(instanceId: $instanceId) { username password } }
`);

// Aura asked now, stored copy untouched
export const CheckInstanceQuery = graphql(`
  query CheckInstance($instanceId: String!) { checkInstance(instanceId: $instanceId) { checkedAt inAura differences { field label stored live } } }
`);

// The tenants to choose from. Light: a real account's tenants each offer about three thousand combinations.
export const CreateTenantsQuery = graphql(`
  query CreateTenants {
    tenants(sort: [{ name: ASC }]) { auraId name }
  }
`);

// What one tenant can create, read once it is chosen, for the create form's steps
export const CreateOptionsQuery = graphql(`
  query CreateOptions($tenant: String!) {
    tenants(where: { auraId: { eq: $tenant } }) {
      auraId
      configurations { cloudProvider region regionName type memory storage version }
    }
  }
`);

export const CancelMutation = graphql(`
  mutation Cancel($id: ID!) { cancelOperation(operationId: $id) }
`);

export const InstanceCardFields = graphql(`
  fragment InstanceCardFields on Instance {
    auraId name status statusGroup memory storage region createdAt deletedInAuraAt
    tenant { auraId name }
    cloud { name }
    tier { type label }
  }
`);

export const HomeQuery = graphql(`
  query Home {
    total: instancesConnection(where: { deletedInAuraAt: { eq: null } }) { totalCount }
    tenants(sort: [{ name: ASC }]) { auraId name instancesConnection(where: { node: { deletedInAuraAt: { eq: null } } }) { totalCount } }
    cloudProviders(sort: [{ name: ASC }]) { name instancesConnection(where: { node: { deletedInAuraAt: { eq: null } } }) { totalCount } }
    tiers(sort: [{ label: ASC }]) { type label instancesConnection(where: { node: { deletedInAuraAt: { eq: null } } }) { totalCount } }
    attention: instances(
      where: { AND: [{ deletedInAuraAt: { eq: null } }, { statusGroup: { in: [FAILED, IN_PROGRESS, STOPPED] } }] }
      sort: [{ name: ASC }]
      limit: 12
    ) { ...InstanceCardFields }
    running: instances(
      where: { AND: [{ deletedInAuraAt: { eq: null } }, { statusGroup: { eq: READY } }] }
      sort: [{ name: ASC }]
      limit: 12
    ) { ...InstanceCardFields }
  }
`);

// One where per facet, each leaving out that facet's own filter, so a tag's count says what you would get by picking it
export const ResultsQuery = graphql(`
  query Results(
    $where: InstanceWhere!
    $base: InstanceWhere!
    $noTenant: InstanceWhere!
    $noCloud: InstanceWhere!
    $noTier: InstanceWhere!
    $ready: InstanceWhere!
    $stopped: InstanceWhere!
    $inProgress: InstanceWhere!
    $failed: InstanceWhere!
  ) {
    items: instances(where: $where) { ...InstanceCardFields }
    matching: instancesConnection(where: $where) { totalCount }
    all: instancesConnection(where: $base) { totalCount }
    tenants(sort: [{ name: ASC }]) { auraId name instancesConnection(where: { node: $noTenant }) { totalCount } }
    cloudProviders(sort: [{ name: ASC }]) { name instancesConnection(where: { node: $noCloud }) { totalCount } }
    tiers(sort: [{ label: ASC }]) { type label instancesConnection(where: { node: $noTier }) { totalCount } }
    ready: instancesConnection(where: $ready) { totalCount }
    stopped: instancesConnection(where: $stopped) { totalCount }
    inProgress: instancesConnection(where: $inProgress) { totalCount }
    failed: instancesConnection(where: $failed) { totalCount }
  }
`);

export const DetailQuery = graphql(`
  query Detail($id: String!) {
    instances(where: { auraId: { eq: $id } }) {
      ...InstanceCardFields
      connectionUrl version vectorOptimized graphAnalyticsPlugin secondariesCount cdcEnrichmentMode
      metricsIntegrationUrl graphNodes graphRelationships customerManagedKeyId syncedAt
      hasStoredPassword credentialUsername passwordRevealCount
      operations(sort: [{ createdAt: DESC }]) { id kind status createdAt finishedAt error }
    }
  }
`);

// One operation, for the review screen and then the progress screen. desired, before and diff are JSON text written by the aura subgraph.
export const OperationQuery = graphql(`
  query Operation($id: ID!) {
    operations(where: { id: { eq: $id } }) {
      id kind status error diff before requestedBy createdAt confirmedAt finishedAt
      target { auraId name }
      steps(sort: [{ seq: ASC }]) { seq label status detail at }
    }
  }
`);

export const EditQuery = graphql(`
  query Edit($id: String!) {
    instances(where: { auraId: { eq: $id } }) {
      auraId name status statusGroup memory storage region vectorOptimized graphAnalyticsPlugin deletedInAuraAt
      tenant { auraId name }
      cloud { name }
      tier { type label }
    }
  }
`);

// The sizes this instance's tenant can create for its cloud, region and tier: the only ones the edit form offers
export const SizeOptionsQuery = graphql(`
  query SizeOptions($tenant: String!, $cloud: String!, $region: String!, $type: String!) {
    instanceConfigurations(
      where: { AND: [{ tenant: { some: { auraId: { eq: $tenant } } } }, { cloudProvider: { eq: $cloud } }, { region: { eq: $region } }, { type: { eq: $type } }] }
    ) { memory storage }
  }
`);

export const OperationsQuery = graphql(`
  query Operations {
    operations(sort: [{ createdAt: DESC }]) {
      id kind status requestedBy createdAt confirmedAt finishedAt error diff before
      target { auraId name }
      steps { seq status }
    }
  }
`);

export const AccountQuery = graphql(`
  query Account {
    auraSetup { required connected clientIdHint lastSyncAt syncing lastSyncRunId lastSyncStatus lastSyncError }
    auraAccounts { id status clientIdHint connectedAt lastSyncAt }
    instancesConnection { totalCount }
    tenants(sort: [{ name: ASC }]) { auraId name configsSyncedAt configurationsConnection { totalCount } instancesConnection { totalCount } }
    instanceConfigurationsConnection { totalCount }
    syncRuns(sort: [{ startedAt: DESC }], limit: 5) { id status startedAt finishedAt tenants instances configurations requests retries error }
  }
`);
