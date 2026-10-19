from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from xml.sax.saxutils import escape
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPDF

OUT=Path.cwd()/'output/pdf/carberk-diagnostika-hasabat-nusgasy-tk.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('TK',str(Path.cwd()/'apps/mobile/assets/fonts/Geist-Regular.ttf')))
pdfmetrics.registerFont(TTFont('TKB',str(Path.cwd()/'apps/mobile/assets/fonts/Geist-SemiBold.ttf')))
pdfmetrics.registerFont(TTFont('TKMONO',str(Path.cwd()/'apps/mobile/assets/fonts/GeistMono-Regular.ttf')))
pdfmetrics.registerFontFamily('TK',normal='TK',bold='TKB',italic='TK',boldItalic='TKB')
c=canvas.Canvas(str(OUT),pagesize=A4); W,H=A4; M=40; CW=W-80
INK=colors.HexColor('#171717');MUTED=colors.HexColor('#525251');LINE=colors.HexColor('#E7E6E3');GRAY=colors.HexColor('#F4F4F2');WHITE=colors.white
RED=colors.HexColor('#B33C0F');REDL=colors.HexColor('#FAEBE6');AMBER=colors.HexColor('#926000');AMBERL=colors.HexColor('#FFFBEB');BLUE=colors.HexColor('#2563EB');BLUEL=colors.HexColor('#EFF6FF');GLASS=colors.HexColor('#D2D0CB')
c.setTitle('Carberk | Awtoulagyň diagnostika hasabaty | görkezme nusgasy');c.setAuthor('Carberk');c.setSubject('Türkmençe görkezme nusgasy. Hakyky barlag däl.')
def tx(x,y,t,size=9,b=False,col=INK):
 c.setFillColor(col);technical=(t.startswith(('DEMO-','128 400','14.10.2026')) or t in ['01','02','03','04','05','06','07','08','09','10']);c.setFont('TKMONO' if technical else 'TKB' if b else 'TK',size);c.drawString(x,y,t)
def para(t,x,y,w=CW,size=9,b=False,col=INK):
 p=Paragraph(t,ParagraphStyle('p',fontName='TKB' if b else 'TK',fontSize=size,leading=size+3,textColor=col));_,h=p.wrap(w,1500);p.drawOn(c,x,y-h);return y-h

def rect(x,y,w,h,fill=WHITE,stroke=LINE,r=6):
 c.setFillColor(fill);c.setStrokeColor(stroke);c.setLineWidth(.7);c.roundRect(x,y,w,h,r,stroke=1,fill=1)
def rule(y):c.setStrokeColor(LINE);c.setLineWidth(.6);c.line(M,y,W-M,y)
def brand_logo(x,y,width=90):
 logo=svg2rlg(str(Path.cwd()/'apps/mobile/assets/logo-carberk-red.svg'));ratio=width/logo.width;logo.scale(ratio,ratio);renderPDF.draw(logo,c,x,y)
def header(n,title,sub):
 brand_logo(M,800);tx(335,806,'GÖRKEZME NUSGASY · DEMO-0001 / v1',8,True)
 rule(787);tx(M,756,title,20,True);para(sub,M,739,size=9,col=MUTED)
def footer(n):
 rule(44);tx(M,29,'Ähli ulag maglumatlary we netijeler oýlanyp tapylan mysaldyr. Hakyky barlag däl.',7.5,col=MUTED);tx(530,29,f'{n} / 4',8,col=MUTED);c.showPage()
def marker(x,y,num,col=BLUE):
 c.setFillColor(col);c.setStrokeColor(WHITE);c.setLineWidth(1.5);c.circle(x,y,9,stroke=1,fill=1);c.setFillColor(WHITE);c.setFont('TKB',9);c.drawCentredString(x,y-3,str(num))
def polygon(points,fill,stroke=INK):
 p=c.beginPath();p.moveTo(*points[0]);
 for q in points[1:]:p.lineTo(*q)
 p.close();c.setFillColor(fill);c.setStrokeColor(stroke);c.setLineWidth(.7);c.drawPath(p,fill=1,stroke=1)
from vehicle import side as sedan_side, top as sedan_top, end as sedan_end

def side(x,y,w=220,view='left',marks=True):
 sedan_side(view,marks).draw(c,x,y,w)
def top(x,y,w=102,h=192):
 sedan_top().draw(c,x+6,y,w-12)
def end(x,y,w=135,rear=False):
 sedan_end(rear).draw(c,x,y,w)

