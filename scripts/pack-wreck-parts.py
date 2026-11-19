"""Pack the lit debris orientations and volumetric plumes into transparent WebP atlases."""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'work/wreck-parts'
DEST = ROOT / 'public/graphics-v2/breakups'
CATALOG = json.loads((ROOT / 'src/game/assets/wreck-ships.json').read_text())


def collect(frames, key, image, check_edge=True):
    image=image.convert('RGBA')
    box=image.getchannel('A').point(lambda a: 255 if a>=5 else 0).getbbox()
    if not box:
        # A narrow panel can vanish edge-on for one pose.
        box=(image.width//2,image.height//2,image.width//2+1,image.height//2+1)
    if check_edge and min(box[0],box[1],image.width-box[2],image.height-box[3])<1:
        raise ValueError(('clipped',key,box,image.size))
    l,t,r,b=max(0,box[0]-1),max(0,box[1]-1),min(image.width,box[2]+1),min(image.height,box[3]+1)
    frames[key]=(image.crop((l,t,r,b)),image.size,(l,t))


def layout(frames,width):
    x=y=1;hrow=0;entries={}
    for name in sorted(frames,key=lambda k:(-frames[k][0].height,-frames[k][0].width,k)):
        im,(sw,sh),(left,top)=frames[name];w,h=im.size
        if w+2>width:return None
        if x+w+1>width:
            y+=hrow+2;hrow=0;x=1
        entries[name]={'frame':dict(x=x,y=y,w=w,h=h),'trimmed':True,
                       'spriteSourceSize':dict(x=left,y=top,w=w,h=h),'sourceSize':dict(w=sw,h=sh)}
        x+=w+2;hrow=max(hrow,h)
    return (width,y+hrow+1,entries)


def fit_layers(kind, data, frames):
    """Resolve overlapping solid projections against the approved neutral fleet image.

    A gun barrel and a wide wing can overlap despite their centers being at very
    different depths. Visible pixels of the original ship determine the draw order.
    """
    fleet = ROOT / 'public/graphics-v2'
    spec = json.loads((fleet/'manifest.json').read_text())['ships'][kind]
    w,h = spec['width'],spec['height']
    den = spec.get('textureDensity',1)
    with Image.open(fleet/spec['file']) as source:
        target = source.convert('RGBA').crop((3*w*den,h*den,4*w*den,2*h*den)).resize((w,h),Image.Resampling.LANCZOS)
    if kind=='seraph':
        for side in ('left','right'):
            with Image.open(fleet/'modules'/f'seraph-wing-{side}.png') as wing:
                target.alpha_composite(wing.convert('RGBA').resize((w,h),Image.Resampling.LANCZOS))
    masks=[]
    for i,part in enumerate(data['parts']):
        im,(sw,sh),(l,t)=frames[f'{kind}/{i}/0']
        scale=data['density'];cx,cy=part['anchors'][7]
        layer=Image.new('RGBA',(w,h))
        tile=im.resize((max(1,round(im.width/scale)),max(1,round(im.height/scale))),Image.Resampling.LANCZOS)
        layer.alpha_composite(tile,(round(w/2+cx+(l-sw/2)/scale),round(h/2+cy+(t-sh/2)/scale)))
        masks.append(layer)
    count=len(masks);votes=[[0.0]*count for _ in masks]
    for i in range(count):
        for j in range(i):
            a,b=masks[i].getbbox(),masks[j].getbbox()
            if not a or not b:continue
            box=(max(a[0],b[0]),max(a[1],b[1]),min(a[2],b[2]),min(a[3],b[3]))
            if box[0]>=box[2] or box[1]>=box[3]:continue
            vote=0.0
            for l,r,ref in zip(masks[i].crop(box).getdata(),masks[j].crop(box).getdata(),target.crop(box).getdata()):
                if min(l[3],r[3],ref[3])<220:continue
                left=sum(abs(l[c]-ref[c]) for c in range(3));right=sum(abs(r[c]-ref[c]) for c in range(3))
                vote+=(right-left)*max(0,1-min(left,right)/95)
            votes[i][j],votes[j][i]=vote,-vote
    order=sorted(range(count),key=lambda i:data['parts'][i]['depth'])
    # Move each assembly past its neighbours only when the reference supports it.
    for _ in range(count):
        moved=False
        for i in range(count):
            old=order.index(i);order.pop(old)
            scores=[sum(votes[i][j] for j in order[:at]) for at in range(count)]
            best=max(range(count),key=lambda at:(scores[at],-abs(at-old)))
            order.insert(best,i);moved |= best!=old
        if not moved:break
    for rank,i in enumerate(order):
        del data['parts'][i]['depth']
        data['parts'][i]['layer']=rank


def pack(group):
    frames={};ships={}
    if group=='plumes':
        for style in ('fire','field','ion'):
            for i in range(18):
                with Image.open(SOURCE/'fire'/f'{style}-{i:02d}.png') as image:
                    collect(frames,f'{style}/{i}',image,False)
        spark=Image.new('RGBA',(13,5))
        for y in range(5):
            for x in range(13):
                a=max(0,1-abs(y-2)/2)*max(0,1-abs(x-8)/9)
                spark.putpixel((x,y),(255,round(91+x*11),round(36+x*11),round(230*a)))
        collect(frames,'spall',spark,False)
    for kind, sheet in CATALOG.items():
        if sheet!=group:continue
        d=json.loads((SOURCE/kind/'pieces.json').read_text())
        tile,cols=d.pop('tile'),d.pop('cols')
        for pose in range(d['steps']):
            with Image.open(SOURCE/kind/f'roll-{pose:02d}.png') as image:
                for i,_ in enumerate(d['parts']):
                    x,y=(i%cols)*tile,(i//cols)*tile
                    collect(frames,f'{kind}/{i}/{pose}',image.crop((x,y,x+tile,y+tile)))
        fit_layers(kind,d,frames)
        ships[kind]=d
    choices=[layout(frames,w) for w in (256,512,768,1024,1536,2048)]
    choices=[c for c in choices if c and c[1]<=2048]
    if not choices:raise ValueError('Sheet exceeds 2048 pixels: '+group)
    w,h,entries=min(choices,key=lambda c:c[0]*c[1])
    atlas=Image.new('RGBA',(w,h))
    for key,entry in entries.items():
        rect=entry['frame'];atlas.paste(frames[key][0],(rect['x'],rect['y']))
    file=DEST/f'wreck-{group}.webp'
    atlas.save(file,quality=88,alpha_quality=94,method=6)
    meta={'image':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'size':{'w':w,'h':h},'ships':ships}
    file.with_suffix('.json').write_text(json.dumps({'frames':entries,'meta':meta},separators=(',',':'))+'\n')
    print(group,(w,h),len(entries),file.stat().st_size,flush=True)


for group in sys.argv[1:] or [*dict.fromkeys(CATALOG.values()),'plumes']:
    pack(group)
