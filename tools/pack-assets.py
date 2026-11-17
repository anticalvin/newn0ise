#!/usr/bin/env python3
"""Packs MakeHuman CC0 hair, clothes, eyebrows, eyelashes and skins into compact files for the Character page.
Input : a folder with the unzipped CC0 asset packs (makehuman_system_assets_cc0.zip, suits05_cc0.zip) from https://static.makehumancommunity.org/assets/assetpacks.html
Output: assets/human/a/<id>.bin + <id>.json (fit data), textures, and assets/human/library.json (what exists)
Run  : python3 tools/pack-assets.py /path/to/unzipped/sys /path/to/unzipped/s5
All packed assets are CC0 1.0 (each .mhclo header states it). Textures are resized, hair and brows are greyscaled so a tint colours them."""
import sys,os,json,struct,re
from PIL import Image
import numpy as np
SRC=[p for p in sys.argv[1:]] or ['/tmp/mhassets/sys','/tmp/mhassets/s5']
OUT='assets/human/a';os.makedirs(OUT,exist_ok=True)
lib={'hair':[],'clothes':[],'eyebrows':[],'eyelashes':[],'skins':[]}

def parse_mhclo(path):
    sc={};verts=[];dele=[];mode=None
    for ln in open(path,encoding='utf8',errors='ignore'):
        t=ln.strip()
        if not t or t.startswith('#'):continue
        k=t.split()
        if k[0] in('x_scale','y_scale','z_scale'):sc[k[0][0]]=[int(k[1]),int(k[2]),float(k[3])];continue
        if k[0]=='verts':mode='v';continue
        if k[0]=='delete_verts':mode='d';continue
        if re.match(r'^[a-z_]+$',k[0]):continue  # other keywords (material, z_depth ...) never end a block
        if mode=='v':verts.append(k)
        elif mode=='d':dele.append(t)
    ia=[];ib=[];ic=[];w=[];off=[]
    for k in verts:
        if len(k)==1:a=int(k[0]);ia.append(a);ib.append(a);ic.append(a);w+= [1,0,0];off+=[0,0,0]
        else:ia.append(int(k[0]));ib.append(int(k[1]));ic.append(int(k[2]));w+=[float(x) for x in k[3:6]];off+=[float(x) for x in k[6:9]]
    # deleted base vertices as ranges
    toks=' '.join(dele).split();rng=[];i=0
    while i<len(toks):
        if i+2<len(toks) and toks[i+1]=='-':rng.append((int(toks[i]),int(toks[i+2])));i+=3
        else:rng.append((int(toks[i]),int(toks[i])));i+=1
    return sc,ia,ib,ic,w,off,rng

def parse_obj(path):
    V=0;vt=[];faces=[]
    for ln in open(path,encoding='utf8',errors='ignore'):
        if ln.startswith('v '):V+=1
        elif ln.startswith('vt '):a=ln.split();vt.append((float(a[1]),float(a[2])))
        elif ln.startswith('f '):faces.append([tuple(int(x) if x else 0 for x in (p.split('/')+['',''])[:2]) for p in ln.split()[1:]])
    key={};pv=[];uv=[];idx=[]
    def vert(v,t):
        k=(v,t)
        if k not in key:key[k]=len(pv);pv.append(v-1);uv.append(vt[t-1] if t else (0,0))
        return key[k]
    for f in faces:
        q=[vert(v,t) for v,t in f]
        for i in range(1,len(q)-1):idx+= [q[0],q[i],q[i+1]]
    return V,pv,uv,idx

def tex(src,dst,size,alpha=False,grey=False,q=82):
    im=Image.open(src);im.thumbnail((size,size),Image.LANCZOS)
    if alpha or im.mode in('RGBA','LA'):
        im=im.convert('RGBA')
        if grey:
            a=np.asarray(im).astype(np.float32);l=(a[...,0]*.3+a[...,1]*.59+a[...,2]*.11);m=l[a[...,3]>40]
            s=(200.0/max(1.0,float(np.percentile(m,70)))) if m.size else 1.0
            l=np.clip(l*s,0,255);a[...,0]=a[...,1]=a[...,2]=l;im=Image.fromarray(a.astype(np.uint8),'RGBA')
        im.save(dst+'.webp','WEBP',quality=q,method=4);return dst+'.webp'
    im=im.convert('RGB');im.save(dst+'.jpg','JPEG',quality=q,optimize=True);return dst+'.jpg'

