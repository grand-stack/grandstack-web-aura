// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery } from "urql";
import { CreateOptionsQuery, PlanCreateMutation } from "../graphql/documents";
import { errorMessage, useTitle } from "../hooks";
import { MAX_NAME, nameError, nameLength, sizeKey } from "../lib/changes";
import { EMPTY_CHOICE, STEPS, STEP_TITLE, choose, cloudsOf, createVariables, regionsOf, sizesOf, stepDone, tiersOf, type Choice, type Offer, type Step } from "../lib/create";
import { cloudLabel, size } from "../lib/format";
import { Banner, Button, EmptyState, Skeleton } from "../ui";

function Option({ name, value, checked, onChange, title, sub }: { name: string; value: string; checked: boolean; onChange: () => void; title: string; sub?: string }) {
  return (
    <label className={`choice${checked ? " on" : ""}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
      <span className="main"><span className="title">{title}</span>{sub && <span className="sub">{sub}</span>}</span>
    </label>
  );
}

/**
 * Create an instance, one decision per screen. Every list is read from what the chosen tenant is offered, so a combination Aura would
 * refuse cannot be picked. Nothing is sent to Aura from here: the last step asks for a plan, which is reviewed and confirmed next.
 */
export function Create() {
  useTitle("New instance");
  const navigate = useNavigate();
  const [{ data, fetching }] = useQuery({ query: CreateOptionsQuery });
  const [{ fetching: planning, error }, plan] = useMutation(PlanCreateMutation);
  const [choice, setChoice] = useState<Choice>(EMPTY_CHOICE);
  const [step, setStep] = useState<Step>("tenant");

  const tenants = data?.tenants ?? [];
  const tenant = tenants.find((t) => t.auraId === choice.tenant);
  const offers: Offer[] = useMemo(() => tenant?.configurations ?? [], [tenant]);
  const tierName = (type: string) => data?.tiers.find((t) => t.type === type)?.label ?? type;

  // With a single tenant there is nothing to choose: start at the cloud
  useEffect(() => {
    if (tenants.length === 1 && choice.tenant === "" && step === "tenant") {
      setChoice((c) => choose(c, { tenant: tenants[0]!.auraId }));
      setStep("cloud");
    }
  }, [tenants, choice.tenant, step]);

  if (!data && fetching) return <div className="page narrow"><Skeleton className="skeleton-card" /></div>;
  if (tenants.length === 0) {
    return (
      <div className="page narrow">
        <EmptyState title="No tenants to create in"><p className="muted">Sync with Aura first, so the tenants and what they can create are known.</p><Link to="/instances" className="btn btn-secondary">Back to instances</Link></EmptyState>
      </div>
    );
  }

  const index = STEPS.indexOf(step);
  const set = (patch: Partial<Choice>) => setChoice((c) => choose(c, patch));
  const done = stepDone(step, choice, offers);
  const isLast = index === STEPS.length - 1;
  const variables = createVariables(choice, offers);
  const first = tenants.length === 1 ? 1 : 0;

  const summary: { step: Step; text: string }[] = [
    ...(stepDone("tenant", choice, offers) && tenants.length > 1 ? [{ step: "tenant" as Step, text: tenant?.name ?? "" }] : []),
    ...(stepDone("cloud", choice, offers) ? [{ step: "cloud" as Step, text: cloudLabel(choice.cloud) }] : []),
    ...(stepDone("where", choice, offers) ? [{ step: "where" as Step, text: `${regionsOf(offers, choice.cloud).find((r) => r.region === choice.region)?.regionName ?? choice.region} · ${tierName(choice.type)}` }] : []),
    ...(stepDone("size", choice, offers) ? [{ step: "size" as Step, text: choice.size.split("|").map((v) => size(v)).join(" · ") }] : []),
  ].filter((s) => STEPS.indexOf(s.step) < index);

  const next = () => setStep(STEPS[Math.min(index + 1, STEPS.length - 1)]!);
  const back = () => (index > first ? setStep(STEPS[index - 1]!) : navigate("/instances"));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLast) return done ? next() : undefined;
    if (!variables || planning) return;
    const result = await plan(variables);
    const operationId = result.data?.planCreate.operationId;
    if (operationId) navigate(`/operations/${encodeURIComponent(operationId)}`);
  };

  return (
    <form className="page narrow" onSubmit={submit} noValidate>
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/instances">Instances</Link> / New instance</nav>
      <div className="hero">
        <div className="eyebrow">Step {index + 1 - first} of {STEPS.length - first}</div>
        <h1>{STEP_TITLE[step]}</h1>
        <p className="sub">You review everything before anything is sent to Aura.</p>
      </div>

      {summary.length > 0 && (
        <div className="tagrow" role="group" aria-label="Your choices so far">
          {summary.map((s) => <button key={s.step} type="button" className="tag" onClick={() => setStep(s.step)} aria-label={`Change: ${s.text}`}>{s.text}</button>)}
        </div>
      )}

      {error && <Banner tone="danger">{errorMessage(error)}</Banner>}

      {step === "tenant" && (
        <fieldset className="panel formpanel">
          <legend>Tenant</legend>
          {tenants.map((t) => <Option key={t.auraId} name="tenant" value={t.auraId} checked={choice.tenant === t.auraId} onChange={() => set({ tenant: t.auraId })} title={t.name} sub={`${new Set(t.configurations.map((c) => c.cloudProvider)).size} clouds offered`} />)}
        </fieldset>
      )}

      {step === "cloud" && (
        <fieldset className="panel formpanel">
          <legend>Cloud</legend>
          {cloudsOf(offers).length === 0 && <p className="note">This tenant is not offered anything to create. Sync to refresh what it can create.</p>}
          {cloudsOf(offers).map((c) => <Option key={c} name="cloud" value={c} checked={choice.cloud === c} onChange={() => set({ cloud: c })} title={cloudLabel(c)} />)}
        </fieldset>
      )}

      {step === "where" && (
        <>
          <fieldset className="panel formpanel">
            <legend>Region</legend>
            {regionsOf(offers, choice.cloud).map((r) => <Option key={r.region} name="region" value={r.region} checked={choice.region === r.region} onChange={() => set({ region: r.region })} title={r.regionName} />)}
          </fieldset>
          {choice.region && (
            <fieldset className="panel formpanel">
              <legend>Tier</legend>
              {tiersOf(offers, choice.cloud, choice.region).map((t) => <Option key={t} name="tier" value={t} checked={choice.type === t} onChange={() => set({ type: t })} title={tierName(t)} />)}
            </fieldset>
          )}
        </>
      )}

      {step === "size" && (
        <fieldset className="panel formpanel">
          <legend>Memory and storage</legend>
          <p className="note">Aura sets these together. These are the sizes this tenant can create here.</p>
          {sizesOf(offers, choice.cloud, choice.region, choice.type).map((s) => (
            <Option key={sizeKey(s)} name="size" value={sizeKey(s)} checked={choice.size === sizeKey(s)} onChange={() => set({ size: sizeKey(s) })} title={`${size(s.memory)} memory`} sub={`${size(s.storage)} storage`} />
          ))}
        </fieldset>
      )}

      {step === "name" && (
        <>
          <section className="panel formpanel" aria-labelledby="name-title">
            <h2 id="name-title">Name</h2>
            <div className="field">
              <label htmlFor="name" className="visually-hidden">Name</label>
              <input id="name" className="input" value={choice.name} onChange={(e) => set({ name: e.target.value })} aria-invalid={choice.name !== "" && !!nameError(choice.name)} aria-describedby="name-count" autoComplete="off" autoFocus />
              <div id="name-count" className={`counter${choice.name !== "" && nameError(choice.name) ? " bad" : ""}`}>{choice.name !== "" && nameError(choice.name) ? nameError(choice.name) : `${nameLength(choice.name)} of ${MAX_NAME}`}</div>
            </div>
          </section>
          <section className="panel formpanel" aria-labelledby="opts-title">
            <h2 id="opts-title">Options</h2>
            <label className="switchrow"><span className="main"><span className="title">Vector optimized</span><span className="sub">Tunes memory for vector search.</span></span><input type="checkbox" role="switch" checked={choice.vectorOptimized} onChange={(e) => set({ vectorOptimized: e.target.checked })} /></label>
            <label className="switchrow"><span className="main"><span className="title">Graph analytics plugin</span><span className="sub">Runs graph algorithms inside the instance.</span></span><input type="checkbox" role="switch" checked={choice.graphAnalyticsPlugin} onChange={(e) => set({ graphAnalyticsPlugin: e.target.checked })} /></label>
          </section>
        </>
      )}

      <div className="actionbar">
        <Button type="button" variant="secondary" onClick={back}>{index > first ? "Back" : "Cancel"}</Button>
        <Button type="submit" variant="primary" disabled={!done || planning}>{isLast ? (planning ? "Preparing…" : "Review") : "Continue"}</Button>
      </div>
    </form>
  );
}
