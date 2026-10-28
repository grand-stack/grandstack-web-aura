// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
export type CloudProvider = "gcp" | "aws" | "azure";
export type InstanceType = "free-db" | "professional-db" | "professional-ds" | "business-critical" | "enterprise-db" | "enterprise-ds";

export interface InstanceConfiguration {
  region: string;
  region_name: string;
  type: InstanceType;
  memory: string;
  storage: string;
  version: string;
  cloud_provider: CloudProvider;
}

export interface Tenant {
  id: string;
  name: string;
  instance_configurations: InstanceConfiguration[];
}

export interface Instance {
  id: string;
  name: string;
  status: string;
  tenant_id: string;
  cloud_provider: CloudProvider;
  region: string;
  type: InstanceType;
  memory: string;
  storage: string;
  version: string;
  connection_url: string;
  username: string;
  created_at: string;
  vector_optimized: boolean;
  graph_analytics_plugin: boolean;
}

const REGION_NAMES: Record<string, string> = {
  "europe-west1": "Belgium (europe-west1)",
  "europe-west2": "London (europe-west2)",
  "us-central1": "Iowa (us-central1)",
  "eu-west-1": "Ireland (eu-west-1)",
  westeurope: "Netherlands (westeurope)",
};

const PROFESSIONAL_SIZES: [string, string][] = [["2GB", "4GB"], ["4GB", "8GB"], ["8GB", "16GB"], ["16GB", "32GB"]];
const BUSINESS_CRITICAL_SIZES: [string, string][] = [["8GB", "16GB"], ["16GB", "32GB"], ["32GB", "64GB"], ["64GB", "128GB"]];

function configs(cloud: CloudProvider, region: string, type: InstanceType, sizes: [string, string][]): InstanceConfiguration[] {
  return sizes.map(([memory, storage]) => ({
    region,
    region_name: REGION_NAMES[region] ?? region,
    type,
    memory,
    storage,
    version: "5",
    cloud_provider: cloud,
  }));
}

const PRODUCTION = "a3b1c2d4-0001-4aaa-9bbb-000000000001";
const STAGING = "a3b1c2d4-0002-4aaa-9bbb-000000000002";
const LABS = "a3b1c2d4-0003-4aaa-9bbb-000000000003";

/** Three tenants with 24, 16 and 8 instance configurations. */
export function seedTenants(): Tenant[] {
  return [
    {
      id: PRODUCTION,
      name: "Acme Production",
      instance_configurations: [
        ...configs("gcp", "europe-west1", "professional-db", PROFESSIONAL_SIZES),
        ...configs("gcp", "europe-west2", "professional-db", PROFESSIONAL_SIZES),
        ...configs("gcp", "us-central1", "professional-db", PROFESSIONAL_SIZES),
        ...configs("aws", "eu-west-1", "professional-db", PROFESSIONAL_SIZES),
        ...configs("aws", "eu-west-1", "business-critical", BUSINESS_CRITICAL_SIZES),
        ...configs("azure", "westeurope", "professional-db", PROFESSIONAL_SIZES),
      ],
    },
    {
      id: STAGING,
      name: "Acme Staging",
      instance_configurations: [
        ...configs("gcp", "europe-west1", "professional-db", PROFESSIONAL_SIZES),
        ...configs("gcp", "us-central1", "professional-db", PROFESSIONAL_SIZES),
        ...configs("aws", "eu-west-1", "professional-db", PROFESSIONAL_SIZES),
        ...configs("azure", "westeurope", "professional-db", PROFESSIONAL_SIZES),
      ],
    },
    {
      id: LABS,
      name: "Acme Labs",
      instance_configurations: [
        ...configs("azure", "westeurope", "professional-db", PROFESSIONAL_SIZES),
        ...configs("gcp", "europe-west1", "professional-db", PROFESSIONAL_SIZES),
      ],
    },
  ];
}

function instance(id: string, name: string, tenant: string, cloud: CloudProvider, region: string, type: InstanceType, memory: string, storage: string, status: string, created: string): Instance {
  return {
    id,
    name,
    status,
    tenant_id: tenant,
    cloud_provider: cloud,
    region,
    type,
    memory,
    storage,
    version: "5",
    connection_url: `neo4j+s://${id}.databases.neo4j.io`,
    username: "neo4j",
    created_at: created,
    vector_optimized: false,
    graph_analytics_plugin: false,
  };
}

/** Six instances matching the UI mockups. */
export function seedInstances(): Instance[] {
  return [
    instance("a1b2c3d4", "orders-prod", PRODUCTION, "gcp", "europe-west1", "professional-db", "8GB", "16GB", "running", "2026-03-12T09:03:00Z"),
    instance("b2c3d4e5", "analytics-gds", PRODUCTION, "aws", "eu-west-1", "business-critical", "32GB", "64GB", "running", "2026-02-20T14:20:00Z"),
    instance("c3d4e5f6", "search-prod", PRODUCTION, "gcp", "europe-west2", "professional-db", "16GB", "32GB", "running", "2026-04-02T08:45:00Z"),
    instance("c9d8e7f6", "recs-staging", STAGING, "gcp", "us-central1", "professional-db", "4GB", "8GB", "running", "2026-06-03T11:10:00Z"),
    instance("d4e5f6a7", "billing-staging", STAGING, "aws", "eu-west-1", "professional-db", "4GB", "8GB", "running", "2026-06-18T16:30:00Z"),
    instance("e5f6a7b8", "dev-sandbox", LABS, "azure", "westeurope", "professional-db", "2GB", "4GB", "paused", "2026-07-09T10:00:00Z"),
  ];
}
