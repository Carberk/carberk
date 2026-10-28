import { useEffect, useState } from "react";
import type { ServiceMessagingSchemas as S } from "@auto-tm/contracts";

import { uploadRightsCopy } from "./uploadRightsCopy";

type Props = { purpose: S.ServicePurpose; locale: string; locked: boolean; onChange: (rights: S.ServiceRights | null) => void };

/** Record the operator's evidence before accepting bytes; never infer rights from a file or staff role. */
export function UploadRightsForm({ purpose, locale, locked, onChange }: Props) {
 const c = uploadRightsCopy(locale);
 const [source, setSource] = useState(""), [basis, setBasis] = useState(""), [provenance, setProvenance] = useState(""), [until, setUntil] = useState(""), [reason, setReason] = useState(""), [restrictions, setRestrictions] = useState("");
 useEffect(() => {
  const expiry = new Date(until);
  if (!source || !basis.trim() || !provenance.trim() || (purpose === "history" && (!reason.trim() || !Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()))) { onChange(null); return; }
  const category = purpose === "support" ? "support_communication" : "history_communication";
  onChange({ category, purpose: purpose === "support" ? "Support communication" : "Vehicle History communication", basis: basis.trim(), provenance: `${source}: ${provenance.trim()}`, identifiability: "personal", use: ["service"], schedule: purpose === "support" ? { kind: "support_case", closedDays: 90, eraseOnAccountDeletion: true } : { kind: "until", until: expiry.toISOString(), reason: reason.trim() }, supplierRestrictions: restrictions.trim(), hold: null });
 }, [purpose, source, basis, provenance, until, reason, restrictions, onChange]);
 const field = (label: string, value: string, change: (value: string) => void, maxLength: number) => <label className="block">{label}<input aria-label={label} value={value} onChange={event => change(event.target.value)} maxLength={maxLength} className="mt-2 min-h-11 w-full rounded-lg border p-2"/></label>;
 return <fieldset disabled={locked} className="space-y-3 rounded-lg border p-3"><legend>{c.title}</legend>
  <label className="block">{c.source}<select aria-label={c.source} value={source} onChange={event => setSource(event.target.value)} className="ml-3 min-h-11 rounded-lg border p-2"><option value="">{c.choose}</option><option value="real">{c.real}</option><option value="synthetic">{c.synthetic}</option></select></label>
  {field(c.basis, basis, setBasis, 500)}{field(c.provenance, provenance, setProvenance, 980)}
  <p>{c.serviceOnly}</p>
  {purpose === "support" ? <p>{c.supportSchedule}</p> : <>{field(c.until, until, setUntil, 40)}{field(c.reason, reason, setReason, 500)}</>}
  {field(c.restrictions, restrictions, setRestrictions, 1000)}
 </fieldset>;
}
