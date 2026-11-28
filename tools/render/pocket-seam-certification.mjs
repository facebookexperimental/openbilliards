// Copyright (c) Meta Platforms, Inc. and affiliates.

// Build-time event certificate for the repository's submitted support union.
// This module is absent from the browser graph. It does not share the
// compiler's clipping, cancellation, ancestry or triangulation algorithm.
import assert from 'node:assert/strict';
// Independent exact predicates on binary coordinates; no point epsilon.
const view=new DataView(new ArrayBuffer(8)),intCache=new Map(),S=1n<<1074n;
const I=x=>{if(intCache.has(x))return intCache.get(x);assert(Number.isFinite(x));view.setFloat64(0,x);
 const bits=view.getBigUint64(0),e=Number((bits>>52n)&2047n),m=bits&((1n<<52n)-1n);
 const n=(bits>>63n?-1n:1n)*(e?((1n<<52n)|m)<<BigInt(e-1):m);intCache.set(x,n);return n;};
const sign=x=>x>0n?1:x<0n?-1:0,abs=x=>x<0n?-x:x;
const gcd=(a,b)=>{a=abs(a);b=abs(b);while(b){const c=a%b;a=b;b=c;}return a;};
const R=(n,d=1n)=>{assert(d!==0n);if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};};
const cmp=(a,b)=>sign(a.n*b.d-b.n*a.d),rmin=(a,b)=>cmp(a,b)<0?a:b,rmax=(a,b)=>cmp(a,b)>0?a:b;
const add=(a,b)=>R(a.n*b.d+b.n*a.d,a.d*b.d),sub=(a,b)=>R(a.n*b.d-b.n*a.d,a.d*b.d);
const mul=(a,b)=>R(a.n*b.n,a.d*b.d),div=(a,b)=>R(a.n*b.d,a.d*b.n);
const Z=R(0n),O=R(1n);
const number=r=>{if(!r.n)return 0;const bn=abs(r.n).toString(2).length,bd=r.d.toString(2).length;
 const sn=Math.max(0,bn-53),sd=Math.max(0,bd-53);return Number(r.n>>BigInt(sn))/Number(r.d>>BigInt(sd))*2**(sn-sd);};
const pack=r=>({numerator:r.n.toString(),denominator:r.d.toString(),approx:number(r)});
const ip=p=>[I(p[0]),I(p[1])],rp=p=>ip(p).map(n=>R(n));
const vcross=(a,b)=>a[0]*b[1]-a[1]*b[0],vdot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const vsub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const orient=(a,b,c)=>vcross(vsub(ip(b),ip(a)),vsub(ip(c),ip(a)));
const crossAt=(a,b,p)=>{const d=vsub(b,a);return d[0]*(p[1].n-a[1]*p[1].d)*p[0].d-d[1]*(p[0].n-a[0]*p[0].d)*p[1].d;};
const pkey=p=>p.map(x=>Object.is(x,-0)?0:x).join(','),ekey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
const box=ps=>({lo:[Math.min(...ps.map(p=>p[0])),Math.min(...ps.map(p=>p[1]))],hi:[Math.max(...ps.map(p=>p[0])),Math.max(...ps.map(p=>p[1]))]});
const overlap=(a,b)=>a.lo[0]<=b.hi[0]&&b.lo[0]<=a.hi[0]&&a.lo[1]<=b.hi[1]&&b.lo[1]<=a.hi[1];
const tree=rows=>{if(!rows.length)return null;const bounds={lo:[Infinity,Infinity],hi:[-Infinity,-Infinity]};
 for(const r of rows)for(let j=0;j<2;j++){bounds.lo[j]=Math.min(bounds.lo[j],r.box.lo[j]);bounds.hi[j]=Math.max(bounds.hi[j],r.box.hi[j]);}
 if(rows.length<=12)return {box:bounds,rows};const axis=bounds.hi[0]-bounds.lo[0]>=bounds.hi[1]-bounds.lo[1]?0:1;
 rows.sort((a,b)=>a.box.lo[axis]+a.box.hi[axis]-b.box.lo[axis]-b.box.hi[axis]||a.id-b.id);const mid=rows.length>>1;
 return {box:bounds,children:[tree(rows.slice(0,mid)),tree(rows.slice(mid))]};};
