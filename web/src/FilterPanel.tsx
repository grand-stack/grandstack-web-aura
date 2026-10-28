// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import type { InstanceStatusGroup } from "./graphql/generated/graphql";
import type { Filters } from "./lib/filters";
import { Checkbox } from "./ui";

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export interface Facets {
  tenants: FacetOption[];
  clouds: FacetOption[];
  tiers: FacetOption[];
  statuses: FacetOption[];
}

const toggle = <T,>(list: T[], value: T): T[] => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

function Group({ title, options, selected, onToggle }: { title: string; options: FacetOption[]; selected: string[]; onToggle: (value: string) => void }) {
  if (options.length === 0) return null;
  return (
    <fieldset>
      <legend>{title}</legend>
      {options.map((o) => (
        <Checkbox
          key={o.value}
          label={o.label}
          count={o.count}
          checked={selected.includes(o.value)}
          // An option with nothing behind it is disabled, unless it is ticked (then it can still be unticked)
          disabled={o.count === 0 && !selected.includes(o.value)}
          onChange={() => onToggle(o.value)}
        />
      ))}
    </fieldset>
  );
}

/** The filters, used in the sidebar on a wide screen and in the sheet on a phone. Each count is what picking that option would give. */
export function FilterPanel({ filters, facets, onChange }: { filters: Filters; facets: Facets; onChange: (next: Partial<Filters>) => void }) {
  return (
    <div className="facets">
      <Group title="Tenant" options={facets.tenants} selected={filters.tenants} onToggle={(v) => onChange({ tenants: toggle(filters.tenants, v) })} />
      <Group title="Cloud" options={facets.clouds} selected={filters.clouds} onToggle={(v) => onChange({ clouds: toggle(filters.clouds, v) })} />
      <Group title="Tier" options={facets.tiers} selected={filters.tiers} onToggle={(v) => onChange({ tiers: toggle(filters.tiers, v) })} />
      <Group
        title="Status"
        options={facets.statuses}
        selected={filters.statuses}
        onToggle={(v) => onChange({ statuses: toggle(filters.statuses, v as InstanceStatusGroup) })}
      />
      <fieldset>
        <legend>Removed</legend>
        <Checkbox label="Show instances removed from Aura" checked={filters.showRemoved} onChange={() => onChange({ showRemoved: !filters.showRemoved })} />
      </fieldset>
      <p className="note">Each count is how many instances you would get if you picked that option, keeping your other filters.</p>
    </div>
  );
}