header(1,'Awtoulagyň diagnostika hasabaty','Doldurylan görkezme nusgasy. Dizaýny we mazmuny mehanikler bilen ara alyp maslahatlaşmak üçin.')
rect(M,655,CW,47,REDL,RED)
para('Hakyky ulag barlanmady. Bu resminama satyn almak, sürmek ýa-da ulagyň ýagdaýyna kepil bermek üçin ulanylmaly däl.',M+13,690,CW-26,9,True,RED)
tx(M,625,'Toyota Camry · 2018',21,True);tx(M,605,'Diňe mysal üçin saýlanan model. Hakyky ulag ýa-da müşderi bilen bagly däl.',8.5,col=MUTED)
side(108,462,380,marks=False)
fields=[('Hasabat','DEMO-0001 · wersiýa 1'),('Barlag senesi','14.10.2026 · mysal'),('Odometr','128 400 km · mysal'),('Merkez','Aşgabat · görkezme'),('VIN','Nusgada görkezilmeýär'),('Şablon','DEMO-v0.1 · tassyklanmadyk')]
for i,(label,val) in enumerate(fields):
 xx=M+(i%2)*265;yy=449-(i//2)*43;tx(xx,yy,label.upper(),7.5,True,MUTED);tx(xx,yy-17,val,10,True)
rule(325)
tx(M,301,'Ilki üns bermeli',13,True)
rect(M,220,CW,65,REDL,RED)
para('4 · Öň sag şinanyň gapdalynda jaýryk',M+13,272,CW-26,11,True,RED)
para('Mysaldaky möhüm näsazlyk. Hünärmeniň barlagy gerek. Şu mysalda ýol synagy geçirilmedi.',M+13,250,CW-26,9)
y=198
for title,body in [('Kuzowda 3 bellik','Boýa işiniň alamaty, çyzylan gapy we yzky bamperdäki ezik. 2-nji sahypada kartasy bar.'),('3 barlag geçirilmedi','OBD, aşaky bölek we ýol synagy. Geçirilmedik barlaglar abat netije hasaplanmaýar.')]:
 tx(M,y,title,10,True);y=para(body,M,y-9,CW,9,col=MUTED)-17
para('Bu hasabat barlag pursatyndaky gözegçiligi görkezmek üçin nusgadyr. Tutuş ulag üçin baha, dereje ýa-da «heläkçiliksiz» diýen netije ýok.',M,84,CW,8.5)
footer(1)

header(2,'Kuzow kartasy','Belgiler indiki sahypalardaky şol bir tapyndylara degişlidir. Umumy sedan shemasy; modeliň takyk panel kartasy däl.')
rect(M,670,CW,33,GRAY,LINE)
para('Çep / sag ulagyň öňe hereket edýän ugruna görä görkezilýär. Boş ýa-da çal ýer «abat» diýmegi aňlatmaýar.',M+11,694,CW-22,8.5)
tx(48,644,'ÇEP TARAP',10,True);tx(48,628,'ÖŇ ←',8,col=MUTED);side(48,510,220,'left')
tx(327,644,'SAG TARAP',10,True);tx(327,628,'ÖŇ ←',8,col=MUTED);side(327,510,220,'right')
tx(232,490,'ÝOKARDAN · ÖŇ ↑',9,True);top(244,281,105,193);tx(277,268,'YZA',8,col=MUTED)
tx(49,439,'ÖŇ TARAP',9,True);end(49,324,143)
tx(412,439,'YZ TARAP',9,True);end(412,324,143,True)
rule(247);tx(M,226,'Kartany nähili okamaly',12,True)
rows=[(1,'BO?','Çep öň ganat','Boýa işiniň alamaty; sebäbi belli däl.',AMBER),(2,'ÇY','Sag yzky gapy','Çyzylan ýer.',BLUE),(3,'EZ','Yzky bamper','Kiçi ezik.',BLUE),(4,'JA','Öň sag şina','Gapdalda jaýryk; möhüm näsazlyk.',RED)]
for i,(num,code,panel,desc,col) in enumerate(rows):
 yy=202-i*31;marker(50,yy-1,num,col);tx(68,yy+2,code,8.5,True,col);tx(107,yy+2,panel,9,True);tx(107,yy-10,desc,8.5,col=MUTED)
para('Boýa işiniň alamaty heläkçiligi özbaşdak subut etmeýär. Mysalda heläkçilik taryhy tassyklanmady. Bir tapyndy birnäçe görnüşde görkezilse, belgisi şol bir bolmalydyr.',M,72,CW,8)
footer(2)

header(3,'Barlag netijeleriniň sanawy','Diňe dizaýny görkezýän 10 mysal barlagy. Bu sanaw hyzmatyň jemleýji ýa-da doly barlag tertibi däl.')
# Explicit categories; no aggregate reassuring score.
labels=[('3','Kadaly',GRAY,INK),('3','Bellik',AMBERL,AMBER),('1','Näsazlyk',REDL,RED),('3','Barlanmady',GRAY,MUTED)]
for i,(n,label,bg,col) in enumerate(labels):
 xx=M+i*131;rect(xx,647,122,54,bg,LINE);tx(xx+11,677,n,18,True,col);tx(xx+11,659,label,9,True,col)
data=[('01','Görünýän ulag belgileri','Kadaly','Mysalda görünýän maglumatlar gabat gelýär. Resminamalaryň hakykylygy tassyklanmady.'),('02','Çep öň ganat · tapyndy 1','Bellik','Boýa işiniň alamaty we mysal ölçegi bar. Sebäp belli däl.'),('03','Sag yzky gapy · tapyndy 2','Bellik','Daşky ýüzünde çyzylan ýer görkezilýär.'),('04','Yzky bamper · tapyndy 3','Bellik','Kiçi ezik görkezilýär.'),('05','Öň sag şina · tapyndy 4','Näsazlyk','Gapdaldaky jaýryk sebäpli hünärmen barlagy gerek.'),('06','Motordaky görünýän syzma','Kadaly','Diňe mysaldaky görünýän ýerlerde syzma bellenmedi. Gizlin ýerler barada netije ýok.'),('07','Daşky yşyklar','Kadaly','Mysalda barlanan yşyklar işleýär. Bu ähli elektrik ulgamynyň barlagy däl.'),('08','OBD kompýuter barlagy','Barlanmady','Skaner netijesi bu nusga goşulmady. Kodlar barada netije çykarylmaýar.'),('09','Ulagyň aşaky bölegi','Barlanmady','Göterijidäki barlag netijesi ýok. Aşaky gurluş barada netije çykarylmaýar.'),('10','Ýol synagy','Barlanmady','Şinadaky mysal näsazlyk sebäpli geçirilmedi.')]
y=622
for i,(ident,title,status,desc) in enumerate(data):
 h=47 if i not in [0,5,8] else 52
 c.setFillColor(GRAY if i%2==0 else WHITE);c.rect(M,y-h,CW,h,stroke=0,fill=1)
 tx(M+8,y-16,ident,9,True,MUTED);tx(M+35,y-16,title,9,True)
 co=RED if status=='Näsazlyk' else AMBER if status=='Bellik' else MUTED
 tx(448,y-16,status,8.5,True,co);para(desc,M+35,y-22,365,8)
 y-=h
para('«Kadaly» diňe görkezilen barlagyň çäginde ulanylýar. «Barlanmady» we «degişli däl» aýratyn netijelerdir; olar geçilen barlag hasaplanmaýar.',M,y-16,CW,8.5)
footer(3)

header(4,'Tapyndylaryň düşündirişi','Kartadaky belgiler bilen baglanyşykly düşündirişler. Ölçegler hem diňe oýlanyp tapylan mysaldyr.')
items=[(1,'Çep öň ganat','Boýa işiniň alamaty',AMBER,'Mysal ölçegi 245 µm; reňk tapawudy hem bellenýär. Bu ýeke ölçeg heläkçiligi ýa-da bölegiň çalşyrylandygyny subut etmeýär.','Usuly, materialy we birnäçe ölçeg nokadyny hünärmen bilen takyklaň.','G1'),(2,'Sag yzky gapy','Çyzylan ýer',BLUE,'Mysalda daşky ýüzünde takmynan 80 mm çyzylan ýer bar. Zeperiň çuňlugy bu nusgada kesgitlenmeýär.','Giň we ýakyn surat bilen zeperiň gerimini görkeziň.','G2'),(3,'Yzky bamper','Kiçi ezik',BLUE,'Mysalda takmynan 20 mm ezik bar. Berkidijiler we gizlin bölekler barada netije ýok.','Gerek bolsa goşmaça barlagy aýratyn belläň.','G3'),(4,'Öň sag şina','Gapdalda jaýryk',RED,'Mysaldaky möhüm näsazlyk. Bu nusgada şol sebäpli ýol synagy geçirilmedi.','Ulag ulanylmazdan öň şinany hünärmene barladyň.','G4')]
y=701
for num,panel,title,col,obs,nextstep,photo in items:
 h=135;rect(M,y-h,CW,h,WHITE,LINE)
 marker(M+20,y-22,num,col);tx(M+39,y-20,panel,11,True);tx(M+39,y-37,title,9,True,col)
 yy=para(obs,M+13,y-49,CW-26,8.5)
 yy=para('<b>Maslahat:</b> '+nextstep,M+13,yy-7,CW-26,8.5)
 tx(M+13,y-h+12,f'Surat salgysy: {photo} · Hakyky surat goşulmady.',8,col=MUTED)
 y-=h+12
para('Nusgany tassyklaýjy hakyky mehanik ýa-da synçy ýok. Hasabatyň hakyky neşirinde barlag işgäriniň ygtyýarlylygy, subutnamalar, möhürlenen wersiýa we degişli elýeterlilik barlanmalydyr.',M,y-1,CW,8.5)
para('Jemleýji türkmençe sözler, barlag usullary, enjamlar we howpsuzlyk boýunça maslahatlar merkez tarapyndan tassyklanmalydyr.',M,75,CW,8.5,col=MUTED)
footer(4);c.save();print(OUT)
