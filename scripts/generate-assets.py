from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, random

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)

W, H = 1440, 560
random.seed(26)


def hexrgb(value: str):
    value = value.lstrip('#')
    return tuple(int(value[i:i+2], 16) for i in (0, 2, 4))


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vertical_gradient(size, stops):
    w, h = size
    image = Image.new('RGB', size)
    px = image.load()
    stops = sorted((float(pos), hexrgb(color) if isinstance(color, str) else color) for pos, color in stops)
    for y in range(h):
        t = y / max(h - 1, 1)
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if t <= p1:
                local = 0 if p1 == p0 else (t - p0) / (p1 - p0)
                c = lerp(c0, c1, max(0, min(1, local)))
                break
        else:
            c = stops[-1][1]
        for x in range(w):
            px[x, y] = c
    return image


def overlay_glow(image, center, radius, color, alpha=120):
    layer = Image.new('RGBA', image.size, (0,0,0,0))
    draw = ImageDraw.Draw(layer)
    x, y = center
    r = int(radius)
    draw.ellipse((x-r, y-r, x+r, y+r), fill=(*hexrgb(color), alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(radius / 2.3))
    image.alpha_composite(layer)


def add_grain(image, opacity=15):
    noise = Image.new('L', image.size)
    data = [random.randrange(80, 176) for _ in range(image.width * image.height)]
    noise.putdata(data)
    noise = noise.filter(ImageFilter.GaussianBlur(.35))
    layer = Image.new('RGBA', image.size, (255,255,255,0))
    layer.putalpha(noise.point(lambda v: int(opacity * v / 255)))
    image.alpha_composite(layer)


def draw_mountains(draw, points, fill):
    draw.polygon(points + [(W, H), (0, H)], fill=fill)


def draw_building(draw, x, base, width, height, fill, windows=None, step=14):
    draw.rounded_rectangle((x, base-height, x+width, base), radius=max(1, width//16), fill=fill)
    if windows:
        for wy in range(base-height+18, base-10, step):
            for wx in range(x+10, x+width-8, max(14, step)):
                if random.random() > .45:
                    draw.rounded_rectangle((wx, wy, wx+3, wy+5), radius=1, fill=windows)


def taipei101(draw, x, base, scale=1.0):
    teal = '#B7F2DE'
    deep = '#143F39'
    glow = '#E6FFF7'
    s = scale
    # spire
    draw.rounded_rectangle((x-3*s, base-310*s, x+3*s, base-236*s), radius=2, fill=glow)
    draw.polygon([(x-7*s,base-236*s),(x+7*s,base-236*s),(x+10*s,base-218*s),(x-10*s,base-218*s)], fill=teal)
    # stacked sections
    widths = [48, 60, 70, 80, 90, 100, 112]
    top = base-218*s
    for i, width in enumerate(widths):
        y0 = top + i*27*s
        y1 = y0 + 23*s
        draw.polygon([(x-width*s/2,y0),(x+width*s/2,y0),(x+(width+8)*s/2,y1),(x-(width+8)*s/2,y1)], fill=teal)
        draw.line((x-width*s/2+6*s,y0+8*s,x+width*s/2-6*s,y0+8*s), fill=deep, width=max(1,int(2*s)))
    draw.polygon([(x-64*s,base-25*s),(x+64*s,base-25*s),(x+78*s,base),(x-78*s,base)], fill=teal)
    draw.rectangle((x-7*s,base-210*s,x+7*s,base-30*s), fill='#73CFB5')


def make_taipei():
    img = vertical_gradient((W,H), [(0,'#74BFC5'),(.42,'#B7D8C7'),(.72,'#E8CBA8'),(1,'#455D55')]).convert('RGBA')
    overlay_glow(img, (1120,125), 150, '#F6C78C', 150)
    draw = ImageDraw.Draw(img)
    draw_mountains(draw, [(0,330),(130,255),(260,302),(405,218),(540,310),(710,244),(880,328),(1060,240),(1240,308),(1440,238)], '#597A70')
    draw_mountains(draw, [(0,380),(170,322),(340,366),(510,300),(710,372),(880,310),(1080,372),(1240,326),(1440,356)], '#35584E')
    # city layer
    base=500
    palette=['#1C3633','#24433E','#2D4C47','#31564E']
    x=0
    while x<W:
        bw=random.randint(38,78); bh=random.randint(45,150)
        draw_building(draw,x,base,bw,bh,random.choice(palette),'#AEE6D5',18)
        x += bw+random.randint(5,13)
    # roads / light trails
    draw.line([(0,530),(430,480),(740,520),(1060,466),(1440,515)], fill='#F0A88E', width=6)
    draw.line([(0,538),(430,488),(740,528),(1060,474),(1440,523)], fill='#F8D6B7', width=2)
    taipei101(draw, 1015, 500, 1.0)
    # foreground plants
    for i in range(18):
        x=random.randint(0,W); h=random.randint(18,52)
        draw.line((x,H,x+random.randint(-14,14),H-h), fill='#173A32', width=random.randint(2,4))
    add_grain(img, 11)
    img.convert('RGB').save(ASSETS/'taipei.webp','WEBP',quality=88,method=6)


def make_kaohsiung():
    img = vertical_gradient((W,H), [(0,'#75B7C7'),(.42,'#C5D9C0'),(.67,'#F3C67D'),(1,'#254D54')]).convert('RGBA')
    overlay_glow(img, (1030,160), 170, '#FFD682', 180)
    draw=ImageDraw.Draw(img)
    # distant hills
    draw_mountains(draw, [(0,315),(170,260),(340,310),(520,270),(680,326),(840,275),(1020,320),(1190,245),(1440,318)], '#4C746A')
    # water
    draw.rectangle((0,350,W,H), fill='#29636C')
    for y in range(370,H,18):
        alpha=int(110*(1-(y-370)/(H-350)))
        draw.line((0,y,W,y+random.randint(-4,4)), fill=(172,230,217,max(25,alpha)), width=2)
    # skyline and port
    base=370
    for x in range(20,1390,70):
        bw=random.randint(35,70); bh=random.randint(35,125)
        draw_building(draw,x,base,bw,bh,random.choice(['#173D43','#224A4B','#2D5550']),'#F9D9A0',20)
    # 85 Sky Tower stylized
    x=970
    draw.rectangle((x-42,165,x+42,370), fill='#163C42')
    draw.polygon([(x-68,240),(x-42,165),(x-42,370),(x-88,370)], fill='#204E50')
    draw.polygon([(x+68,240),(x+42,165),(x+42,370),(x+88,370)], fill='#204E50')
    draw.rectangle((x-10,100,x+10,185), fill='#D7F4E8')
    draw.polygon([(x-18,165),(x+18,165),(x+28,193),(x-28,193)], fill='#9DDFCB')
    # cranes
    for cx in (170,300,1180):
        cy=340
        draw.line((cx,cy,cx,210),fill='#14353A',width=8)
        draw.line((cx,220,cx+115,220),fill='#14353A',width=7)
        draw.line((cx+75,220,cx+75,292),fill='#14353A',width=3)
        draw.line((cx,210,cx+40,250),fill='#14353A',width=4)
    # reflections
    for bx in range(40,1400,58):
        if random.random()>.45:
            col=random.choice(['#F0A88E','#F7D798','#93DEC9'])
            draw.rounded_rectangle((bx,400,bx+4,random.randint(438,535)),radius=2,fill=col)
    # ferry silhouette
    draw.rounded_rectangle((560,410,760,447),radius=18,fill='#112F35')
    draw.polygon([(590,410),(620,376),(695,376),(730,410)],fill='#173D43')
    draw.line((640,376,640,340),fill='#173D43',width=5)
    add_grain(img, 11)
    img.convert('RGB').save(ASSETS/'kaohsiung.webp','WEBP',quality=88,method=6)


def make_hk():
    img=vertical_gradient((W,H),[(0,'#2B315B'),(.42,'#475079'),(.68,'#D08388'),(1,'#102735')]).convert('RGBA')
    overlay_glow(img,(1150,140),155,'#F2A68F',155)
    draw=ImageDraw.Draw(img)
    # Peak silhouette
    draw_mountains(draw,[(0,286),(160,230),(320,256),(480,178),(630,260),(760,190),(930,270),(1080,205),(1240,280),(1440,225)],'#1C3547')
    draw_mountains(draw,[(0,338),(180,292),(340,326),(520,260),(700,330),(860,275),(1030,332),(1220,288),(1440,336)],'#152A39')
    # harbour
    draw.rectangle((0,375,W,H),fill='#102A3A')
    # skyline
    base=385
    colors=['#0D202B','#152B38','#1C3441','#213A47']
    x=25
    while x<W:
        bw=random.randint(22,62); bh=random.randint(45,190)
        draw_building(draw,x,base,bw,bh,random.choice(colors),'#F1B68C',14)
        if random.random()>.72:
            draw.line((x+bw/2,base-bh,x+bw/2,base-bh-random.randint(20,65)),fill='#D5E7EE',width=2)
        x+=bw+random.randint(4,12)
    # ICC-like tower
    draw.rounded_rectangle((1105,105,1168,385),radius=5,fill='#0C202C')
    for y in range(125,365,22):
        draw.line((1116,y,1157,y),fill='#8DD3C4',width=2)
    # Central bank-like landmark
    draw.polygon([(750,365),(750,182),(815,150),(815,365)],fill='#142C39')
    draw.line((755,190,810,355),fill='#E68F84',width=3)
    draw.line((810,160,755,355),fill='#E68F84',width=3)
    # junk boat
    draw.polygon([(330,455),(510,455),(480,478),(355,478)],fill='#071C26')
    draw.line((420,455,420,340),fill='#E5D7C6',width=5)
    draw.polygon([(422,346),(422,424),(500,405)],fill='#E8756A')
    draw.polygon([(417,358),(417,432),(350,414)],fill='#CC5D5F')
    # reflections
    for x in range(30,1400,35):
        col=random.choice(['#E8756A','#F5C38E','#74CABD','#8EA8E2'])
        if random.random()>.35:
            h=random.randint(30,145)
            draw.rounded_rectangle((x,398,x+3,398+h),radius=1,fill=col)
    # water highlights
    for _ in range(45):
        x=random.randrange(W); y=random.randrange(410,H)
        draw.line((x,y,x+random.randint(12,45),y),fill=(170,210,219,80),width=1)
    add_grain(img,12)
    img.convert('RGB').save(ASSETS/'hk.webp','WEBP',quality=88,method=6)


def tower_mark(size=1024, maskable=False):
    # Full-bleed and opaque. iOS fills transparency in apple-touch-icon with black and applies
    # its own rounded mask, so a pre-rounded icon showed a black ring on the Home Screen, and
    # the glows used to spill into the transparent corners. The launch-screen badge is rounded
    # separately in rounded_badge().
    image=Image.new('RGBA',(size,size),(0x0D,0x15,0x14,255))
    draw=ImageDraw.Draw(image)
    overlay_glow(image,(size*.64,size*.30),size*.34,'#2DC7A1',115)
    overlay_glow(image,(size*.28,size*.72),size*.34,'#EA8069',85)
    draw=ImageDraw.Draw(image)
    # route arc
    box=(size*.18,size*.20,size*.82,size*.84)
    draw.arc(box,212,520,fill='#4A6B62',width=max(3,int(size*.012)))
    for ang,col in [(232,'#91E2C8'),(330,'#F2B06F'),(430,'#E9857A')]:
        a=math.radians(ang%360)
        cx=(box[0]+box[2])/2; cy=(box[1]+box[3])/2
        rx=(box[2]-box[0])/2; ry=(box[3]-box[1])/2
        x=cx+rx*math.cos(a); y=cy+ry*math.sin(a)
        r=size*.026
        draw.ellipse((x-r,y-r,x+r,y+r),fill=col)
    # stylized 101
    x=size*.50; base=size*.75; s=size/1024
    taipei101(draw,x,base,1.55*s)
    # tiny harbour underline
    draw.rounded_rectangle((round(size*.28),round(size*.79),round(size*.72),round(size*.815)),radius=round(size*.012),fill='#9CE4D0')
    draw.rounded_rectangle((round(size*.39),round(size*.825),round(size*.61),round(size*.842)),radius=round(size*.008),fill='#F0A58E')
    if maskable:
        # Android crops maskable icons to the centre circle: shrink the art onto its own ground.
        ground=Image.new('RGBA',(size,size),(0x0D,0x15,0x14,255))
        overlay_glow(ground,(size*.64,size*.30),size*.34,'#2DC7A1',115)
        overlay_glow(ground,(size*.28,size*.72),size*.34,'#EA8069',85)
        art=image.resize((int(size*.8),int(size*.8)),Image.Resampling.LANCZOS)
        ground.alpha_composite(art,((size-art.width)//2,(size-art.height)//2))
        return ground
    return image


def rounded_badge(mark, size):
    badge=mark.resize((size,size),Image.Resampling.LANCZOS)
    big=Image.new('L',(size*4,size*4),0)
    ImageDraw.Draw(big).rounded_rectangle((0,0,size*4-1,size*4-1),radius=int(size*4*.225),fill=255)
    badge.putalpha(big.resize((size,size),Image.Resampling.LANCZOS))
    return badge


def save_icons():
    source=tower_mark(1024,False)
    source.save(ROOT/'icon-source.png')
    for name,size,mask in [
        ('apple-touch-icon.png',180,False),('icon-192.png',192,False),('icon-512.png',512,False),
        ('icon-maskable-192.png',192,True),('icon-maskable-512.png',512,True)
    ]:
        img=tower_mark(1024,mask).resize((size,size),Image.Resampling.LANCZOS)
        img.convert('RGB').save(ROOT/name,optimize=True)


def get_font(size,bold=False):
    if Path('/System/Library/Fonts/HelveticaNeue.ttc').exists():
        return ImageFont.truetype('/System/Library/Fonts/HelveticaNeue.ttc', size, index=1 if bold else 0)
    candidates = [
        '/usr/share/fonts/opentype/inter/InterDisplay-SemiBold.otf' if bold else '/usr/share/fonts/opentype/inter/InterDisplay-Regular.otf',
        '/usr/share/fonts/truetype/lato/Lato-Semibold.ttf' if bold else '/usr/share/fonts/truetype/lato/Lato-Regular.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    ]
    for c in candidates:
        if Path(c).exists(): return ImageFont.truetype(c,size)
    return ImageFont.load_default()


def make_splash(width,height):
    img=vertical_gradient((width,height),[(0,'#07100F'),(.48,'#0D1716'),(1,'#101B19')]).convert('RGBA')
    overlay_glow(img,(width*.68,height*.35),min(width,height)*.45,'#2DC7A1',80)
    overlay_glow(img,(width*.30,height*.68),min(width,height)*.42,'#EA8069',50)
    draw=ImageDraw.Draw(img)
    icon_size=int(width*.25)
    icon=rounded_badge(tower_mark(1024,False),icon_size)
    x=(width-icon_size)//2; y=int(height*.34-icon_size*.5)
    img.alpha_composite(icon,(x,y))
    title='TAIWAN + HONG KONG'
    subtitle='TRIP COMPANION'
    title_font=get_font(max(18,int(width*.037)),True)
    sub_font=get_font(max(11,int(width*.020)),False)
    tb=draw.textbbox((0,0),title,font=title_font)
    sb=draw.textbbox((0,0),subtitle,font=sub_font)
    ty=y+icon_size+int(width*.055)
    draw.text(((width-(tb[2]-tb[0]))/2,ty),title,font=title_font,fill='#EEF7F3')
    draw.text(((width-(sb[2]-sb[0]))/2,ty+int(width*.055)),subtitle,font=sub_font,fill='#8FB4A8',spacing=4)
    # route hairline
    line_y=ty+int(width*.12)
    draw.line((width*.31,line_y,width*.69,line_y),fill='#345D53',width=max(1,int(width*.002)))
    for px,col in [(width*.31,'#91E2C8'),(width*.50,'#F2B06F'),(width*.69,'#E9857A')]:
        r=max(2,int(width*.006))
        draw.ellipse((px-r,line_y-r,px+r,line_y+r),fill=col)
    add_grain(img,7)
    return img.convert('RGB')


def save_splashes():
    sizes=[(750,1334),(828,1792),(1080,2340),(1125,2436),(1170,2532),(1179,2556),(1206,2622),(1242,2688),(1284,2778),(1290,2796),(1320,2868)]
    for w,h in sizes:
        make_splash(w,h).save(ROOT/f'splash-{w}x{h}.png',optimize=True)


if __name__=='__main__':
    # The destination banners are real photos now (assets/*-photo.webp, credited in the app);
    # make_taipei/make_kaohsiung/make_hk are kept only as a fallback and are not run.
    save_icons(); save_splashes()
    for p in sorted([*ROOT.glob('icon*.png'),ROOT/'apple-touch-icon.png',*ROOT.glob('splash-*.png')]):
        print(p.relative_to(ROOT), p.stat().st_size)
