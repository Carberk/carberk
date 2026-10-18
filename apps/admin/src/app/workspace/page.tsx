import Link from "next/link";

import { AdminNav } from "../(admin)/components/AdminNav";

import { currentStaff, currentMarketplaceAdmin } from "@/lib/staff-session";
import { AdminText } from "@/lib/i18n";

const panels=[
  {capabilities:["support.operations","history.fulfilment","history.payment.verify","founder.refund.approve"],title:"Сервис и поддержка"},
  {capabilities:["diagnostics.reception","diagnostics.technician","diagnostics.reviewer","diagnostics.templates"],title:"Диагностика"},
  {capabilities:["analytics.aggregate","analytics.investigate"],title:"Улучшения"},
];
export default async function WorkspacePage() {
  const summary=await currentStaff("/workspace");const marketplaceAdmin=await currentMarketplaceAdmin();
  return <><AdminNav capabilities={summary.capabilities} marketplaceAdmin={marketplaceAdmin}/><main id="main" className="mx-auto w-full max-w-6xl p-6 md:p-8">
    <h1 className="text-2xl font-semibold"><AdminText>Рабочее пространство</AdminText></h1>
    <p className="mt-2 max-w-2xl text-neutral-600"><AdminText>Доступ определяется текущими полномочиями. Данные разделов появятся после подключения их сервисов.</AdminText></p>
    <div className="mt-8 divide-y">
      {marketplaceAdmin&&<section className="py-5"><h2 className="text-lg font-medium"><Link href="/reports"><AdminText>Очередь жалоб</AdminText></Link></h2><p className="mt-2 text-sm text-neutral-600"><AdminText>Открыть очередь модерации</AdminText></p></section>}
      {panels.filter(panel=>panel.capabilities.some(capability=>summary.capabilities.includes(capability as typeof summary.capabilities[number]))).map(panel=><section key={panel.title} className="py-5"><h2 className="text-lg font-medium">{panel.title==="Улучшения"||panel.title==="Диагностика"?<Link href={panel.title==="Улучшения"?"/improvement":"/diagnostics"}><AdminText>{panel.title}</AdminText></Link>:<AdminText>{panel.title}</AdminText>}</h2><p className="mt-2 text-sm text-neutral-600" role="status"><AdminText>{panel.title==="Улучшения"?"Открыть показатели улучшений":panel.title==="Диагностика"?"Открыть назначенные осмотры":"Раздел пока недоступен. Данные не загружены."}</AdminText></p></section>)}
      {!marketplaceAdmin&&summary.capabilities.length===0&&<p className="py-5" role="status"><AdminText>Недостаточно прав.</AdminText></p>}
    </div>
  </main></>;
}
