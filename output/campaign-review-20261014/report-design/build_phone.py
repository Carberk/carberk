from pathlib import Path
import runpy,shutil
from html import escape
from vehicle import side,top,end
ROOT=Path.cwd();OUT=ROOT/'output/report-design';D=runpy.run_path(str(OUT/'build.py'))
for name in ['Geist-Regular.ttf','Geist-SemiBold.ttf','GeistMono-Regular.ttf']:shutil.copy(ROOT/'apps/mobile/assets/fonts'/name,OUT/name)
shutil.copy(ROOT/'apps/mobile/assets/logo-carberk-red.svg',OUT/'logo.svg')
shutil.copy(ROOT/'output/pdf/carberk-diagnostika-hasabat-nusgasy-tk.pdf',OUT/'sample-report.pdf')
views=[('left','Çep tarap','Öň tarapy çepde',side()),('right','Sag tarap','Öň tarapy çepde',side('right')),('top','Ýokardan','Öň tarapy ýokarda',top()),('front','Öň tarap','Ulagyň öňünden görnüş',end()),('rear','Yz tarap','Ulagyň yzyndan görnüş',end(True))]
figures=''.join(f'<figure id="view-{key}" {"hidden" if i else ""}><div class="view-heading"><strong>{title}</strong><span>{sub}</span></div><div class="vehicle {key}">{v.svg()}</div></figure>' for i,(key,title,sub,v) in enumerate(views))
nav=''.join(f'<button type="button" role="tab" id="tab-{key}" aria-controls="view-{key}" aria-selected="{str(i==0).lower()}" data-view="{key}">{dict(left='Çep',right='Sag',top='Ýokary',front='Öň',rear='Yz')[key]}</button>' for i,(key,title,sub,v) in enumerate(views))
findings=''
for num,panel,title,col,obs,nextstep,photo in D['items']:
 color=['amber','blue','blue','fault'][num-1]
 for value in ['245 µm','80 mm','20 mm']:obs=obs.replace(value,'<span class="measurement">'+value+'</span>')
 findings+=f'<details id="finding-{num}" class="finding {color}"><summary><span class="marker">{num}</span><span><strong>{panel}</strong><small>{title}</small></span><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m8 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></summary><div class="finding-body"><p>{obs}</p><p><strong>Maslahat:</strong> {nextstep}</p><p class="muted">Surat {photo} · Hakyky surat goşulmady.</p></div></details>'