const query=(node,b,out=[])=>{if(!node||!overlap(node.box,b))return out;if(node.children)for(const c of node.children)query(c,b,out);
 else for(const r of node.rows)if(overlap(r.box,b))out.push(r);return out;};
const makePoly=(points,source,id)=>{const ints=points.map(ip);let area=0n;
 for(let i=0;i<ints.length;i++)area+=vcross(ints[i],ints[(i+1)%ints.length]);
 return area?{points,ints,winding:sign(area),source,id,box:box(points)}:null;};
const sourceOf=row=>row.source;

// The exact local cone union distinguishes a real outline from a shared
// tessellation edge. It introduces no distance or angle acceptance threshold.
const relation=(point,rows)=>{
 const cones=[],closed=[];
 for(const row of rows){const zeros=[];let outside=false;
  for(let i=0;i<row.ints.length;i++){const a=row.ints[i],b=row.ints[(i+1)%row.ints.length],s=sign(crossAt(a,b,point))*row.winding;
   if(s<0){outside=true;break;}if(!s)zeros.push(vsub(b,a));}
  if(outside)continue;closed.push(sourceOf(row));
  if(!zeros.length)return {location:'INTERIOR',strict_witness:sourceOf(row),incident_sources:closed};
  cones.push({zeros,winding:row.winding,source:row.source});
 }
 if(!cones.length)return {location:'OUTSIDE',incident_sources:[]};
 const rays=[];
 for(const c of cones)for(const e of c.zeros)for(const d of [e,[-e[0],-e[1]]]){
  if(!d[0]&&!d[1])continue;
  if(!rays.some(v=>vcross(v,d)===0n&&vdot(v,d)>0n))rays.push(d);
 }
 const half=d=>d[1]>0n||d[1]===0n&&d[0]>=0n?0:1;
 rays.sort((a,b)=>half(a)-half(b)||-sign(vcross(a,b)));
 const covers=d=>cones.some(c=>c.zeros.every(e=>sign(vcross(e,d))*c.winding>=0));
 const sectors=rays.map((a,i)=>{const b=rays[(i+1)%rays.length];let d;
  if(vcross(a,b)===0n)d=[-a[1],a[0]];
  else {const la=abs(a[0])+abs(a[1]),lb=abs(b[0])+abs(b[1]);d=[a[0]*lb+b[0]*la,a[1]*lb+b[1]*la];}
  return covers(d);});
 if(sectors.every(Boolean))return {location:'INTERIOR',strict_witness:null,incident_sources:closed,cone_union_covers_full_circle:true};
 const outline=rays.filter((_,i)=>sectors[i]!==sectors[(i+rays.length-1)%rays.length]);
 return {location:'BOUNDARY',incident_sources:closed,cone_union_covers_full_circle:false,
  outline_kind:outline.length===2&&vcross(outline[0],outline[1])===0n?'STRAIGHT':'TURN_OR_MULTIPLE_SECTORS',
  outline_rays:outline.map(d=>d.map(n=>pack(R(n,S)))),sector_coverage:sectors};
};
const dv32=new DataView(new ArrayBuffer(4));
const f32Cell=x=>{assert.equal(Math.fround(x),x);dv32.setFloat32(0,x);const bits=dv32.getUint32(0);
 const read=bits=>{dv32.setUint32(0,bits);return dv32.getFloat32(0);};
 const prev=x===0?-(2**-149):read(x>0?bits-1:bits+1),next=x===0?2**-149:read(x>0?bits+1:bits-1);
 return [(prev+x)/2,(next+x)/2];};
const cellFor=p=>{const a=f32Cell(p[0]),b=f32Cell(p[1]);return {lo:[a[0],b[0]],hi:[a[1],b[1]]};};
const inCell=(p,cell)=>p.every((q,i)=>cmp(q,R(I(cell.lo[i])))>=0&&cmp(q,R(I(cell.hi[i])))<=0);
const roundsTo=(pointR,point)=>{
 const cell=cellFor(point);if(!inCell(pointR,cell))return false;
 return pointR.every((q,i)=>{
  const tied=cmp(q,R(I(cell.lo[i])))===0||cmp(q,R(I(cell.hi[i])))===0;
  dv32.setFloat32(0,point[i]);return !tied||(dv32.getUint32(0)&1)===0;
 });
};
const lineCell=(a,b,cell)=>{const ai=ip(a),bi=ip(b);let lo=Z,hi=O;
 for(let i=0;i<2;i++){const d=bi[i]-ai[i],low=I(cell.lo[i])-ai[i],high=I(cell.hi[i])-ai[i];
  if(!d){if(low>0n||high<0n)return null;continue;}
  const x=R(low,d),y=R(high,d);lo=rmax(lo,rmin(x,y));hi=rmin(hi,rmax(x,y));if(cmp(lo,hi)>0)return null;}
 return {lo,hi};};
