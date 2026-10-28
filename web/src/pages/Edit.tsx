// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery } from "urql";
import { EditQuery, PlanUpdateMutation, SizeOptionsQuery } from "../graphql/documents";
import { errorMessage, useTitle } from "../hooks";
import { MAX_NAME, buildChange, formFromInstance, nameError, nameLength, sizeKey, sizeOptions, type EditForm } from "../lib/changes";
import { size } from "../lib/format";
import { actionsLocked } from "../lib/status";
import { Banner, Button, EmptyState, Skeleton } from "../ui";

function Switch({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switchrow">
      <span className="main"><span className="title">{label}</span><span className="sub">{hint}</span></span>
      <input type="checkbox" role="switch" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Change an instance. Nothing is sent to Aura from here: this only asks for a plan, which is reviewed and confirmed on the next page. */
export function Edit() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [{ data, fetching }] = useQuery({ query: EditQuery, variables: { id } });
  const instance = data?.instances[0];
  useTitle(instance ? `Edit ${instance.name}` : "Edit instance");
  const [form, setForm] = useState<EditForm>();
  const [{ fetching: planning, error }, plan] = useMutation(PlanUpdateMutation);

  useEffect(() => {
    if (instance && !form) setForm(formFromInstance(instance));
  }, [instance, form]);

  const tenant = instance?.tenant[0]?.auraId;
  const cloud = instance?.cloud[0]?.name;
  const type = instance?.tier[0]?.type;
  const [{ data: sizes }] = useQuery({
    query: SizeOptionsQuery,
    variables: { tenant: tenant ?? "", cloud: cloud ?? "", region: instance?.region ?? "", type: type ?? "" },
    pause: !tenant || !cloud || !instance?.region || !type,
  });
  const options = useMemo(() => sizeOptions(sizes?.instanceConfigurations ?? []), [sizes]);

  if (!data && fetching) return <div className="page narrow"><Skeleton className="skeleton-card" /></div>;
  if (!instance || !form) {
    return (
      <div className="page narrow">
        <EmptyState title="No instance with that id">
          <Link to="/instances" className="btn btn-secondary">See all instances</Link>
        </EmptyState>
      </div>
    );
  }

  const back = `/instances/${encodeURIComponent(instance.auraId)}`;
  if (instance.deletedInAuraAt !== null || actionsLocked(instance.statusGroup)) {
    return (
      <div className="page narrow">
        <Banner tone="warn">{instance.deletedInAuraAt !== null ? "This instance is no longer in Aura, so it cannot be changed." : `Aura is working on this instance (${instance.status}). It cannot be changed until that finishes.`}</Banner>
        <Link to={back} className="btn btn-secondary">Back to the instance</Link>
      </div>
    );
  }

  const { input, changed } = buildChange(instance, form);
  const problem = nameError(form.name);
  const current = instance.memory && instance.storage ? sizeKey({ memory: instance.memory, storage: instance.storage }) : "";
  // The instance's own pair is shown even if the stored list no longer offers it, so the form always starts on something true
  const shownOptions = current && !options.some((o) => sizeKey(o) === current) ? [{ memory: instance.memory!, storage: instance.storage! }, ...options] : options;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed || problem || planning) return;
    const result = await plan({ instanceId: instance.auraId, changes: input });
    const operationId = result.data?.planUpdate.operationId;
    if (operationId) navigate(`/operations/${encodeURIComponent(operationId)}`);
  };

  return (
    <form className="page narrow" onSubmit={submit} noValidate>
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/instances">Instances</Link> / <Link to={back}>{instance.name}</Link> / Edit</nav>
      <div className="hero"><h1>Edit {instance.name}</h1><p className="sub">Choose what to change. You review it before anything is sent to Aura.</p></div>

      {error && <Banner tone="danger">{errorMessage(error)}</Banner>}

      <section className="panel formpanel" aria-labelledby="name-title">
        <h2 id="name-title">Name</h2>
        <div className="field">
          <label htmlFor="name" className="visually-hidden">Name</label>
          <input id="name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!problem} aria-describedby="name-count" autoComplete="off" />
          <div id="name-count" className={`counter${problem ? " bad" : ""}`}>{problem ?? `${nameLength(form.name)} of ${MAX_NAME}`}</div>
        </div>
      </section>

      {shownOptions.length > 0 && (
        <fieldset className="panel formpanel">
          <legend>Memory and storage</legend>
          <p className="note">Aura sets these together. These are the sizes your tenant can use here.</p>
          {shownOptions.map((o) => {
            const key = sizeKey(o);
            return (
              <label className={`choice${form.size === key ? " on" : ""}`} key={key}>
                <input type="radio" name="size" value={key} checked={form.size === key} onChange={() => setForm({ ...form, size: key })} />
                <span className="main"><span className="title">{size(o.memory)} memory</span><span className="sub">{size(o.storage)} storage</span></span>
                {key === current && <span className="tag tag-small">Current</span>}
              </label>
            );
          })}
        </fieldset>
      )}

      {(form.vectorOptimized !== null || form.graphAnalyticsPlugin !== null) && (
        <section className="panel formpanel" aria-labelledby="opts-title">
          <h2 id="opts-title">Options</h2>
          {form.vectorOptimized !== null && <Switch label="Vector optimized" hint="Tunes memory for vector search." value={form.vectorOptimized} onChange={(v) => setForm({ ...form, vectorOptimized: v })} />}
          {form.graphAnalyticsPlugin !== null && <Switch label="Graph analytics plugin" hint="Runs graph algorithms inside the instance." value={form.graphAnalyticsPlugin} onChange={(v) => setForm({ ...form, graphAnalyticsPlugin: v })} />}
        </section>
      )}

      <div className="actionbar">
        <Link to={back} className="btn btn-secondary">Cancel</Link>
        <Button type="submit" variant="primary" disabled={!changed || !!problem || planning}>{planning ? "Preparing…" : "Review changes"}</Button>
      </div>
    </form>
  );
}
