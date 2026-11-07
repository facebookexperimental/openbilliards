# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Read-only measurements of the purchased XingPai snooker reference.

The OBJ intake omitted face-material assignments. Read them from the source
FBX and require every triangulated face index to match the OBJ before using
the assignment. No purchased vertices are exported as game assets.
"""
from pathlib import Path
import collections
import hashlib
import json
import struct
import zlib
import numpy as np

SOURCE = Path('/tmp/ob-3dm-quarantine/star-cgtrader')
OUT = Path.home() / 'ob-artifacts/astra-cn8/measurements'


def read_fbx(path):
    data = path.read_bytes()
    if not data.startswith(b'Kaydara FBX Binary'):
        raise ValueError('Expected binary FBX')
    version = struct.unpack_from('<I', data, 23)[0]
    if version >= 7500:
        raise ValueError('This intake reader expects FBX < 7500')

    def prop(offset):
        kind = chr(data[offset]); offset += 1
        scalar = {'Y': 'h', 'C': '?', 'I': 'i', 'F': 'f', 'D': 'd', 'L': 'q'}
        arrays = {'f': '<f4', 'd': '<f8', 'l': '<i8', 'i': '<i4', 'b': 'u1', 'c': 'u1'}
        if kind in scalar:
            fmt = '<' + scalar[kind]
            return struct.unpack_from(fmt, data, offset)[0], offset + struct.calcsize(fmt)
        if kind in ['S', 'R']:
            n = struct.unpack_from('<I', data, offset)[0]; offset += 4
            value = data[offset:offset+n]
            return (value.decode('utf8', errors='replace') if kind == 'S' else value), offset+n
        if kind in arrays:
            n, encoding, size = struct.unpack_from('<III', data, offset); offset += 12
            raw = data[offset:offset+size]
            if encoding: raw = zlib.decompress(raw)
            value = np.frombuffer(raw, dtype=arrays[kind]).copy()
            if len(value) != n: raise ValueError('FBX array size mismatch')
            return value, offset+size
        raise ValueError(f'Unsupported FBX property {kind}')

    def node(offset):
        end, nprops, propbytes, namelen = struct.unpack_from('<IIIB', data, offset)
        if end == 0: return None, offset+13
        offset += 13
        name = data[offset:offset+namelen].decode(); offset += namelen
        props = []
        for _ in range(nprops):
            v, offset = prop(offset); props.append(v)
        children = []
        while offset < end-13:
            child, offset = node(offset)
            if child is None: break
            children.append(child)
        return {'name': name, 'props': props, 'children': children}, end

    roots = []; offset = 27
    while offset < len(data)-13:
        n, offset = node(offset)
        if n is None: break
        roots.append(n)
    return roots, version


def child(n, name):
    return next((x for x in n['children'] if x['name'] == name), None)


def obj(path):
    v=[]; f=[]
    for line in path.read_text().splitlines():
        if line.startswith('v '): v.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('f '):
            ids=[int(x.split('/')[0])-1 for x in line.split()[1:]]
            f.extend([[ids[0],ids[i],ids[i+1]] for i in range(1,len(ids)-1)])
    return np.asarray(v), np.asarray(f,dtype=np.int32)


def sections(v, f, axis, offset):
    """Exact triangle/plane intersections; physical coordinates are mm."""
    tri=v[f]; d=tri[:,:,axis]-offset
    # TESSELLATION: numerical zero only. Include an edge on the plane;
    # strict sign-crossing loses a whole section at an explicit loft row.
    eps=1e-7
    cross=(d.min(axis=1)<=eps)&(d.max(axis=1)>=-eps)&(np.abs(d).max(axis=1)>eps)
    tri=tri[cross]; d=d[cross]; segments=[]
    for t,ds in zip(tri,d):
        hits=[]
        for a,b in [(0,1),(1,2),(2,0)]:
            if abs(ds[a])<=eps: hits.append(t[a])
            elif ds[a]*ds[b]<0: hits.append(t[a]+(t[b]-t[a])*(-ds[a])/(ds[b]-ds[a]))
        if len(hits)>=2:
            unique=np.unique(np.round(hits,8),axis=0)
            if len(unique)==2:segments.append(unique)
    return np.asarray(segments).reshape(-1,2,3)


def circle(points):
    xy=np.asarray(points)
    A=np.column_stack([2*xy[:,0],2*xy[:,1],np.ones(len(xy))])
    a,b,c=np.linalg.lstsq(A,(xy*xy).sum(axis=1),rcond=None)[0]
    r=np.sqrt(c+a*a+b*b); errors=np.linalg.norm(xy-[a,b],axis=1)-r
    return {'center_mm':[float(a),float(b)],'radius_mm':float(r),'rms_mm':float(np.sqrt(np.mean(errors**2))),'max_residual_mm':float(np.max(np.abs(errors))),'points':len(xy)}


def load_material_meshes():
    roots,version=read_fbx(SOURCE/'src/SNOOKER+TABLE+CGTRADER.fbx')
    objects=next(n for n in roots if n['name']=='Objects')['children']
    connections=next(n for n in roots if n['name']=='Connections')['children']
    objects_by_id={n['props'][0]:n for n in objects}
    linked=collections.defaultdict(list)
    for c in connections:
        if c['props'][0]=='OO':linked[c['props'][2]].append(c['props'][1])
    inventory=json.loads((SOURCE/'obj/inventory.json').read_text())
    frame_parts={'Plane.020','Plane.030','Plane.037','Plane.038','Plane.051',
                 'Plane.052','Plane.053','Snooker bed support 1.001'}
    selected=[m for m in inventory['models'] if m.get('obj') and
              (m['name'].startswith('Plane.') and 54<=int(m['name'].split('.')[1])<=75
               or m['name'].startswith('Snooker table legs') or m['name'] in frame_parts)]
    meshes=[]
    for m in selected:
        model=objects_by_id[m['id']]
        geometries=[objects_by_id[x] for x in linked[m['id']] if objects_by_id[x]['name']=='Geometry']
        if len(geometries)!=1:raise ValueError(f"Expected one geometry: {m['name']}")
        geom=geometries[0]
        verts=child(geom,'Vertices')['props'][0].reshape(-1,3)
        polygons=child(geom,'PolygonVertexIndex')['props'][0]
        lm=child(geom,'LayerElementMaterial')
        mat_ids=child(lm,'Materials')['props'][0] if lm else [0]
        mapping=child(lm,'MappingInformationType')['props'][0] if lm else 'AllSame'
        faces=[]; labels=[]; p=[]; pi=0
        for vi in polygons:
            p.append(int(vi if vi>=0 else -vi-1))
            if vi<0:
                for i in range(1,len(p)-1):
                    faces.append([p[0],p[i],p[i+1]])
                    labels.append(int(mat_ids[pi] if mapping=='ByPolygon' else mat_ids[0]))
                p=[];pi+=1
        v,f=obj(SOURCE/'obj'/m['obj'])
        if len(f)==0:continue
        if len(v)!=len(verts) or not np.array_equal(f,np.asarray(faces)):
            raise ValueError(f"FBX/OBJ topology mismatch: {m['name']}")
        mats=[objects_by_id[x]['props'][1].split('\x00')[0] for x in linked[m['id']] if objects_by_id[x]['name']=='Material']
        # Imported material connection order must agree with the documented intake.
        if mats!=m['materials']:raise ValueError(f"Material connection mismatch: {m['name']}: {mats}")
        labels=np.asarray(labels)
        for i,mat in enumerate(mats):
            sub=f[labels==i]
            if len(sub):meshes.append({'object':m['name'],'material':mat,'v':v,'f':sub,'obj':m['obj']})
    return meshes,version


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    meshes,version=load_material_meshes()
    rows=[]
    for m in meshes:
        used=m['v'][np.unique(m['f'])]
        lo=used.min(axis=0);hi=used.max(axis=0)
        rows.append({'object':m['object'],'material':m['material'],'file':m['obj'],'tag':'MODEL(xingpai-snooker)','triangles':len(m['f']),'used_vertices':len(used),'min_mm':lo.tolist(),'max_mm':hi.tolist(),'size_mm':(hi-lo).tolist()})
    bed=max(r['max_mm'][2] for r in rows if r['object']=='Snooker table bed.002') if any(r['object']=='Snooker table bed.002' for r in rows) else 849.134
    # A direct independent bed datum, from the intake's slate object.
    bv,bf=obj(SOURCE/'obj/Snooker_table_bed.002__402294236.obj')
    bed=float(bv[:,2].max()); center=float((bv[:,0].min()+bv[:,0].max())/2)
    output={'schema':1,'tag':'MODEL(xingpai-snooker)','source_units':'FBX cm; intake OBJ mm, Z-up','fbx_version':version,'topology_and_material_assignment':'FBX fan triangles == intake OBJ faces, every face; connection material names == inventory','bed_z_mm':bed,'long_axis_center_x_mm':center,'model_files':{},'material_components':rows}
    for p in [SOURCE/'src/SNOOKER+TABLE+CGTRADER.fbx',SOURCE/'src/SNOOKER+TABLE+CGTRADER.blend',SOURCE/'obj/inventory.json']:
        output['model_files'][str(p)]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
    for m in meshes:
        if m['object'] in ['Plane.061','Plane.065','Plane.063','Plane.054','Plane.055']:
            print(m['object'],m['material'], next(r['size_mm'] for r in rows if r['object']==m['object'] and r['material']==m['material']))
    (OUT/'xingpai-components.json').write_text(json.dumps(output,indent=2))
    print('Bed',bed,'center',center,'material components',len(rows))


if __name__=='__main__':main()
