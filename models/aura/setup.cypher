// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
// Run at every start. Every statement is idempotent. One statement per line, ending in a semicolon.
CREATE CONSTRAINT aura_account_id IF NOT EXISTS FOR (n:AuraAccount) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT tenant_aura_id IF NOT EXISTS FOR (n:Tenant) REQUIRE n.auraId IS UNIQUE;
CREATE CONSTRAINT instance_aura_id IF NOT EXISTS FOR (n:Instance) REQUIRE n.auraId IS UNIQUE;
CREATE CONSTRAINT instance_configuration_key IF NOT EXISTS FOR (n:InstanceConfiguration) REQUIRE n.key IS UNIQUE;
CREATE CONSTRAINT cloud_provider_name IF NOT EXISTS FOR (n:CloudProvider) REQUIRE n.name IS UNIQUE;
CREATE CONSTRAINT tier_type IF NOT EXISTS FOR (n:Tier) REQUIRE n.type IS UNIQUE;
CREATE CONSTRAINT operation_id IF NOT EXISTS FOR (n:Operation) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT sync_run_id IF NOT EXISTS FOR (n:SyncRun) REQUIRE n.id IS UNIQUE;
// Credentials are not in the GraphQL schema. Only the aura subgraph reads and writes these nodes, over Bolt.
CREATE CONSTRAINT instance_credential_instance IF NOT EXISTS FOR (n:InstanceCredential) REQUIRE n.instanceAuraId IS UNIQUE;
CREATE CONSTRAINT aura_secret_account IF NOT EXISTS FOR (n:AuraSecret) REQUIRE n.accountId IS UNIQUE;
CREATE INDEX instance_name IF NOT EXISTS FOR (n:Instance) ON (n.name);
CREATE INDEX instance_status_group IF NOT EXISTS FOR (n:Instance) ON (n.statusGroup);
CREATE INDEX operation_status IF NOT EXISTS FOR (n:Operation) ON (n.status);