checks=''.join(f'<li><span class="check-code">{ident}</span><div><strong>{title}</strong><p>{desc}</p></div><span class="status {"fault" if status=="Näsazlyk" else "amber" if status=="Bellik" else "muted"}">{status}</span></li>' for ident,title,status,desc in D['data'])
html='''<!doctype html><html lang="tk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Carberk · Diagnostika hasabaty</title><link rel="stylesheet" href="report.css"></head><body><div class="shell"><header class="appbar"><a class="up-button" href="#report-overview" aria-label="Hasabatyň başyna"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a><span>Diagnostika hasabaty</span><img src="logo.svg" alt="Carberk"></header><main><section id="report-overview" class="overview"><div class="overview-title"><div><h1>Diagnostika hasabaty</h1><p class="vehicle-name">Toyota Camry, 2018</p></div><p class="report-id">DEMO-0001 <span>· v1</span></p></div><p class="demo"><strong>Görkezme nusgasy.</strong> Ähli maglumatlar we netijeler oýlanyp tapylan. Hakyky ulag barlanmady.</p><dl class="metadata"><div><dt>Odometr</dt><dd>128 400 <span>km</span></dd></div><div><dt>Barlag senesi</dt><dd>14.10.2026</dd></div><div><dt>Merkez</dt><dd class="sans">Aşgabat · mysal</dd></div><div><dt>Şablon</dt><dd>DEMO-v0.1</dd></div></dl><aside class="attention"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3 2 21h20L12 3Z M12 9v5 M12 17v1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg><div><h2>Öň sag şina · tapyndy 4</h2><p>Gapdalda jaýryk. Hünärmeniň barlagy gerek. Şu mysalda ýol synagy geçirilmedi.</p><a href="#finding-4" id="fault-link">Tapyndyny aç</a></div></aside></section><section id="body-map" class="body-map"><div class="section-heading"><h2>Kuzow we daşky ýagdaý</h2><p class="muted">4 tapyndy · 5 görnüş</p></div><div class="inspection-layout"><div class="map-column"><div class="map-surface"><div class="tabs" role="tablist" aria-label="Ulagyň görnüşleri">NAV</div><div class="drawings">FIGURES</div><p class="map-note">Umumy sedan shemasy; modeliň takyk panel kartasy däl. Çep / sag hereket ugruna görä. Boş ýer «abat» diýmegi aňlatmaýar.</p></div></div><div class="findings-column"><h3>Tapyndylar</h3><p class="section-intro">Belgini ýa-da setiri basyp düşündirişini açyň.</p><div class="finding-group">FINDINGS</div><p class="map-note">Boýa işiniň alamaty heläkçiligi özbaşdak subut etmeýär.</p></div></div></section><section class="results section"><div class="section-heading"><h2>Barlag netijeleri</h2><p class="muted">10 mysal barlagy</p></div><p class="section-intro">Bu hyzmatyň tassyklanan doly barlag sanawy däl.</p><div class="result-counts"><span><b>3</b> Kadaly</span><span><b>3</b> Bellik</span><span class="fault"><b>1</b> Näsazlyk</span><span><b>3</b> Barlanmady</span></div><ul class="checks">CHECKS</ul></section><p class="footer">Hakyky barlag, kepillik ýa-da ulagyň umumy bahasy däl. Barlanmadyk ýerler abat netije hasaplanmaýar.</p></main><div class="export-bar"><span class="export-meta">DEMO-0001 / v1 <small>Görkezme nusgasy</small></span><a class="export" href="sample-report.pdf" download><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>PDF ýükle</a></div></div><script>
const tabs=[...document.querySelectorAll('[data-view]')];
function select(tab,focus=false){tabs.forEach(t=>{const active=t===tab;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;document.getElementById('view-'+t.dataset.view).hidden=!active&&!matchMedia('(min-width:1000px)').matches;});if(focus)tab.focus();}
tabs.forEach((t,i)=>{t.tabIndex=i?-1:0;t.onclick=()=>select(t);t.onkeydown=e=>{let j=i;if(e.key==='ArrowRight')j=(i+1)%tabs.length;else if(e.key==='ArrowLeft')j=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')j=0;else if(e.key==='End')j=tabs.length-1;else return;e.preventDefault();select(tabs[j],true);};});
function openFinding(n){const d=document.getElementById('finding-'+n);d.open=true;d.scrollIntoView({block:'center'});d.querySelector('summary').focus({preventScroll:true});}
document.getElementById('fault-link').onclick=e=>{e.preventDefault();openFinding(4);};
const wide=matchMedia('(min-width:1000px)');
function responsive(){document.querySelectorAll('figure').forEach(f=>{if(wide.matches){f.hidden=false;f.removeAttribute('role');f.removeAttribute('aria-labelledby');}else{f.hidden=document.querySelector('#tab-'+f.id.replace('view-','')).getAttribute('aria-selected')!=='true';f.setAttribute('role','tabpanel');f.setAttribute('aria-labelledby','tab-'+f.id.replace('view-',''));}});}
wide.addEventListener('change',responsive);responsive();
document.querySelectorAll('figure').forEach(f=>{f.querySelectorAll('svg text').forEach(t=>{const n=t.textContent;const g=document.createElementNS('http://www.w3.org/2000/svg','a');g.setAttribute('href','#finding-'+n);g.setAttribute('aria-label','Tapyndy '+n);const dot=t.previousElementSibling;t.parentNode.insertBefore(g,dot);const hit=document.createElementNS('http://www.w3.org/2000/svg','circle');hit.setAttribute('cx',dot.getAttribute('cx'));hit.setAttribute('cy',dot.getAttribute('cy'));hit.setAttribute('r','50');hit.setAttribute('fill','transparent');g.append(hit);g.append(dot);g.append(t);g.onclick=e=>{e.preventDefault();openFinding(n);};});});
</script></body></html>'''
html=html.replace('NAV',nav).replace('FIGURES',figures).replace('FINDINGS',findings).replace('CHECKS',checks)
(OUT/'report.html').write_text(html)

# Reuse the exact vector artwork for a printable empty workshop worksheet.
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
c=canvas.Canvas(str(ROOT/'output/pdf/carberk-kuzow-barlag-kartasy-tk.pdf'),pagesize=A4)
W,H=A4
for page in (1,2):
 logo=D['svg2rlg'](str(ROOT/'apps/mobile/assets/logo-carberk-red.svg'));ratio=90/logo.width;logo.scale(ratio,ratio);D['renderPDF'].draw(logo,c,40,800)
 c.setFillColor(HexColor('#171717'));c.setFont('TKB',22);c.drawString(40,750,'Kuzow barlag kartasy')
 c.setFont('TK',10);c.drawString(40,727,'Doldurylmadyk iş kagyzy · Görkezme nusgasy')
 c.setFont('TK',9);c.drawString(40,695,'Ulag / VIN: _____________________________________    Sene: __________________')
 if page==1:
  for yy,label,v in [(495,'Çep tarap · öň tarapy çepde',side(marks=False)),(285,'Sag tarap · öň tarapy çepde',side('right',False))]:
   c.setFont('TKB',12);c.drawString(40,yy+145,label);v.draw(c,40,yy,515)
 else:
  top(False).draw(c,235,350,125)
  c.setFont('TKB',11);c.drawString(235,633,'Ýokardan · öň ↑')
  for xx,label,rear in [(40,'Öň tarap',False),(370,'Yz tarap',True)]:
   c.drawString(xx,560,label);end(rear,False).draw(c,xx,420,185)
 c.setFont('TK',9)
 for i,label in enumerate(['Tapyndy / bölek:','Gözegçilik / ölçeg:','Surat salgysy:','Barlanmadyk ýerler:']):
  yy=220-i*35;c.drawString(40,yy,label);c.setStrokeColor(HexColor('#D2D0CB'));c.line(145,yy-2,555,yy-2)
 c.setFont('TK',8);c.drawString(40,59,'Umumy sedan shemasy. Takyk model kartasy däl. Boş ýer «abat» diýmegi aňlatmaýar.')
 c.drawString(40,43,'Çep / sag hereket ugruna görä. Hakyky hasabat ýa-da tassyklanan hyzmat şablony däl.')
 c.drawRightString(555,27,f'{page} / 2');c.showPage()
c.save()
