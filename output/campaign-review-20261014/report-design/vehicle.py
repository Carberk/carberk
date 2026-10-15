"""Original orthographic modern sedan diagrams, shared between PDF and phone view.
Generic body geometry, not manufacturer artwork or an exact Camry panel map.
"""
import re
from html import escape
from reportlab.lib.colors import HexColor
BODY='#FFFFFF'; EDGE='#525251'; GLASS='#E7E6E3'; DARK='#3A3A39'
AMBER='#926000'; BLUE='#2563EB'; ROSE='#B33C0F'
class Diagram:
 def __init__(self,w,h):self.w=w;self.h=h;self.parts=[]
 def path(self,d,fill='none',stroke=EDGE,width=1.5):self.parts.append(('path',d,fill,stroke,width))
 def circle(self,x,y,r,fill,stroke='none',width=1):self.parts.append(('circle',x,y,r,fill,stroke,width))
 def mark(self,x,y,n,col):
  self.circle(x,y,13,col,'#FFFFFF',2);self.parts.append(('text',x,y+4,str(n)))
 def svg(self):
  out=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" role="img" aria-label="Ulagyň umumy kuzow shemasy">']
  for v in self.parts:
   if v[0]=='path':_,d,f,s,w=v;out.append(f'<path d="{d}" fill="{f}" stroke="{s}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>')
   elif v[0]=='circle':_,x,y,r,f,s,w=v;out.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{f}" stroke="{s}" stroke-width="{w}"/>')
   else:_,x,y,t=v;out.append(f'<text x="{x}" y="{y}" text-anchor="middle" fill="white" font-family="GeistMono, monospace" font-weight="600" font-size="12">{escape(t)}</text>')
  return ''.join(out)+'</svg>'
 def draw(self,c,x,y,w):
  s=w/self.w;c.saveState();c.translate(x,y+self.h*s);c.scale(s,-s)
  for v in self.parts:
   if v[0]=='path':
    _,d,f,st,lw=v;p=c.beginPath();tokens=re.findall(r'[MLCZ]|-?\d*\.?\d+',d);i=0
    while i<len(tokens):
     cmd=tokens[i];i+=1
     if cmd=='Z':p.close();continue
     n={'M':2,'L':2,'C':6}[cmd];a=list(map(float,tokens[i:i+n]));i+=n
     {'M':p.moveTo,'L':p.lineTo,'C':p.curveTo}[cmd](*a)
    c.setLineWidth(lw)
    if f!='none':c.setFillColor(HexColor(f))
    if st!='none':c.setStrokeColor(HexColor(st))
    c.drawPath(p,fill=int(f!='none'),stroke=int(st!='none'))
   elif v[0]=='circle':
    _,cx,cy,r,f,st,lw=v;c.setLineWidth(lw);c.setFillColor(HexColor(f))
    if st!='none':c.setStrokeColor(HexColor(st))
    c.circle(cx,cy,r,fill=1,stroke=int(st!='none'))
   else:
    _,cx,cy,t=v;c.saveState();c.translate(cx,cy);c.scale(1,-1);c.setFillColor(HexColor('#FFFFFF'));c.setFont('TKB',12);c.drawCentredString(0,0,t);c.restoreState()
  c.restoreState()

