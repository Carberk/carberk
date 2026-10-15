from pathlib import Path
import sys,json,base64
ROOT=Path.cwd();OUT=ROOT/'output/inspection-workspace-prototype'
sys.path.insert(0,str(ROOT/'output/report-design'))
from vehicle import side,top,end
views={'left':side(marks=False).svg(),'right':side('right',False).svg(),'top':top(False).svg(),'front':end(False,False).svg(),'rear':end(True,False).svg()}
html=(OUT/'shell.html').read_text().replace('/*STYLE*/',(OUT/'style.css').read_text()).replace('/*APPLICATION*/',(OUT/'app.js').read_text())
html=html.replace('/*INITIAL_DATA*/','const BASE_CHECKS='+ (OUT/'checklist-source.json').read_text()+';\nconst VEHICLE_VIEWS='+json.dumps(views)+';')
for name in ['Geist-Regular','Geist-SemiBold','GeistMono-Regular']:
 data=base64.b64encode((ROOT/f'apps/mobile/assets/fonts/{name}.ttf').read_bytes()).decode();html=html.replace(f'FONT_{name}',f'data:font/ttf;base64,{data}')
logo=(ROOT/'apps/mobile/assets/logo-carberk-red.svg').read_bytes();html=html.replace('LOGO_ASSET','data:image/svg+xml;base64,'+base64.b64encode(logo).decode())
(OUT/'index.html').write_text(html)
print(OUT/'index.html')
