import { improvementCopy } from "./copy";

const copy={
 en:{snapshot:"Reviewed tracker snapshot, 18 October 2026, 04:49 UTC. Open GitHub for current ownership and status.",owner:"Owner",unassigned:"Unassigned",status:"Status",open:"Open at review",evidence:"Source evidence",verification:"Human acceptance pending",scorecard:"Weekly disclosure and canonical source outcomes",ingress:"First-party source admission and deletion fences"},
 ru:{snapshot:"Снимок задач проверен 18 октября 2026, 04:49 UTC. Текущие ответственные и статусы доступны в GitHub.",owner:"Ответственный",unassigned:"Не назначен",status:"Статус",open:"Открыта при проверке",evidence:"Исходные доказательства",verification:"Проверка человеком ожидается",scorecard:"Недельные показатели и канонические результаты",ingress:"Допуск собственных событий и защита при удалении"},
 tk:{snapshot:"GitHub işleri 2026-njy ýylyň 18-nji oktýabrynda, 04:49 UTC-de barlandy. Häzirki jogapkärleri we ýagdaýy GitHub-da görüň.",owner:"Jogapkär",unassigned:"Bellenmedik",status:"Ýagdaý",open:"Barlag wagty açyk",evidence:"Çeşme subutnamasy",verification:"Adam tarapyndan barlag garaşylýar",scorecard:"Hepdelik görkezijiler we kabul edilen netijeler",ingress:"Birinji tarap wakalary we öçürme goraglary"},
} as const;
const repository="https://github.com/bagtyyarkovusov/auto.tm-rewrite";
const evidence=`${repository}/blob/c3bcdecac5711d7d7db7d2721daa27757c3941b2/docs/evidence/issue-917/fixed-release-disclosure.md`;

/** Reviewed tracker references, not a second mutable issue system or a verification verdict. */
export function ImprovementFixes({locale}:{locale:"en"|"ru"|"tk"}){
 const labels=copy[locale];
 return <section className="border-t pt-5"><h2 className="font-medium">{improvementCopy[locale].fixes}</h2><p className="mt-2 text-sm text-neutral-600">{labels.snapshot}</p>
  <ul aria-label={improvementCopy[locale].fixes} className="mt-4 divide-y">{([{number:917,title:labels.scorecard},{number:905,title:labels.ingress}]).map(item=><li key={item.number} className="space-y-2 py-4">
   <a className="underline" href={`${repository}/issues/${item.number}`}>#{item.number} · {item.title}</a>
   <p className="text-sm">{labels.owner} · {labels.unassigned}. {labels.status} · {labels.open}.</p>
   <p className="text-sm">{labels.verification}</p><a className="inline-block min-h-11 py-3 text-sm underline" href={evidence}>{labels.evidence}</a>
  </li>)}</ul>
 </section>;
}