def pack_proxy(kind,root,name,mhclo,size,grey=False,alpha=False):
    d=os.path.join(root,name);mc=os.path.join(d,mhclo)
    sc,ia,ib,ic,w,off,rng=parse_mhclo(mc)
    obj=[f for f in os.listdir(d) if f.endswith('.obj')][0]
    V,pv,uv,idx=parse_obj(os.path.join(d,obj))
    if V!=len(ia):print('  warn vertex count',name,V,len(ia))
    mat=open(os.path.join(d,[f for f in os.listdir(d) if f.endswith('.mhmat')][0]),errors='ignore').read()
    g=lambda k:(re.search(r'^'+k+r'\s+(\S+)',mat,re.M) or [None,None])[1]
    transparent=(g('transparent') or '').lower()=='true';cull=(g('backfaceCull') or '').lower()!='false'
    dtex=g('diffuseTexture');tp=None
    if dtex and os.path.exists(os.path.join(d,dtex)):tp=os.path.basename(tex(os.path.join(d,dtex),os.path.join(OUT,name+'_d'),size,alpha=transparent or alpha,grey=grey))
    parts=[];off_=0
    def put(arr):
        nonlocal off_;b=arr.tobytes();o=off_;parts.append(b);off_+=len(b);pad=(4-off_%4)%4
        if pad:parts.append(b'\0'*pad);off_+=pad
        return o
    big=len(pv)>65535
    man={'name':name,'kind':kind,'sc':sc,'nv':len(ia),'n':len(pv),'tris':len(idx),'big':big,'tex':tp,'transparent':transparent,'cull':cull,'del':rng}
    man['ia']=put(np.array(ia,np.uint16));man['ib']=put(np.array(ib,np.uint16));man['ic']=put(np.array(ic,np.uint16))
    man['w']=put(np.array(w,np.float32));man['off']=put(np.array(off,np.float32))
    man['pv']=put(np.array(pv,np.uint16));man['uv']=put(np.array(uv,np.float32).reshape(-1));man['idx']=put(np.array(idx,np.uint32 if big else np.uint16))
    th=[f for f in os.listdir(d) if f.endswith('.thumb')]
    if th:
        try:
            im=Image.open(os.path.join(d,th[0])).convert('RGBA');im.thumbnail((112,112),Image.LANCZOS);im.save(os.path.join(OUT,name+'_t.webp'),'WEBP',quality=72)
        except Exception as ex:print('  no thumb',name,ex)
    open(os.path.join(OUT,name+'.bin'),'wb').write(b''.join(parts));json.dump(man,open(os.path.join(OUT,name+'.json'),'w'),separators=(',',':'))
    return {'id':name,'tags':re.findall(r'^tag\s+(.+)$',open(mc,errors='ignore').read(),re.M)}

for root in SRC:
    for kind,folder,size,grey in [('hair','hair',512,True),('clothes','clothes',768,False),('eyebrows','eyebrows',256,True),('eyelashes','eyelashes',256,True)]:
        fp=os.path.join(root,folder)
        if not os.path.isdir(fp):continue
        for name in sorted(os.listdir(fp)):
            d=os.path.join(fp,name)
            mh=[f for f in os.listdir(d) if f.endswith('.mhclo')]
            if not mh:continue
            try:
                e=pack_proxy(kind,fp,name,mh[0],size,grey=grey);e['kind']=kind;lib[kind].append(e);print('packed',kind,name)
            except Exception as ex:print('SKIP',kind,name,ex)
# skins: a diverse set of CC0 textures at 1024 px
SK=['young_caucasian_male','young_caucasian_female','young_african_male','young_african_female','young_asian_male','young_asian_female','middleage_caucasian_male','middleage_caucasian_female','middleage_african_male','middleage_asian_female','old_caucasian_male','old_caucasian_female','old_african_female','toon01']
for root in SRC:
    fp=os.path.join(root,'skins')
    if not os.path.isdir(fp):continue
    for n in SK:
        d=os.path.join(fp,n)
        if not os.path.isdir(d):continue
        png=[f for f in os.listdir(d) if f.endswith('.png')]
        if not png:continue
        th=[f for f in os.listdir(d) if f.endswith('.thumb')]
        if th:
            try:
                im=Image.open(os.path.join(d,th[0])).convert('RGB');im.thumbnail((112,112),Image.LANCZOS);im.save(os.path.join(OUT,'skin_'+n+'_t.webp'),'WEBP',quality=72)
            except Exception:pass
        lib['skins'].append({'id':n,'tex':os.path.basename(tex(os.path.join(d,png[0]),os.path.join(OUT,'skin_'+n),1024,q=84))});print('skin',n)
json.dump(lib,open('assets/human/library.json','w'),separators=(',',':'))
print({k:len(v) for k,v in lib.items()})