const linePoint=(a,b,t)=>{const ai=ip(a),bi=ip(b);return ai.map((x,i)=>add(R(x),mul(t,R(bi[i]-x))));};
const crossing=(a,b,c,d)=>{const ai=ip(a),bi=ip(b),ci=ip(c),di=ip(d),u=vsub(bi,ai),v=vsub(di,ci),den=vcross(u,v);
 if(!den)return null;const t=R(vcross(vsub(ci,ai),v),den),s=R(vcross(vsub(ci,ai),u),den);
 if(cmp(t,Z)<0||cmp(t,O)>0||cmp(s,Z)<0||cmp(s,O)>0)return null;
 return {point:linePoint(a,b,t),t,s};};
const encodePoint=p=>p.map(q=>pack(R(q.n,q.d*S)));
const nearestOn=(p,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],l2=dx*dx+dz*dz,t=l2?((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l2:0;
 const at=Math.max(0,Math.min(1,t)),q=[a[0]+at*dx,a[1]+at*dz];return {parameter:t,clamped_parameter:at,point_m:q,distance_mm:Math.hypot(p[0]-q[0],p[1]-q[1])*1000};};

// Independent rounding-cell selection, deliberately separate from the
// renderer's homogeneous integer implementation.
const roundScaled=q=>{
 const first=Math.fround(number(R(q.n,q.d*S)));
 const accepted=v=>{const cell=f32Cell(v),lo=cmp(q,R(I(cell[0]))),hi=cmp(q,R(I(cell[1])));
  dv32.setFloat32(0,v);return lo>=0&&hi<=0&&(lo!==0&&hi!==0||(dv32.getUint32(0)&1)===0);};
 if(accepted(first))return first;
 dv32.setFloat32(0,first);const bits=dv32.getUint32(0);
 const adjacent=first===0?[-(2**-149),2**-149]:[bits-1,bits+1].map(b=>{dv32.setUint32(0,b);return dv32.getFloat32(0);});
 const match=adjacent.find(accepted);assert(match!==undefined,'Exact projected coordinate must have a Float32 rounding cell');return match;
};


export function createPocketSeamCertifier({G, group, bed, originalPoints, originalIndex, eligibleParents, apertureEdges}) {
  group.updateWorldMatrix(true, true);
  const bedInverse = bed.matrixWorld.clone().invert(), covers = [], bindings = [];
  let nextId = 0;
  const meshes = new Map();
  group.traverse(mesh => {
    if (!mesh.isMesh || !/^dm-(?:railtop-[0-5]|cornerblock-[0-3]|bootcollar-[cs][0-5])$/.test(mesh.name)) return;
    if (meshes.has(mesh.name)) throw new Error('POCKET_SEAM_DUPLICATE_SUPPORT: ' + mesh.name);
    meshes.set(mesh.name, mesh);
  });
  assert.equal(meshes.size, 16, 'Complete submitted wood and collar set');
  for (const mesh of meshes.values()) {
    for (let object = mesh; object; object = object.parent) {
      if (!object.visible) throw new Error('POCKET_SEAM_HIDDEN_SUPPORT: ' + mesh.name);
      if (object === group) break;
    }
    const geometry = mesh.geometry, positions = geometry.getAttribute('position');
    const matrix = bedInverse.clone().multiply(mesh.matrixWorld).elements;
    const chart = Array.from({length: positions.count}, (_, i) => {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const w = 1 / (matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15]);
      return [Math.fround((matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) * w),
        Math.fround((matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) * w),
        Math.fround((matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) * w)];
    });
    const index = geometry.index, count = index?.count ?? positions.count;
    const start = Math.max(0, geometry.drawRange.start), end = Math.min(count, start + geometry.drawRange.count);
    const ranges = Array.isArray(mesh.material) ? geometry.groups.map(row => ({start: Math.max(start, row.start),
      end: Math.min(end, row.start + row.count), material: mesh.material[row.materialIndex]}))
      : [{start, end, material: mesh.material}];
    const cuts = new Map(), seen = new Set(); let submittedTriangles = 0;
    for (const range of ranges) {
      if (!range.material || range.material.visible === false || range.material.transparent && range.material.opacity === 0) continue;
      for (let t = range.start; t + 2 < range.end; t += 3) {
        const ids = [0, 1, 2].map(j => index ? index.getX(t + j) : t + j);
        const triangle = ids.map(i => chart[i]), points = [];
        for (let j = 0; j < 3; j++) {
          const a = triangle[j], b = triangle[(j + 1) % 3];
          if (a[1] >= 0) points.push([a[0], a[2]]);
          if (a[1] * b[1] < 0) {
            const key = ekey(ids[j], ids[(j + 1) % 3]);
            if (!cuts.has(key)) {
              const t = R(-I(a[1]), I(b[1]) - I(a[1]));
              const exact = [0, 2].map(axis => add(R(I(a[axis])), mul(t, R(I(b[axis]) - I(a[axis])))));
              cuts.set(key, exact.map(roundScaled));
            }
            points.push(cuts.get(key));
          }
        }
        submittedTriangles++;
        if (points.length < 3) continue;
        const polygon = makePoly(points, {mesh: mesh.name, triangle: t / 3, vertex_ids: ids}, nextId++);
        if (!polygon) continue;
        const key = points.map(pkey).sort().join('|'); if (seen.has(key)) continue; seen.add(key);
        covers.push(polygon);
      }
    }
    bindings.push({mesh: mesh.name,vertices: positions.count,indices: count,submitted_triangles: submittedTriangles,
      projection_polygons: seen.size});
  }
  const core = [[-G.L/2-G.CW,-G.W/2-G.CW],[G.L/2+G.CW,-G.W/2-G.CW],
    [G.L/2+G.CW,G.W/2+G.CW],[-G.L/2-G.CW,G.W/2+G.CW]].map(p => p.map(Math.fround));
  const corePoly = makePoly(core,{mesh:'core',polygon:0},nextId++), supportTree = tree(covers.slice());
  const cache = new Map(), witnesses = [], failures = [];
  const oldEdges = new Map();
  for (let parent = 0; parent < originalIndex.length / 3; parent++) for (let j = 0; j < 3; j++) {
    const a = originalIndex[3 * parent + j], b = originalIndex[3 * parent + (j + 1) % 3], key = ekey(a, b);
    if (!oldEdges.has(key)) oldEdges.set(key, {a: originalPoints[a], b: originalPoints[b], parents: []});
    oldEdges.get(key).parents.push(parent);
  }
  const containsParent = (point, parent) => {
    const ids = originalIndex.slice(3 * parent, 3 * parent + 3), ps = ids.map(i => originalPoints[i]);
    const winding = sign(orient(...ps));
    return winding !== 0 && ps.every((a, i) => sign(crossAt(ip(a), ip(ps[(i + 1) % 3]), point)) * winding >= 0);
  };
  const reject = row => {
    failures.push(row);
    const error = new Error('POCKET_SEAM_UNCERTIFIED_BOUNDARY_EVENT: ' + JSON.stringify(row));
    error.code = 'POCKET_SEAM_UNCERTIFIED_BOUNDARY_EVENT'; error.seamEvent = row; throw error;
  };
  return {
    // Offline information only. Float64 area attribution never admits an
    // event and is never included in the product apply/load path.
    informationArea(mesh) {
      const cross = (a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      const area = poly => {let sum=0;for(let i=1;i+1<poly.length;i++)sum+=cross(poly[0],poly[i],poly[i+1]);return Math.abs(sum)/2;};
      const partition = (poly, cover) => {
        const clip=cover.winding>0?cover.points:cover.points.slice().reverse(),outside=[];let rest=poly;
        for(let j=0;j<clip.length&&rest.length>=3;j++){
          const a=clip[j],b=clip[(j+1)%clip.length],inside=[],out=[];
          for(let i=0;i<rest.length;i++){
            const p=rest[i],q=rest[(i+1)%rest.length],dp=cross(a,b,p),dq=cross(a,b,q);
            if(dp>=0)inside.push(p);if(dp<=0)out.push(p);
            if(dp*dq<0){const t=dp/(dp-dq),hit=[p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])];inside.push(hit);out.push(hit);}
          }
          if(out.length>=3&&area(out)>0)outside.push(out);rest=inside;
        }
        const hit=rest.length>=3?area(rest):0;return hit>0?{hit,remaining:outside}:{hit:0,remaining:[poly]};
      };
      const sums=new Map(),compensation=new Map();let total=0;
      const addArea=(name,value)=>{const sum=sums.get(name)??0,c=compensation.get(name)??0,y=value-c,next=sum+y;
        compensation.set(name,(next-sum)-y);sums.set(name,next);};
      for(let t=0;t<mesh.index.length/3;t++){
        const poly=Array.from(mesh.index.slice(3*t,3*t+3),i=>[mesh.position[3*i],mesh.position[3*i+2]]);total+=area(poly);
        let remaining=[poly];
        const apply=cover=>{
          const next=[];
          for(const piece of remaining){
            if(!overlap(box(piece),cover.box)){next.push(piece);continue;}
            const split=partition(piece,cover);if(split.hit)addArea(cover.source.mesh,split.hit);next.push(...split.remaining);
          }
          remaining=next;
        };
        apply(corePoly);
        if(remaining.length){
          const candidates=new Map();for(const piece of remaining)for(const cover of query(supportTree,box(piece)))candidates.set(cover.id,cover);
          for(const cover of [...candidates.values()].sort((a,b)=>a.id-b.id)){apply(cover);if(!remaining.length)break;}
        }
        for(const piece of remaining)addArea('uncovered_by_submitted_support',area(piece));
      }
      return {total_m2:total,attributed_m2:Object.fromEntries(sums),balance_residual_m2:[...sums.values()].reduce((a,b)=>a+b,0)-total};
    },
    // Enumerate finite submitted events independently of the compiler's
    // claimed homogeneous point. Only the actual emitted Float32 location
    // selects the exact rounding cell; no ancestry key admits an event.
    auditVertex({point, parents, interpolation_parent}) {
      const cell = cellFor(point), near = [...query(supportTree, cell), corePoly].filter(p => overlap(p.box, cell));
      const allParents = [...new Set([...parents, interpolation_parent])], edges = new Map(), events = [], seen = new Set();
      const event = (kind, exact, sources, extra = {}) => {
        if (!roundsTo(exact, point)) return;
        const key = kind + '|' + exact.map(q => q.n + '/' + q.d).join(',');
        if (seen.has(key)) return; seen.add(key);
        const union = relation(exact, near);
        const permission = allParents.map(parent => ({parent, allowed: eligibleParents.has(parent), in_parent: containsParent(exact, parent)}));
        const certifies = union.location === 'BOUNDARY'
          && (kind === 'UNION_OLD_EDGE_CROSSING' || union.outline_kind === 'TURN_OR_MULTIPLE_SECTORS')
          && permission.every(row => row.allowed && row.in_parent);
        events.push({kind, exact_plan_m: encodePoint(exact), sources, ...extra, union, permission, certifies});
      };
      for (const polygon of near) for (let j = 0; j < polygon.points.length; j++) {
        const a = polygon.points[j], b = polygon.points[(j + 1) % polygon.points.length];
        if (a[0] === point[0] && a[1] === point[1]) event('COVER_VERTEX', rp(a), [sourceOf(polygon)], {polygon_vertex: j});
        const ka = pkey(a), kb = pkey(b), key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
        if (ka === kb || !lineCell(a, b, cell)) continue;
        if (!edges.has(key)) edges.set(key, {a, b, sources: []});
        edges.get(key).sources.push(sourceOf(polygon));
      }
      const finiteEdges = [...edges.values()], originalKeys = new Set();
      for (const parent of allParents) {
        const ids = originalIndex.slice(3 * parent, 3 * parent + 3);
        for (let j = 0; j < 3; j++) originalKeys.add(ekey(ids[j], ids[(j + 1) % 3]));
      }
      for (const key of originalKeys) {
        if (apertureEdges.has(key)) continue;
        const old = oldEdges.get(key);
        if (!old || !lineCell(old.a, old.b, cell)) continue;
        for (const edge of finiteEdges) {
          const hit = crossing(old.a, old.b, edge.a, edge.b);
          if (hit) event('UNION_OLD_EDGE_CROSSING', hit.point, edge.sources,
            {original_edge: key, parameters: [pack(hit.t), pack(hit.s)]});
        }
      }
      if (!events.some(row => row.certifies)) for (let i = 0; i < finiteEdges.length; i++) {
        for (let j = i + 1; j < finiteEdges.length; j++) {
          const a = finiteEdges[i], b = finiteEdges[j], hit = crossing(a.a, a.b, b.a, b.b);
          if (hit) event('COVER_EDGE_CROSSING', hit.point, [...a.sources, ...b.sources], {parameters: [pack(hit.t), pack(hit.s)]});
        }
      }
      return {point, parents: allParents, submitted_union_at_emitted_point: relation(rp(point), near), events,
        status: events.some(row => row.certifies) ? 'EXACT_SUBMITTED_EVENT_AND_ALLOWED_PARENTS' : 'UNRESOLVED_OR_NON_EVENT'};
    },
    verify({point, homogeneous, parent, submitted}) {
      const key = homogeneous.join(':') + '|' + parent;
      if (cache.has(key)) return cache.get(key);
      const exact = [R(homogeneous[0] * S, homogeneous[2]), R(homogeneous[1] * S, homogeneous[2])];
      if (!roundsTo(exact, submitted)) return reject({parent,point,submitted,reason:'ROUNDING_IDENTITY'});
      const cell = cellFor(submitted), nearby = [...query(supportTree,cell),corePoly].filter(row => overlap(row.box,cell));
      const union = relation(exact,nearby), ids = originalIndex.slice(3*parent,3*parent+3), points = ids.map(i => originalPoints[i]);
      const winding = sign(orient(...points));
      const inside = winding !== 0 && points.every((a,i) => sign(crossAt(ip(a),ip(points[(i+1)%3]),exact))*winding >= 0);
      let edge = null;
      if (union.location === 'BOUNDARY') for (let i=0;i<3;i++) {
        const a = points[i], b = points[(i+1)%3], oldKey = ekey(ids[i],ids[(i+1)%3]);
        if (apertureEdges.has(oldKey) || crossAt(ip(a),ip(b),exact) !== 0n) continue;
        const axis = Math.abs(b[0]-a[0]) >= Math.abs(b[1]-a[1]) ? 0 : 1;
        const t = div(sub(exact[axis],R(I(a[axis]))),R(I(b[axis])-I(a[axis])));
        if (cmp(t,Z) <= 0 || cmp(t,O) >= 0) continue;
        // A point along two coincident lines is a subdivision, not a new
        // contour/original-edge crossing. Require transverse finite support.
        const transverse = nearby.some(row => row.points.some((c,j) => {
          const d = row.points[(j+1)%row.points.length];
          if (crossAt(ip(c),ip(d),exact) !== 0n || vcross(vsub(ip(b),ip(a)),vsub(ip(d),ip(c))) === 0n) return false;
          const k = Math.abs(d[0]-c[0]) >= Math.abs(d[1]-c[1]) ? 0 : 1;
          if (d[k] === c[k]) return false;
          const u = div(sub(exact[k],R(I(c[k]))),R(I(d[k])-I(c[k])));
          return cmp(u,Z) >= 0 && cmp(u,O) <= 0;
        }));
        if (transverse) { edge = oldKey; break; }
      }
      if (!eligibleParents.has(parent) || !inside || union.location !== 'BOUNDARY'
        || !(union.outline_kind === 'TURN_OR_MULTIPLE_SECTORS' || edge)) {
        return reject({parent,point,submitted,exact_plan_m:encodePoint(exact),inside_parent:inside,
          eligible:eligibleParents.has(parent),union,original_edge:edge,reason:'NO_FINITE_UNION_EVENT'});
      }
      const result = {kind:edge?'UNION_OLD_EDGE_CROSSING':'FINITE_UNION_CORNER',parent,original_edge:edge,
        exact_plan_m:encodePoint(exact),sources:union.incident_sources};
      cache.set(key,result);witnesses.push(result);return result;
    },
    summary() { return {support_bindings:bindings,projection_polygons:covers.length,
      certified_parent_events:witnesses.length,failures,admitted:false}; },
  };
}