def side(view='left',marks=True):
 d=Diagram(540,185)
 # Long wheelbase, narrow lamps, low fastback roof; front faces left.
 d.path('M 20 137 L 17 113 C 17 102 25 94 43 90 L 129 77 C 157 62 182 37 222 33 C 266 28 308 31 335 41 C 355 49 381 65 404 78 L 492 88 C 508 90 519 98 521 109 L 523 139 L 466 143 C 465 111 448 98 424 98 C 398 98 381 113 381 144 L 156 144 C 156 113 138 98 113 98 C 87 98 70 114 70 144 Z',BODY)
 d.path('M 148 78 C 177 57 195 43 224 41 C 263 36 304 39 331 48 L 377 78 Z',GLASS)
 d.path('M 251 40 L 244 78 M 322 46 L 342 78',stroke=BODY,width=4)
 # Structural panel boundaries, handles and continuous shoulder crease.
 d.path('M 163 83 L 158 105 L 161 137 M 248 83 L 244 136 M 352 83 L 366 133 M 34 104 C 155 93 360 94 503 103',width=1)
 d.path('M 177 92 L 193 92 M 273 92 L 289 92 M 169 137 L 366 137 M 31 128 L 61 128 M 474 129 L 512 129',width=1.8)
 d.path('M 24 104 L 69 98 L 62 107 L 22 112 Z','#FFFFFF')
 d.path('M 480 99 L 516 103 L 518 111 L 488 108 Z','#D2D0CB')
 d.path('M 156 77 L 163 68 L 177 72 L 174 80 Z',BODY)
 for x in (113,424):
  d.circle(x,143,29,'#E7E6E3',DARK,1.5);d.circle(x,143,23,'#FFFFFF',EDGE,1);d.circle(x,143,17,'#FFFFFF',EDGE,.7);d.circle(x,143,5,'#FFFFFF',EDGE,1)
  for ax,ay in [(0,-10),(9,-3),(6,8),(-6,8),(-9,-3)]:d.circle(x+ax,143+ay,1.5,EDGE)
  d.path(f'M {x-34} 143 L {x-30} 143 M {x+30} 143 L {x+34} 143',width=.6)
 if marks and view=='left':
  d.path('M 80 88 L 129 81 L 155 82 L 150 102 C 139 92 114 88 94 98 Z','#FEF3C7',AMBER,1);d.mark(127,90,1,AMBER)
 if marks and view=='right':
  d.path('M 252 84 L 345 84 L 357 133 L 251 135 Z','#EFF6FF',BLUE,1);d.mark(303,108,2,BLUE);d.mark(113,143,4,ROSE)
 return d

def top(marks=True):
 d=Diagram(220,460)
 for x in (22,184):
  for y in (83,328):d.path(f'M {x} {y} L {x+14} {y} L {x+14} {y+49} L {x} {y+49} Z',DARK,'none')
 d.path('M 56 20 C 80 10 140 10 164 20 C 184 29 186 57 187 91 L 188 354 C 188 389 181 427 166 440 C 145 452 75 452 54 440 C 39 427 32 389 32 354 L 33 91 C 34 57 36 29 56 20 Z',BODY)
 d.path('M 50 111 C 69 103 151 103 170 111 L 156 185 C 130 174 90 174 64 185 Z',GLASS)
 d.path('M 64 292 C 89 301 131 301 156 292 L 170 354 C 146 367 74 367 50 354 Z',GLASS)
 d.path('M 66 194 C 86 185 134 185 154 194 L 154 283 C 133 293 87 293 66 283 Z','#FAFAF9')
 d.path('M 44 102 L 51 49 C 69 36 151 36 169 49 L 176 102 M 44 367 L 52 413 C 78 425 142 425 168 413 L 176 367 M 45 129 L 50 233 L 43 338 M 175 129 L 170 233 L 177 338 M 42 238 L 61 238 M 159 238 L 178 238',width=1)
 d.path('M 35 142 L 17 155 L 17 165 L 34 161 M 185 142 L 203 155 L 203 165 L 186 161',BODY)
 d.path('M 48 31 L 74 25 M 146 25 L 172 31 M 48 431 L 77 437 M 143 437 L 172 431',stroke=EDGE,width=3)
 if marks:d.mark(43,94,1,AMBER);d.mark(174,293,2,BLUE);d.mark(144,432,3,BLUE);d.mark(192,108,4,ROSE)
 return d

def end(rear=False,marks=True):
 d=Diagram(300,170)
 d.path('M 29 143 L 27 95 C 28 83 37 77 47 72 L 66 36 C 86 23 214 23 234 36 L 253 72 C 263 77 272 83 273 95 L 271 143 Z',BODY)
 d.path('M 58 70 L 74 40 C 100 32 200 32 226 40 L 242 70 Z',GLASS)
 d.path('M 32 101 C 90 110 210 110 268 101 M 40 132 L 260 132',width=1)
 if rear:
  d.path('M 36 86 L 105 91 L 100 99 L 35 94 Z','#D2D0CB');d.path('M 195 91 L 264 86 L 265 94 L 200 99 Z','#D2D0CB')
  d.path('M 115 110 L 185 110 L 185 126 L 115 126 Z','#FFFFFF')
  if marks:d.mark(233,131,3,BLUE)
 else:
  d.path('M 36 86 L 103 92 L 96 99 L 35 94 Z','#FFFFFF');d.path('M 197 92 L 264 86 L 265 94 L 204 99 Z','#FFFFFF')
  d.path('M 90 116 L 210 116 L 199 136 L 101 136 Z',DARK)
 d.path('M 31 143 L 31 155 L 62 155 L 62 145 M 238 145 L 238 155 L 269 155 L 269 143',DARK,DARK)
 return d
