import type { DiagnosticSchemas as D } from "@auto-tm/contracts";

import type { DiagnosticCopy } from "./copy";

// Original geometric outlines shared with the issued PDF. No external artwork.
const outlines = {
 front:"M25 72L22 42L45 12H175L198 42L195 72Z M45 36L55 19H165L175 36Z M35 47H70V57H35Z M150 47H185V57H150Z",
 rear:"M25 72L22 42L45 12H175L198 42L195 72Z M45 36L55 19H165L175 36Z M35 47H58V60H35Z M162 47H185V60H162Z",
 left:"M8 63L17 43L59 35L80 12H145L171 35L207 42L215 63L211 73H8Z M67 35L85 18H140L160 35Z",
 right:"M212 63L203 43L161 35L140 12H75L49 35L13 42L5 63L9 73H212Z M153 35L135 18H80L60 35Z",
 top:"M25 24C25 4 195 4 195 24V59C195 80 25 80 25 59Z M68 18H150L160 62H58Z",
};
export function DiagnosticBodyMap({ report, c }: {report:D.DiagnosticReportRecord;c:DiagnosticCopy}) {
 return <section aria-label={c.map} className="space-y-3"><h3 className="font-medium">{c.map}</h3><p className="max-w-prose text-sm text-text-secondary">{c.alternate}</p><div className="grid gap-4 sm:grid-cols-3">{(Object.keys(outlines) as (keyof typeof outlines)[]).map(view=><figure key={view}><svg role="img" aria-label={c[view]} viewBox="0 0 220 80" className="h-28 w-full"><path d={outlines[view]} fill="none" stroke="currentColor" strokeWidth="1.5"/>{report.findings.map((finding,index)=>finding.location?.view===view?<g key={finding.id}><circle cx={finding.location.x*220} cy={finding.location.y*80} r="9" fill="white" stroke="currentColor"/><text x={finding.location.x*220} y={finding.location.y*80+3} textAnchor="middle" fontSize="9">{index+1}</text></g>:null)}</svg><figcaption className="text-center text-sm">{c[view]}</figcaption></figure>)}</div></section>;
}
