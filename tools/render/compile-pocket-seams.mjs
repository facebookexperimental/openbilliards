// Copyright (c) Meta Platforms, Inc. and affiliates.

// Offline-only seam compiler. No browser module imports this file.
// Inputs are the repository builders' own submitted geometry. No external
// model, measurements, textures, private saved buffers or product-side area
// report is an input. The independent event certifier is mandatory.
export function compilePocketClothSeams({THREE, G, F, group, openings, pocketAxisFrame, createCertifier}) {
  if (!openings || G.render?.style !== 'diamond') throw new Error('POCKET_SEAM_COMPILER_TABLE');
  if (typeof createCertifier !== 'function') throw new Error('POCKET_SEAM_COMPILER_CERTIFIER_REQUIRED');
  const bed = group.getObjectByName('dm-bed-cloth');
  const crosses = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  // A clipping point is an intersection of submitted lines, not a fresh
  // rounded line on the next clipping pass. Keep its homogeneous value
  // until emission; this also preserves an exact zero on a symmetry axis.
  const pointValues = new WeakMap(), exactPoints = new Map(), lineValues = new Map(), edgeValues = new WeakMap();
  const numberBits = new DataView(new ArrayBuffer(8));
  const gcd = (a, b) => {
    a = a < 0n ? -a : a; b = b < 0n ? -b : b;
    while (b) { const next = a % b; a = b; b = next; } return a;
  };
  const reduced = values => {
    let divisor = 0n; for (const value of values) divisor = gcd(divisor, value);
    return divisor > 1n ? values.map(value => value / divisor) : values;
  };
  const rational = value => {
    if (!Number.isFinite(value)) throw new Error('Pocket cloth cover has a non-finite coordinate');
    if (value === 0) return [0n, 1n];
    numberBits.setFloat64(0, value, false); const bits = numberBits.getBigUint64(0, false);
    const exponent = Number((bits >> 52n) & 2047n), fraction = bits & ((1n << 52n) - 1n);
    let numerator = exponent ? fraction | (1n << 52n) : fraction;
    if (bits >> 63n) numerator = -numerator;
    const power = exponent ? exponent - 1075 : -1074;
    return power >= 0 ? [numerator << BigInt(power), 1n] : reduced([numerator, 1n << BigInt(-power)]);
  };
  const normalizedPoint = h => {
    h = reduced(h); if (h[2] < 0n) h = h.map(value => -value);
    if (h[2] === 0n) throw new Error('Pocket cloth intersection is at infinity'); return h;
  };
  const pointValue = p => {
    if (!pointValues.has(p)) {
      const x = rational(p[0]), z = rational(p[1]), h = normalizedPoint([x[0] * z[1], z[0] * x[1], x[1] * z[1]]);
      pointValues.set(p, {h, key: h.join(':'), lines: new Set()});
    }
    return pointValues.get(p);
  };
  const exactPoint = value => {
    const h = normalizedPoint(value), key = h.join(':');
    if (exactPoints.has(key)) return exactPoints.get(key);
    const p = [Number(h[0]) / Number(h[2]), Number(h[1]) / Number(h[2])];
    if (!p.every(Number.isFinite)) throw new Error('POCKET_SEAM_NONFINITE_APPROXIMATE_POINT');
    pointValues.set(p, {h, key, lines: new Set()}); exactPoints.set(key, p); return p;
  };
  const roundedRatio = (signed, denominator) => {
    if (signed === 0n) return 0;
    const sign = signed < 0n ? -1 : 1, numerator = signed < 0n ? -signed : signed;
    let exponent = numerator.toString(2).length - denominator.toString(2).length;
    if (exponent >= 0 ? numerator < (denominator << BigInt(exponent)) : (numerator << BigInt(-exponent)) < denominator) exponent--;
    const power = Math.max(-149, exponent - 23);
    const n = power < 0 ? numerator << BigInt(-power) : numerator, d = power > 0 ? denominator << BigInt(power) : denominator;
    let mantissa = n / d; const remainder = n % d;
    if (2n * remainder > d || (2n * remainder === d && (mantissa & 1n))) mantissa++;
    return sign * Number(mantissa) * 2 ** power;
  };
  const submittedPoint = p => {
    const value = pointValue(p);
    return value.rounded ??= [roundedRatio(value.h[0], value.h[2]), roundedRatio(value.h[1], value.h[2])];
  };
  // Most signs resolve on the submitted doubles. Construct and reduce a
  // homogeneous line only when an intersection or an ambiguous sign needs it.
  const line = (a, b) => {
    let cache = edgeValues.get(a); if (!cache) { cache = new WeakMap(); edgeValues.set(a, cache); }
    if (!cache.has(b)) {
      const same = a === b || (a[0] === b[0] && a[1] === b[1] && pointValue(a).key === pointValue(b).key);
      cache.set(b, same ? null : {a, b, value: null, direction: 0});
    }
    return cache.get(b);
  };
  const exactLine = edge => {
    if (!edge || edge.value) return edge;
    const ah = pointValue(edge.a).h, bh = pointValue(edge.b).h;
    let h = reduced([ah[1] * bh[2] - ah[2] * bh[1], ah[2] * bh[0] - ah[0] * bh[2], ah[0] * bh[1] - ah[1] * bh[0]]);
    const first = h.find(value => value !== 0n);
    if (first === undefined) { edge.degenerate = true; edge.value = {h: [0n, 0n, 0n], key: 'zero'}; return edge; }
    edge.direction = first < 0n ? -1 : 1; if (edge.direction < 0) h = h.map(value => -value);
    const key = h.join(':'); if (!lineValues.has(key)) lineValues.set(key, {h, key});
    edge.value = lineValues.get(key);
    pointValue(edge.a).lines.add(key); pointValue(edge.b).lines.add(key); return edge;
  };
  const side = (edge, p) => {
    if (!edge) return 0;
    if (edge.value && pointValues.get(p)?.lines.has(edge.value.key)) return 0;
    const {a, b} = edge, determinant = crosses(a, b, p);
    // Error bound only, never a distance tolerance. The ambiguous branch
    // uses the same homogeneous coordinates and determinant as the compiler.
    const error = 16 * Number.EPSILON * (Math.abs(a[0]) + Math.abs(b[0]) + Math.abs(p[0]))
      * (Math.abs(a[1]) + Math.abs(b[1]) + Math.abs(p[1]));
    if (Math.abs(determinant) > error) return Math.sign(determinant);
    exactLine(edge);
    if (edge.degenerate) return 0;
    if (pointValue(p).lines.has(edge.value.key)) return 0;
    const h = pointValue(p).h, l = edge.value.h, value = l[0] * h[0] + l[1] * h[1] + l[2] * h[2];
    return (value < 0n ? -1 : value > 0n ? 1 : 0) * edge.direction;
  };
  const lineIntersection = (a, b, c, d) => {
    const first = exactLine(line(a, b)), second = exactLine(line(c, d));
    if (!first || !second || first.degenerate || second.degenerate) throw new Error('POCKET_SEAM_ZERO_INTERSECTION_LINE');
    const l = first.value.h, m = second.value.h;
    const p = exactPoint([l[1] * m[2] - l[2] * m[1], l[2] * m[0] - l[0] * m[2], l[0] * m[1] - l[1] * m[0]]);
    pointValue(p).lines.add(first.value.key); pointValue(p).lines.add(second.value.key); return p;
  };
  const cleanExact = poly => poly.filter((p, i) => pointValue(p).key !== pointValue(poly[(i + poly.length - 1) % poly.length]).key);
  // These references belong only to the bed's boundary construction. The
  // submitted collar buffers retain their original Float32 coordinates.
  const apertureReferences = new WeakMap(), apertureEndpoints = new Map();
  const endpointKey = p => `${p[0]},${p[1]}`;
  const apertureEndpoint = p => {
    const key = endpointKey(p);
    if (!apertureEndpoints.has(key)) {
      apertureEndpoints.set(key, p); apertureReferences.set(p, new Map());
    }
    return apertureEndpoints.get(key);
  };
  const aperturePoint = (edge, t) => {
    if (t === 0) return edge.a;
    if (t === 1) return edge.b;
    const a = pointValue(edge.a).h, b = pointValue(edge.b).h, [n, d] = rational(t);
    const p = exactPoint([(d - n) * a[0] * b[2] + n * b[0] * a[2],
      (d - n) * a[1] * b[2] + n * b[1] * a[2], d * a[2] * b[2]]);
    const references = apertureReferences.get(p) ?? new Map(); references.set(edge, t);
    apertureReferences.set(p, references); return p;
  };
  const sharedAperture = (a, b) => {
    const ra = apertureReferences.get(a), rb = apertureReferences.get(b);
    if (ra && rb) for (const [edge, at] of ra) if (rb.has(edge) && rb.get(edge) !== at) return edge;
    return null;
  };
  const boundaryCross = (a, b, p) => {
    const edge = sharedAperture(a, b);
    return (edge && apertureReferences.get(p)?.has(edge)) || side(line(a, b), p) === 0 ? 0 : crosses(a, b, p);
  };
  const boundaryArea = poly => {
    let sum = 0;
    for (let i = 1; i + 1 < poly.length; i++) sum += boundaryCross(poly[0], poly[i], poly[i + 1]);
    return sum / 2;
  };
  const boundaryHit = (p, q, a, b) => {
    const hit = lineIntersection(p, q, a, b), references = apertureReferences.get(hit) ?? new Map();
    for (const edge of [sharedAperture(p, q), sharedAperture(a, b)]) {
      if (!edge) continue;
      const dx = edge.b[0] - edge.a[0], dz = edge.b[1] - edge.a[1];
      references.set(edge, Math.abs(dx) >= Math.abs(dz) ? (hit[0] - edge.a[0]) / dx : (hit[1] - edge.a[1]) / dz);
    }
    if (references.size) apertureReferences.set(hit, references); return hit;
  };
  const area = poly => {
    let sum = 0;
    for (let i = 1; i + 1 < poly.length; i++) sum += crosses(poly[0], poly[i], poly[i + 1]);
    return sum / 2;
  };
  const signedArea = poly => {
    if (poly.length < 3) return 0;
    let value = 0, magnitude = 0;
    const a = poly[0];
    for (let i = 1; i + 1 < poly.length; i++) {
      const b = poly[i], c = poly[i + 1];
      value += crosses(a, b, c);
      magnitude += (Math.abs(a[0]) + Math.abs(b[0]) + Math.abs(c[0]))
        * (Math.abs(a[1]) + Math.abs(b[1]) + Math.abs(c[1]));
    }
    if (poly.length * Number.EPSILON < .25
      && Math.abs(value) > (32 + 2 * poly.length) * Number.EPSILON * magnitude) return Math.sign(value);
    const ah = pointValue(a).h; let numerator = 0n, denominator = 1n;
    for (let i = 1; i + 1 < poly.length; i++) {
      const b = pointValue(poly[i]).h, c = pointValue(poly[i + 1]).h;
      const n = ah[0] * (b[1] * c[2] - b[2] * c[1]) - ah[1] * (b[0] * c[2] - b[2] * c[0])
        + ah[2] * (b[0] * c[1] - b[1] * c[0]);
      const d = ah[2] * b[2] * c[2];
      [numerator, denominator] = reduced([numerator * d + n * denominator, denominator * d]);
    }
    return numerator < 0n ? -1 : numerator > 0n ? 1 : 0;
  };
  const clean = poly => poly.filter((p, i) => {
    const q = poly[(i + poly.length - 1) % poly.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-10;
  });
  const ccw = poly => signedArea(poly) < 0 ? poly.slice().reverse() : poly;
  const bounds = poly => [Math.min(...poly.map(p => p[0])), Math.min(...poly.map(p => p[1])),
    Math.max(...poly.map(p => p[0])), Math.max(...poly.map(p => p[1]))];
  const overlaps = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
  const splitLine = (poly, a, b, constrained = false) => {
    const inside = [], outside = [], edge = line(a, b);
    if (!edge) return {inside: poly, outside: []};
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const dp = side(edge, p), dq = side(edge, q);
      if (dp >= 0) inside.push(p);
      if (dp <= 0) outside.push(p);
      if (dp * dq < 0) {
        const hit = constrained ? boundaryHit(p, q, a, b) : lineIntersection(p, q, a, b);
        inside.push(hit); outside.push(hit);
      }
    }
    return {inside: cleanExact(inside), outside: cleanExact(outside)};
  };
  const intersection = (poly, clip, constrained = false) => {
    let out = poly;
    for (let i = 0; i < clip.length && out.length >= 3; i++) out = splitLine(out, clip[i], clip[(i + 1) % clip.length], constrained).inside;
    return out.length >= 3 && signedArea(out) !== 0 ? out : [];
  };
  const subtract = (poly, clip, constrained = false, knownIntersection = false) => {
    if (!knownIntersection && !intersection(poly, clip, constrained).length) return [poly];
    let rest = poly; const pieces = [];
    for (let i = 0; i < clip.length && rest.length >= 3; i++) {
      const split = splitLine(rest, clip[i], clip[(i + 1) % clip.length], constrained);
      if (split.outside.length >= 3 && signedArea(split.outside) !== 0) pieces.push(split.outside);
      rest = split.inside;
    }
    return pieces;
  };
  const core = [[-G.L / 2 - G.CW, -G.W / 2 - G.CW],
    [G.L / 2 + G.CW, -G.W / 2 - G.CW], [G.L / 2 + G.CW, G.W / 2 + G.CW],
    [-G.L / 2 - G.CW, G.W / 2 + G.CW]].map(p => p.map(Math.fround));
  const covers = [{points: core, box: bounds(core), support: 'core'}];
  // Work in the bed's submitted chart. The crown can extend beyond a
  // design-plan edge, so only the final drawn triangles define its cover.
  group.updateWorldMatrix(true, true);
  const toBed = new THREE.Matrix4().copy(bed.matrixWorld).invert();
  const projectedCover = (mesh, boundaryStations = null) => {
    if (!mesh?.geometry?.attributes.position) throw new Error('Pocket cloth seam requires final submitted support geometry');
    for (let o = mesh; o; o = o.parent) {
      if (!o.visible) return [];
      if (o === group) break;
    }
    const geometry = mesh.geometry, position = geometry.attributes.position;
    const transform = new THREE.Matrix4().multiplyMatrices(toBed, mesh.matrixWorld);
    const vertex = new THREE.Vector3(), chart = Array.from({length: position.count}, (_, i) => {
      vertex.fromBufferAttribute(position, i).applyMatrix4(transform);
      return [Math.fround(vertex.x), Math.fround(vertex.y), Math.fround(vertex.z)];
    });
    const planar = chart.map(p => [p[0], p[2]]), planeCuts = new Map();
    const atBed = (a, b) => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (planeCuts.has(key)) return planeCuts.get(key);
      const p = chart[a], q = chart[b], py = rational(p[1]), qy = rational(q[1]);
      const pn = py[0] * qy[1], qn = qy[0] * py[1], denominator = qn - pn;
      const coordinate = axis => {
        const first = rational(p[axis]), second = rational(q[axis]);
        let n = qn * first[0] * second[1] - pn * second[0] * first[1], d = denominator * first[1] * second[1];
        if (d < 0n) { n = -n; d = -d; } return roundedRatio(n, d);
      };
      const hit = [coordinate(0), coordinate(2)]; planeCuts.set(key, hit); return hit;
    };
    const count = geometry.index?.count ?? position.count;
    const drawStart = Math.max(0, geometry.drawRange.start), drawEnd = Math.min(count, geometry.drawRange.start + geometry.drawRange.count);
    const ranges = Array.isArray(mesh.material) ? geometry.groups.map(g => ({
      start: Math.max(drawStart, g.start), end: Math.min(drawEnd, g.start + g.count), material: mesh.material[g.materialIndex]
    })) : [{start: drawStart, end: drawEnd, material: mesh.material}];
    const result = [], seen = new Set();
    for (const range of ranges) {
      if (!range.material || range.material.visible === false || (range.material.transparent && range.material.opacity === 0)) continue;
      for (let t = range.start; t + 2 < range.end; t += 3) {
        const ids = [0, 1, 2].map(j => geometry.index ? geometry.index.getX(t + j) : t + j);
        const triangle = ids.map(i => chart[i]), above = [], boundary = [];
        for (let j = 0; j < 3; j++) {
          const a = triangle[j], b = triangle[(j + 1) % 3];
          if (a[1] >= 0) {
            const point = planar[ids[j]]; above.push(point);
            boundary.push(boundaryStations?.get(ids[j]) ?? point);
          }
          if (a[1] * b[1] < 0) {
            const point = atBed(ids[j], ids[(j + 1) % 3]); above.push(point); boundary.push(point);
          }
        }
        const points = ccw(cleanExact(above));
        if (points.length < 3 || signedArea(points) === 0) continue;
        const key = points.map(p => p.join(',')).sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key); result.push({points, box: bounds(points), support: mesh.name, triangle: t / 3, boundary: cleanExact(boundary)});
      }
    }
    return result;
  };
  for (const [prefix, count] of [['dm-railtop-', 6], ['dm-cornerblock-', 4]])
    for (let i = 0; i < count; i++) for (const cover of projectedCover(group.getObjectByName(prefix + i))) covers.push(cover);
  const woodCoverCount = covers.length;
  const boundaryCovers = covers.slice();
  const joins = [];
  for (const [pi, p] of G.pockets.entries()) {
    const name = `${p.corner ? 'c' : 's'}${pi}`, collar = group.getObjectByName(`dm-bootcollar-${name}`);
    const source = collar?.geometry, section = source?.userData.pocketBedSection;
    if (!section) throw new Error('Pocket cloth seam requires the final emitted collar section');
    const frame = pocketAxisFrame(G, p), opening = openings[p.corner ? 'corner' : 'side'];
    const world = ([u, w]) => [Math.fround(frame.nx + u * frame.ux - w * frame.uz),
      Math.fround(frame.nz + u * frame.uz + w * frame.ux)];
    const key = ([x, z]) => `${Math.fround(x)},${Math.fround(z)}`;
    const aperture = opening.contour.map(world).map(apertureEndpoint);
    const apertureEdges = aperture.map((a, i) => {
      const b = aperture[(i + 1) % aperture.length], edge = {pocket: name, index: i, a, b};
      apertureReferences.get(a).set(edge, 0); apertureReferences.get(b).set(edge, 1); return edge;
    });
    const apertureStation = point => {
      let best = null;
      for (const edge of apertureEdges) {
        const dx = edge.b[0] - edge.a[0], dz = edge.b[1] - edge.a[1], length2 = dx * dx + dz * dz;
        if (!length2) continue;
        const t = Math.max(0, Math.min(1, ((point[0] - edge.a[0]) * dx + (point[1] - edge.a[1]) * dz) / length2));
        const x = edge.a[0] + t * dx, z = edge.a[1] + t * dz, distance2 = (point[0] - x) ** 2 + (point[1] - z) ** 2;
        if (!best || distance2 < best.distance2) best = {edge, t, distance2};
      }
      if (!best) throw new Error('Pocket collar bed station has no original aperture edge');
      return aperturePoint(best.edge, best.t);
    };
    // Keep the original aperture's complete front arc. Clip its remaining
    // U boundary at the actual glue plane: this is where the collar begins.
    const path = [...opening.contour.slice(64), opening.contour[0]], target = [];
    const signed = q => q[0] - opening.ring.cutU(Math.abs(q[1]), 0);
    for (let i=0;i+1<path.length;i++) {
      const a=path[i],b=path[i+1],da=signed(a),db=signed(b);
      if(da>=0) target.push(a);
      if(da*db<0) {const f=da/(da-db);target.push([a[0]+f*(b[0]-a[0]),a[1]+f*(b[1]-a[1])]);}
    }
    if(signed(path[path.length-1])>=0)target.push(path[path.length-1]);
    const targetWorld=clean(target.map(world)), lengths=[0];
    if(targetWorld.length<3)throw new Error('Pocket collar has no complete bed-height U');
    for(let i=1;i<targetWorld.length;i++)lengths.push(lengths[i-1]+Math.hypot(targetWorld[i][0]-targetWorld[i-1][0],targetWorld[i][1]-targetWorld[i-1][1]));
    const ap=source.attributes.position,au=source.attributes.uv,an=source.attributes.normal;
    const positions=Array.from(ap.array),uvs=Array.from(au.array),normals=Array.from(an.array),oldIndex=Array.from(source.index.array);
    const xy=i=>[ap.getX(i),ap.getZ(i)];
    const stations=[];
    for(const id of section.inner)if(!stations.length||key(xy(id))!==key(xy(stations[stations.length-1].id)))stations.push({id});
    const project = point => {
      let best=null;
      for(let i=1;i<targetWorld.length;i++) {
        const a=targetWorld[i-1],b=targetWorld[i],dx=b[0]-a[0],dz=b[1]-a[1],l2=dx*dx+dz*dz;
        const f=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dz)/l2));
        const q=[a[0]+f*dx,a[1]+f*dz],distance=Math.hypot(point[0]-q[0],point[1]-q[1]);
        if(!best||distance<best.distance)best={point:q,distance,at:lengths[i-1]+f*Math.sqrt(l2)};
      }
      return best;
    };
    const movedByKey=new Map(),edgeStations=new Map();
    for(let i=0;i<stations.length;i++) {
      const row=stations[i],hit=i===0?{point:targetWorld[0],at:0}:i===stations.length-1
        ?{point:targetWorld[targetWorld.length-1],at:lengths[lengths.length-1]}:project(xy(row.id));
      if(i&&hit.at<stations[i-1].at-1e-8)throw new Error('Pocket bed-height collar stations reverse');
      Object.assign(row,hit);movedByKey.set(key(xy(row.id)),hit.point);
      if(i){
        const previous=stations[i-1],ka=key(xy(previous.id)),kb=key(xy(row.id));
        const inner=targetWorld.flatMap((point,j)=>lengths[j]>previous.at+1e-10&&lengths[j]<row.at-1e-10
          ?[{point,fraction:(lengths[j]-previous.at)/(row.at-previous.at)}]:[]);
        edgeStations.set(ka+'|'+kb,inner);edgeStations.set(kb+'|'+ka,inner.slice().reverse().map(r=>({...r,fraction:1-r.fraction})));
      }
    }
    const changed=new Set(), boundaryStations=new Map();
    for(let i=0;i<ap.count;i++) {
      if(Math.abs(ap.getY(i))>1e-10)continue;
      const point=movedByKey.get(key(xy(i)));if(!point)continue;
      positions[3*i]=Math.fround(point[0]);positions[3*i+2]=Math.fround(point[1]);
      boundaryStations.set(i,apertureStation(point));
      if(positions[3*i]!==ap.getX(i)||positions[3*i+2]!==ap.getZ(i))changed.add(i);
    }
    const indices=[],parents=[],added=[],edgeVertices=new Map();
    const insert=(a,b,row,parent)=>{
      const lo=Math.min(a,b),hi=Math.max(a,b),f=a===lo?row.fraction:1-row.fraction,k=`${lo}:${hi}:${f}`;
      if(edgeVertices.has(k))return edgeVertices.get(k);
      const id=positions.length/3;
      positions.push(Math.fround(row.point[0]),0,Math.fround(row.point[1]));
      boundaryStations.set(id,apertureStation(row.point));
      uvs.push(au.getX(a)+row.fraction*(au.getX(b)-au.getX(a)),au.getY(a)+row.fraction*(au.getY(b)-au.getY(a)));
      normals.push(0,0,0);changed.add(id);edgeVertices.set(k,id);
      added.push({vertex:id,parent,edge:[a,b],fraction:row.fraction,
        before:[ap.getX(a)+row.fraction*(ap.getX(b)-ap.getX(a)),0,ap.getZ(a)+row.fraction*(ap.getZ(b)-ap.getZ(a))]});
      return id;
    };
    for(let t=0;t<oldIndex.length;t+=3){
      const ids=oldIndex.slice(t,t+3),boundary=[];
      for(let j=0;j<3;j++){
        const a=ids[j],b=ids[(j+1)%3];boundary.push(a);
        if(Math.abs(ap.getY(a))>1e-10||Math.abs(ap.getY(b))>1e-10)continue;
        for(const row of edgeStations.get(key(xy(a))+'|'+key(xy(b)))??[])boundary.push(insert(a,b,row,t/3));
      }
      if(boundary.length===3){indices.push(...ids);parents.push(t/3);continue;}
      // Fan from the off-bed vertex, never along the bed chain: the latter
      // would create a horizontal shelf from a formerly vertical wall.
      const first=boundary.findIndex(i=>Math.abs(positions[3*i+1])>1e-10);
      if(first<0)throw new Error('Pocket collar seam cannot add a horizontal bed face');
      const polygon=first>0?[...boundary.slice(first),...boundary.slice(0,first)]:boundary;
      for(let j=1;j+1<polygon.length;j++){indices.push(polygon[0],polygon[j],polygon[j+1]);parents.push(t/3);}
    }
    const affectedNormals=new Set(),acc=new Float64Array(positions.length);
    for(let t=0;t<indices.length;t+=3){
      const ids=indices.slice(t,t+3),[a,b,c]=ids.map(i=>new THREE.Vector3(...positions.slice(3*i,3*i+3)));
      const face=b.clone().sub(a).cross(c.clone().sub(a)),length=face.length();if(length<1e-20)continue;
      if(ids.some(i=>changed.has(i)))for(const i of ids)affectedNormals.add(i);
      for(let j=0;j<3;j++){
        const p=[a,b,c][j],q=[a,b,c][(j+1)%3],r=[a,b,c][(j+2)%3];
        const weight=Math.atan2(length,q.clone().sub(p).dot(r.clone().sub(p)))/length;
        for(let k=0;k<3;k++)acc[3*ids[j]+k]+=face.getComponent(k)*weight;
      }
    }
    for(const i of affectedNormals){const n=Math.hypot(acc[3*i],acc[3*i+1],acc[3*i+2])||1;for(let k=0;k<3;k++)normals[3*i+k]=acc[3*i+k]/n;}
    const joined=new THREE.BufferGeometry();
    joined.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));joined.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    joined.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));joined.setIndex(indices);
    joined.userData={...source.userData,pocketSeam:{originalVertexCount:ap.count,originalTriangles:parents,newVertices:added,bedContour:targetWorld}};
    collar.geometry=joined;source.dispose();
    // Use the submitted surface projection. A convex hull bridges the U
    // and can retain cloth where neither wood nor leather covers it.
    for (const cover of projectedCover(collar, boundaryStations)) {
      covers.push(cover);
      const boundary = cover.boundary, direction = signedArea(boundary);
      if (boundary.length >= 3 && direction !== 0) {
        const points = direction < 0 ? boundary.slice().reverse() : boundary;
        boundaryCovers.push({points, box: bounds(points), support: collar.name, triangle: cover.triangle});
      }
    }
    // Bed and return keep every existing aperture vertex. Their shared
    // chain is now also the collar's emitted bed section.
    joins.push({name,frame,opening,contour:opening.contour.map(world),collar_inner_vertices:section.inner});
    const lip=group.getObjectByName('dm-falllip-'+name);
    lip.geometry.userData.pocketSeam={originalVertexCount:lip.geometry.attributes.position.count,
      parentEdges:opening.contour.map((_,i)=>[2*i,2*i+1]),contour:opening.contour.map(world)};
  }
  const geo = bed.geometry, ap = geo.attributes.position, au = geo.attributes.uv, an = geo.attributes.normal;
  const oldIndex = geo.index ? Array.from(geo.index.array) : Array.from({length: ap.count}, (_, i) => i);
  const positions = Array.from(ap.array), uvs = Array.from(au.array), normals = Array.from(an.array), indices = [], parents = [];
  const pointKey = p => submittedPoint(p).join(',');
  const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const oldPoints = Array.from({length: ap.count}, (_, i) => [ap.getX(i), ap.getZ(i)]);
  const oldVertices = new Map(oldPoints.map((p, i) => [pointKey(p), i])), oldEdges = new Map();
  const originalExactVertices = new Map(oldPoints.map((p, i) => [pointValue(p).key, i]));
  const arithmeticJoin = 1e-10; // Broad-phase padding only. Incidence and collinearity below are exact.
  const stableArea = poly => {
    let sum = 0;
    for (let i = 1; i + 1 < poly.length; i++) sum += boundaryCross(poly[0], poly[i], poly[i + 1]);
    return sum / 2;
  };
  const direction = (a, b) => {
    const ah = pointValue(a).h, bh = pointValue(b).h;
    return [bh[0] * ah[2] - ah[0] * bh[2], bh[1] * ah[2] - ah[1] * bh[2]];
  };
  const absInt = value => value < 0n ? -value : value;
  const compareAlong = (p, q, a, b) => {
    const delta = direction(a, b), axis = absInt(delta[0]) >= absInt(delta[1]) ? 0 : 1;
    const ph = pointValue(p).h, qh = pointValue(q).h, value = ph[axis] * qh[2] - qh[axis] * ph[2];
    return (value < 0n ? -1 : value > 0n ? 1 : 0) * (delta[axis] < 0n ? -1 : 1);
  };
  const along = (p, a, b) => {
    const delta = direction(a, b);
    if ((!delta[0] && !delta[1]) || side(line(a, b), p) !== 0) return null;
    const axis = absInt(delta[0]) >= absInt(delta[1]) ? 0 : 1;
    const ph = pointValue(p).h, ah = pointValue(a).h, bh = pointValue(b).h;
    let n = (ph[axis] * ah[2] - ah[axis] * ph[2]) * bh[2], d = delta[axis] * ph[2];
    if (d < 0n) { n = -n; d = -d; }
    if (n < 0n || n > d) return null;
    // The approximate parameter is information only. All endpoint tests
    // and event ordering below use the homogeneous value itself.
    return Number(n) / Number(d);
  };
  for (let t = 0; t < oldIndex.length / 3; t++) for (let j = 0; j < 3; j++) {
    const a = oldIndex[3 * t + j], b = oldIndex[3 * t + (j + 1) % 3], key = edgeKey(a, b);
    if (!oldEdges.has(key)) oldEdges.set(key, {a, b, parents: [], chain: []});
    oldEdges.get(key).parents.push(t);
  }
  const apertureEdges = new Set();
  for (const join of joins) for (let i = 0; i < join.contour.length; i++) {
    const a = oldVertices.get(pointKey(join.contour[i]));
    const b = oldVertices.get(pointKey(join.contour[(i + 1) % join.contour.length]));
    if (a !== undefined && b !== undefined) apertureEdges.add(edgeKey(a, b));
  }
  // Only parents incident to the existing pocket/outer-notch boundary are
  // eligible. A large triangle crossing the table is not a reason to alter
  // its other vertices, or an unrelated edge of the bed.
  const localBoundary = new Set();
  for (const edge of oldEdges.values()) if (edge.parents.length === 1) for (const id of [edge.a, edge.b]) {
    const point = oldPoints[id];
    if (joins.some(({frame, opening}) => {
      const x = point[0] - frame.nx, z = point[1] - frame.nz;
      const u = x * frame.ux + z * frame.uz, w = -x * frame.uz + z * frame.ux;
      return u >= opening.frontU - .005 && u <= opening.ring.uOut + opening.ring.rOut + .005
        && Math.abs(w) <= opening.ring.rOut + .005;
    })) localBoundary.add(id);
  }
  const eligible = new Set();
  for (let t = 0; t < oldIndex.length / 3; t++)
    if (oldIndex.slice(3 * t, 3 * t + 3).some(i => localBoundary.has(i))) eligible.add(t);

  // Clipping creates an arithmetic arrangement, not render triangles.
  // Retain first-parent interpolation for a shared event, then dissolve
  // every internal cover edge before the single boundary triangulation.
  const interpolation = new Map(), patches = [], restored = [], added = [];
  const remember = (point, parent, ids, original) => {
    const key = pointKey(point);
    if (oldVertices.has(key) || interpolation.has(key)) return;
    const den = crosses(...original);
    const a = crosses(point, original[1], original[2]) / den;
    const b = crosses(original[0], point, original[2]) / den, c = 1 - a - b;
    interpolation.set(key, {point, parent,
      position: [submittedPoint(point)[0], Math.fround(a * ap.getY(ids[0]) + b * ap.getY(ids[1]) + c * ap.getY(ids[2])), submittedPoint(point)[1]],
      uv: [a * au.getX(ids[0]) + b * au.getX(ids[1]) + c * au.getX(ids[2]),
        a * au.getY(ids[0]) + b * au.getY(ids[1]) + c * au.getY(ids[2])],
      normal: [an.getX(ids[0]), an.getY(ids[0]), an.getZ(ids[0])]});
  };
  const boundaryLoops = (original, remaining) => {
    const nodes = [], exactNodes = new Map();
    const node = p => {
      const key = pointValue(p).key;
      if (exactNodes.has(key)) return exactNodes.get(key);
      const i = nodes.length; nodes.push(p); exactNodes.set(key, i); return i;
    };
    const counts = new Map(), addEdge = (a, b, weight = 1) => {
      if (a === b) return;
      const key = edgeKey(a, b), sign = a < b ? 1 : -1;
      counts.set(key, (counts.get(key) || 0) + sign * weight);
    };
    const addRing = (poly, positive) => {
      const ring = (signedArea(poly) > 0) === positive ? poly : poly.slice().reverse();
      const ids = ring.map(node);
      for (let i = 0; i < ids.length; i++) addEdge(ids[i], ids[(i + 1) % ids.length]);
    };
    addRing(original, true);
    for (const poly of remaining) addRing(poly, false);
    // Split T junctions in the arithmetic arrangement, before any Float32
    // rounding. Opposite sub-edges then cancel exactly, including the cover
    // partitions that used to survive as independent triangle fans.
    const coarse = [...counts].filter(([, n]) => n !== 0); counts.clear();
    const byX = nodes.map((_, i) => i).sort((a, b) => nodes[a][0] - nodes[b][0]);
    for (const [key, count] of coarse) {
      const [a, b] = key.split(':').map(Number), pa = nodes[a], pb = nodes[b];
      const minX = Math.min(pa[0], pb[0]) - arithmeticJoin, maxX = Math.max(pa[0], pb[0]) + arithmeticJoin;
      const minZ = Math.min(pa[1], pb[1]) - arithmeticJoin, maxZ = Math.max(pa[1], pb[1]) + arithmeticJoin;
      let lo = 0, hi = byX.length;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (nodes[byX[mid]][0] < minX) lo = mid + 1; else hi = mid; }
      const chain = [{id: a}, {id: b}];
      for (let i = lo; i < byX.length && nodes[byX[i]][0] <= maxX; i++) {
        const id = byX[i], p = nodes[id];
        if (id === a || id === b || p[1] < minZ || p[1] > maxZ) continue;
        if (along(p, pa, pb) !== null) chain.push({id});
      }
      chain.sort((x, y) => compareAlong(nodes[x.id], nodes[y.id], pa, pb));
      for (let i = 1; i < chain.length; i++) addEdge(chain[i - 1].id, chain[i].id, count);
    }
    const edges = [], outgoing = new Map();
    for (const [key, count] of counts) {
      if (!count) continue;
      if (Math.abs(count) !== 1) throw new Error('Pocket bed complement has overlapping boundary multiplicity');
      const pair = key.split(':').map(Number), [a, b] = count > 0 ? pair : pair.reverse();
      const edge = {a, b, used: false}; edges.push(edge);
      if (!outgoing.has(a)) outgoing.set(a, []); outgoing.get(a).push(edge);
    }
    const loops = [];
    for (const first of edges) {
      if (first.used) continue;
      const loop = []; let current = first;
      for (let n = 0; n <= edges.length; n++) {
        if (current.used) throw new Error('Pocket bed complement repeats a directed edge');
        current.used = true; loop.push(nodes[current.a]);
        if (current.b === first.a) break;
        const choices = (outgoing.get(current.b) || []).filter(e => !e.used);
        if (!choices.length) throw new Error('Pocket bed complement has an open boundary');
        const reverse = direction(nodes[current.b], nodes[current.a]);
        const turnVector = e => {
          const v = direction(nodes[e.a], nodes[e.b]);
          return [reverse[0] * v[0] + reverse[1] * v[1], reverse[1] * v[0] - reverse[0] * v[1]];
        };
        const half = v => v[1] > 0n || v[1] === 0n && v[0] >= 0n ? 0 : 1;
        choices.sort((a, b) => {
          const x = turnVector(a), y = turnVector(b), h = half(x) - half(y);
          if (h) return h;
          const cross = x[0] * y[1] - x[1] * y[0];
          return (cross > 0n ? -1 : cross < 0n ? 1 : 0) || a.b - b.b;
        }); current = choices[0];
      }
      // Only arithmetic subdivisions of a straight edge disappear. Keep
      // original points and every actual corner of the coverage contour.
      let changed = true;
      while (changed && loop.length > 2) {
        changed = false;
        for (let i = 0; i < loop.length; i++) {
          const p = loop[i], a = loop[(i + loop.length - 1) % loop.length], b = loop[(i + 1) % loop.length];
          if (!originalExactVertices.has(pointValue(p).key) && along(p, a, b) !== null) {
            loop.splice(i, 1); changed = true; break;
          }
        }
      }
      if (loop.length >= 3 && signedArea(loop) !== 0) loops.push(loop);
    }
    return loops;
  };
  // A bed parent can span most of the table. Subtract the common core
  // first, then query only its remaining pieces against submitted faces.
  // Preserve source order so shared events keep their first-parent rule.
  const coverTree = (rows, first = 1) => {
    const build = entries => {
      if (!entries.length) return null;
      const box = [Infinity, Infinity, -Infinity, -Infinity];
      for (const i of entries) for (let axis = 0; axis < 2; axis++) {
        box[axis] = Math.min(box[axis], rows[i].box[axis]); box[axis + 2] = Math.max(box[axis + 2], rows[i].box[axis + 2]);
      }
      if (entries.length <= 8) return {box, entries};
      const axis = box[2] - box[0] >= box[3] - box[1] ? 0 : 1;
      entries.sort((a, b) => rows[a].box[axis] + rows[a].box[axis + 2] - rows[b].box[axis] - rows[b].box[axis + 2] || a - b);
      const middle = entries.length >>> 1;
      return {box, left: build(entries.slice(0, middle)), right: build(entries.slice(middle))};
    };
    return build(Array.from({length: rows.length - first}, (_, i) => i + first));
  };
  const woodCovers = covers.slice(0, woodCoverCount), woodTree = coverTree(woodCovers);
  const rawCollars = covers.slice(woodCoverCount), constrainedCollars = boundaryCovers.slice(woodCoverCount);
  const rawTree = coverTree(rawCollars, 0), constrainedTree = coverTree(constrainedCollars, 0);
  const clippedSupport = (original, rows, tree, constrained, seed = null) => {
    const kept = []; let remaining = seed ?? [original];
    const apply = cover => {
      const next = [];
      for (const poly of remaining) {
        if (!overlaps(bounds(poly), cover.box)) { next.push(poly); continue; }
        const hit = intersection(poly, cover.points, constrained);
        if (!hit.length) next.push(poly);
        else { kept.push(hit); next.push(...subtract(poly, cover.points, constrained, true)); }
      }
      remaining = next;
    };
    if (!seed) apply(rows[0]);
    if (remaining.length) {
      const candidates = new Set();
      const query = (node, box) => {
        if (!node || !overlaps(node.box, box)) return;
        if (node.entries) { for (const i of node.entries) if (overlaps(rows[i].box, box)) candidates.add(i); }
        else { query(node.left, box); query(node.right, box); }
      };
      for (const poly of remaining) query(tree, bounds(poly));
      for (const i of [...candidates].sort((a, b) => a - b)) { apply(rows[i]); if (!remaining.length) break; }
    }
    return {kept, remaining};
  };
  for (let t = 0; t < oldIndex.length / 3; t++) {
    const ids = oldIndex.slice(3 * t, 3 * t + 3), original = ids.map(i => oldPoints[i]);
    const patch = {parent: t, ids, original, loops: [signedArea(original) > 0 ? original : original.slice().reverse()], whollySupported: true}; patches.push(patch);
    if (!eligible.has(t)) { restored.push(t); continue; }
    // Wood/core inputs are exactly identical for the raw attribute path
    // and the constrained boundary path. Solve that prefix once.
    const boundaryOriginal = original.map(p => apertureEndpoints.get(endpointKey(p)) ?? p);
    const woodPhase = clippedSupport(boundaryOriginal, woodCovers, woodTree, true);
    const rawTail = clippedSupport(null, rawCollars, rawTree, false, woodPhase.remaining);
    const kept = [...woodPhase.kept, ...rawTail.kept];
    // Preserve the first clipped-parent attribute convention. This area
    // comparison selects interpolation ancestry only, never coverage.
    const keptArea = kept.reduce((sum, poly) => sum + Math.abs(area(poly)), 0), originalArea = Math.abs(area(original));
    if (Math.abs(keptArea - originalArea) > Math.max(1e-18, originalArea * 1e-12))
      for (const poly of kept) for (const p of poly) remember(p, t, ids, original);
    // The raw projection above retains the recorded interpolation ancestry.
    // Topology uses the original aperture edge and its unrounded stations,
    // so arithmetic collar subdivisions cannot become a second hole edge.
    const {remaining: boundaryRemaining} = clippedSupport(null, constrainedCollars, constrainedTree, true, woodPhase.remaining);
    if (!boundaryRemaining.length) continue;
    patch.loops = boundaryLoops(boundaryOriginal, boundaryRemaining); patch.whollySupported = false;
  }
  const certification = createCertifier({G, group, bed, originalPoints: oldPoints, originalIndex: oldIndex,
    eligibleParents: eligible, apertureEdges});
  const emitted = new Map(originalExactVertices), vertexRows = new Map(), boundaryPoints = new Map();
  const vertex = (p, parent) => {
    const key = pointValue(p).key, attributeKey = pointKey(p);
    // Attribute ancestry may share a Float32 key. Topology retains the
    // exact boundary event, and never acquires the first clipped point's line.
    const witness = originalExactVertices.has(key) ? null : certification.verify({point: p,
      homogeneous: pointValue(p).h, parent, submitted: submittedPoint(p)});
    if (emitted.has(key)) {
      const id = emitted.get(key), row = vertexRows.get(id);
      if (row && !row.parents.includes(parent)) row.parents.push(parent);
      return id;
    }
    let source = interpolation.get(attributeKey);
    if (!source && oldVertices.has(attributeKey)) {
      // The historical attribute rule copies an original vertex whenever
      // its Float32 key matches. That is attribute ancestry only: distinct
      // exact boundary events still receive distinct topology identities.
      const i = oldVertices.get(attributeKey);
      source = {parent, originalVertex: i, point: oldPoints[i],
        position: [ap.getX(i), ap.getY(i), ap.getZ(i)],
        uv: [au.getX(i), au.getY(i)], normal: [an.getX(i), an.getY(i), an.getZ(i)]};
    }
    if (!source) throw new Error('Pocket bed contour needs an unrecorded clipping intersection');
    const id = positions.length / 3;
    positions.push(...source.position); uvs.push(...source.uv); normals.push(...source.normal);
    const row = {vertex: id, parent: source.parent, parents: [parent], reason: 'true-coverage-contour', oldEdges: [], point: source.position, rawPoint: p, attributeSourcePoint: source.point, attributeOriginalVertex: source.originalVertex, homogeneousPoint: pointValue(p).h.map(String), boundaryWitness: witness};
    boundaryPoints.set(id, p);
    added.push(row); vertexRows.set(id, row); emitted.set(key, id); return id;
  };
  for (const patch of patches) {
    patch.loops = patch.loops.map(loop => loop.map(p => vertex(p, patch.parent)));
    for (const loop of patch.loops) for (const id of loop) {
      if (id < ap.count) continue;
      const point = [positions[3 * id], positions[3 * id + 2]], row = vertexRows.get(id);
      for (let j = 0; j < 3; j++) {
        const a = patch.ids[j], b = patch.ids[(j + 1) % 3], edge = oldEdges.get(edgeKey(a, b));
        // Test the unrounded event on the original edge. Rounding happens
        // once per shared vertex; both parents then submit the same chain.
        const raw = boundaryPoints.get(id), at = along(raw, oldPoints[edge.a], oldPoints[edge.b]);
        if (at === null || compareAlong(raw, oldPoints[edge.a], oldPoints[edge.a], oldPoints[edge.b]) === 0
          || compareAlong(raw, oldPoints[edge.b], oldPoints[edge.a], oldPoints[edge.b]) === 0) continue;
        const key = edgeKey(a, b);
        if (apertureEdges.has(key)) throw new Error('Pocket bed contour would split an unchanged aperture edge');
        if (!edge.chain.some(r => r.id === id)) edge.chain.push({id, t: at});
        if (!row.oldEdges.includes(key)) row.oldEdges.push(key);
        row.reason = 'coverage-contour-original-edge-intersection';
      }
    }
  }
  const p2 = i => [positions[3 * i], positions[3 * i + 2]];
  const unrounded = i => i < ap.count ? oldPoints[i] : boundaryPoints.get(i);
  const inside = (point, loop) => {
    let result = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const a = p2(loop[i]), b = p2(loop[j]);
      if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
    }
    return result;
  };
  const patchRows = [];
  for (const patch of patches) {
    const expanded = patch.loops.map(loop => {
      const result = [];
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length]; result.push(a);
        for (let j = 0; j < 3; j++) {
          const edge = oldEdges.get(edgeKey(patch.ids[j], patch.ids[(j + 1) % 3]));
          const onEdge = id => id === edge.a || id === edge.b || edge.chain.some(r => r.id === id);
          if (!onEdge(a) || !onEdge(b)) continue;
          const pa = unrounded(a), pb = unrounded(b), insert = edge.chain.filter(r => r.id !== a && r.id !== b
            && compareAlong(unrounded(r.id), pa, pa, pb) > 0 && compareAlong(unrounded(r.id), pb, pa, pb) < 0);
          insert.sort((x, y) => compareAlong(unrounded(x.id), unrounded(y.id), pa, pb));
          for (const row of insert) {
            if (!eligible.has(patch.parent)) throw new Error('Pocket bed contour requires a parent outside the seam patch');
            result.push(row.id); const record = vertexRows.get(row.id);
            if (!record.parents.includes(patch.parent)) record.parents.push(patch.parent);
          }
          break;
        }
      }
      return result.filter((id, i) => id !== result[(i + result.length - 1) % result.length]);
    });
    const firstTriangle = indices.length / 3;
    if (expanded.length === 1 && expanded[0].length === 3 && patch.ids.every(i => expanded[0].includes(i))) {
      indices.push(...patch.ids); parents.push(patch.parent);
    } else {
      const positive = [], negative = [];
      for (const loop of expanded) {
        const a = signedArea(loop.map(unrounded));
        if (a > 0) positive.push(loop); else if (a < 0) negative.push(loop);
      }
      for (const outer of positive) {
        const holes = negative.filter(hole => inside(p2(hole[0]), outer));
        const all = [...outer, ...holes.flat()];
        const triangles = THREE.ShapeUtils.triangulateShape(outer.map(i => new THREE.Vector2(...p2(i))),
          holes.map(hole => hole.map(i => new THREE.Vector2(...p2(i)))));
        // Ear clipping may discard a collinear boundary station. Restore
        // that station on its boundary edge so both old parents still use
        // the registered chain; never add an interior subdivision.
        const boundary = [outer, ...holes];
        const chainBetween = (a, b) => {
          for (const loop of boundary) {
            const start = loop.indexOf(a), end = loop.indexOf(b);
            if (start < 0 || end < 0) continue;
            for (const direction of [1, -1]) {
              const chain = [a]; let at = start;
              while (at !== end) {
                at = (at + direction + loop.length) % loop.length;
                const id = loop[at]; chain.push(id);
                if (id !== b && along(unrounded(id), unrounded(a), unrounded(b)) === null) break;
              }
              if (at === end && chain.length > 2) return chain;
            }
          }
          return null;
        };
        const pending = triangles.map(triangle => triangle.map(i => all[i]));
        while (pending.length) {
          const ids = pending.pop(); if (signedArea(ids.map(p2)) === 0) continue;
          let split = false;
          for (let j = 0; j < 3; j++) {
            const a = ids[j], b = ids[(j + 1) % 3], c = ids[(j + 2) % 3];
            const chain = chainBetween(a, b); if (!chain) continue;
            for (let k = 1; k < chain.length; k++) pending.push([c, chain[k - 1], chain[k]]);
            split = true; break;
          }
          if (split || signedArea(ids.map(p2)) === 0) continue;
          if (signedArea(ids.map(p2)) !== signedArea(patch.original)) [ids[1], ids[2]] = [ids[2], ids[1]];
          indices.push(...ids); parents.push(patch.parent);
        }
      }
    }
    patchRows.push({parent: patch.parent, whollySupported: patch.whollySupported,
      firstTriangle, triangles: indices.length / 3 - firstTriangle,
      boundaryLoops: expanded, contourVertices: [...new Set(expanded.flat().filter(i => i >= ap.count))]});
  }
  // Keep the original attribute prefix intact, and emit no unused event.
  const used = new Set(indices), remap = new Map();
  let nextVertex = ap.count;
  for (let i = ap.count; i < positions.length / 3; i++) if (used.has(i)) remap.set(i, nextVertex++);
  const packedPosition = positions.slice(0, ap.count * 3), packedNormal = normals.slice(0, ap.count * 3), packedUV = uvs.slice(0, ap.count * 2);
  for (const id of remap.keys()) {
    packedPosition.push(...positions.slice(3 * id, 3 * id + 3));
    packedNormal.push(...normals.slice(3 * id, 3 * id + 3)); packedUV.push(...uvs.slice(2 * id, 2 * id + 2));
  }
  const mapped = id => id < ap.count ? id : remap.get(id), newVertices = added.filter(r => remap.has(r.vertex));
  for (const row of newVertices) { row.vertex = mapped(row.vertex); row.parents = []; }
  const byVertex = new Map(newVertices.map(row => [row.vertex, row]));
  for (let i = 0; i < indices.length; i++) {
    indices[i] = mapped(indices[i]); const row = byVertex.get(indices[i]), parent = parents[Math.floor(i / 3)];
    if (row && !row.parents.includes(parent)) row.parents.push(parent);
  }
  for (const row of patchRows) {
    row.boundaryLoops = row.boundaryLoops.map(loop => loop.filter(i => i < ap.count || remap.has(i)).map(mapped));
    row.contourVertices = row.contourVertices.filter(i => remap.has(i)).map(mapped);
  }
  const joined = new THREE.BufferGeometry();
  joined.setAttribute('position', new THREE.Float32BufferAttribute(packedPosition, 3));
  joined.setAttribute('normal', new THREE.Float32BufferAttribute(packedNormal, 3));
  joined.setAttribute('uv', new THREE.Float32BufferAttribute(packedUV, 2)); joined.setIndex(indices);
  const originalColor = geo.getAttribute('color');
  if (!originalColor || originalColor.itemSize !== 3) throw new Error('POCKET_SEAM_INPUT_CLOTH_COLOR');
  const colors = new originalColor.array.constructor(nextVertex * 3).fill(1);
  colors.set(originalColor.array);
  joined.setAttribute('color', new THREE.BufferAttribute(colors, 3, originalColor.normalized));
  joined.userData.pocketSeam = {originalVertexCount: ap.count, originalTriangles: parents,
    newVertices, eligibleParents: [...eligible], preservedOutsidePatch: restored, patches: patchRows,
    contours: joins.map(j => ({pocket: j.name, points: j.contour, collar_inner_vertices: j.collar_inner_vertices}))};
  bed.geometry = joined; geo.dispose();
  return {originalVertexCount: ap.count, emittedVertexCount: nextVertex, triangles: indices.length / 3, certificate: certification.summary()};
}

