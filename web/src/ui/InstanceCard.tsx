// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { Link } from "react-router";
import type { InstanceCardFieldsFragment } from "../graphql/generated/graphql";
import { cloudLabel, initials, memoryAndStorage } from "../lib/format";
import { posterStyle } from "../lib/poster";
import { StatusChip } from "./index";

/** The generated poster: the cloud's colour, the instance's initials and its cloud and tier. No image files. */
export function Poster({ name, cloud, tier }: { name: string; cloud?: string; tier?: string }) {
  return (
    <div className="poster" style={posterStyle(cloud, name)} aria-hidden="true">
      <span className="cloud">{cloudLabel(cloud)}</span>
      <span className="tier">{tier}</span>
      <span className="letters">{initials(name)}</span>
    </div>
  );
}

/** One instance as a card. "tile" is always poster over text; "adaptive" is a compact row on a phone and a tile on a wide screen. */
export function InstanceCard({ instance, layout = "adaptive" }: { instance: InstanceCardFieldsFragment; layout?: "tile" | "adaptive" }) {
  const cloud = instance.cloud[0]?.name;
  const tier = instance.tier[0];
  const removed = instance.deletedInAuraAt !== null;
  const memory = memoryAndStorage(instance.memory, null);
  return (
    <Link to={`/instances/${encodeURIComponent(instance.auraId)}`} className={`card card-${layout}${removed ? " removed" : ""}`}>
      <Poster name={instance.name} cloud={cloud} tier={tier?.label} />
      <div className="cardbody">
        <span className="name">{instance.name}</span>
        {removed ? <StatusChip label="Removed from Aura" tone="neutral" /> : <StatusChip status={instance.status} />}
        <span className="line">
          {tier && <span className="tiertext"><span className="nb">{tier.label}</span> · </span>}
          {instance.region && <span className="nb">{instance.region}</span>}
          {instance.region && memory && " · "}
          {memory && <span className="nb">{memory}</span>}
        </span>
        {instance.statusGroup === "IN_PROGRESS" && !removed && <div className="progressbar" role="progressbar" aria-label="In progress"><div /></div>}
      </div>
    </Link>
  );
}
