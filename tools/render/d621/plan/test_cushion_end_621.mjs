// Copyright (c) Meta Platforms, Inc. and affiliates.

// C9: real renderer terminal returns. Runnable as plain node <file>.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';
import {tableModule} from './table_module_621.mjs';
import {measureCushionGeometry, SAMPLING_LAW} from './letters_sampling_621.mjs';

if (typeof vm.SourceTextModule !== 'function') {
  const flag = '--experimental-vm-modules';
  assert(!process.execArgv.includes(flag));
  const child = spawnSync(process.execPath, [...process.execArgv, flag, ...process.argv.slice(1)], {stdio:'inherit'});
  if (child.error) throw child.error;
  if (child.signal) process.kill(process.pid, child.signal);
  process.exit(child.status ?? 1);
}
const {api} = await tableModule();
const profile = (G) => api.cushionProfile(G.render.cushionFamily,
  G.kernel.noseHeightFrac*G.render.profileBallD, G.CW, G.render.cushionProfile);
const vertex = (g, i) => Object.keys(g.attributes).sort().flatMap((key) => {
  const a=g.attributes[key]; return Array.from({length:a.itemSize}, (_,c)=>a.getComponent(i,c));
});
const vertices = (g) => Array.from({length:g.attributes.position.count}, (_,i)=>JSON.stringify(vertex(g,i)));
const triangles = (g) => {
  const v=vertices(g), ix=g.index?.array??Array.from({length:v.length},(_,i)=>i), out=[];
  for(let i=0;i<ix.length;i+=3)out.push([v[ix[i]],v[ix[i+1]],v[ix[i+2]]]);
  return out;
};

test('entries without CU-14 return the exact original geometry object', () => {
  for(const id of Object.keys(api.TABLE_SPECS)) {
    const G=api.makeGeom(id);
    if(G.render.cornerCushionEnd)continue;
    const prof=profile(G), geo=api.cushionGeom(G,api.railPolysFor(G)[0],prof);
    assert.equal(api.proamCushionEnds(G,geo,prof),geo,id);
    geo.dispose();
  }
});

for(const id of ['diamond_proam_9ft','diamond_proam_8ft','diamond_proam_7ft','pool_pro_9ft_measured']) {
  test(`${id}: only corner ends change; nose, side vertices and surviving triangle attributes persist`, () => {
    const G=api.makeGeom(id), prof=profile(G);
    let removed=0, retained=0, nose=0, side=0, caps=0;
    for(const poly of api.railPolysFor(G)) {
      const before=api.cushionGeom(G,poly,prof), after=api.proamCushionEnds(G,before.clone(),prof);
      assert.notEqual(after,before);
      const afterVertices=new Set(vertices(after)), afterTriangles=new Set(triangles(after).map(JSON.stringify));
      for(const tri of triangles(before)) {
        if(tri.every(v=>afterVertices.has(v))) {
          assert(afterTriangles.has(JSON.stringify(tri)),'surviving triangle position/normal/UV changed');
          retained++;
        } else removed++;
      }
      const p=before.attributes.position, used=new Set(before.index.array);
      before.computeBoundingBox();
      const b=before.boundingBox, long=b.max.x-b.min.x>b.max.z-b.min.z;
      for(let i=0;i<p.count;i++) {
        // DERIVED: earcut leaves unused cap vertices with zero normals. The
        // non-indexed cutter drops those; every referenced vertex is checked.
        if(!used.has(i))continue;
        const depth=long?Math.abs(p.getZ(i))-G.W/2:Math.abs(p.getX(i))-G.L/2;
        // TESSELLATION: Float32 world-coordinate precision at the nose line.
        if(Math.abs(depth)<1e-6) {
          assert(afterVertices.has(JSON.stringify(vertex(before,i))),'nose vertex changed');nose++;
        }
        if(long && Math.abs(p.getX(i))<G.L/4) {
          assert(afterVertices.has(JSON.stringify(vertex(before,i))),'side-pocket vertex changed');side++;
        }
      }
      const pos=after.attributes.position, n=after.attributes.normal;
      const slope=Math.tan(G.render.cornerCushionEnd.terminal_face_deg*Math.PI/180);
      for(let i=0;i<pos.count;i+=3) {
        const normal=[n.getX(i),n.getY(i),n.getZ(i)];
        if(normal[1]!==0 || [1,2].some(j=>n.getX(i+j)!==normal[0] || n.getY(i+j)!==0 || n.getZ(i+j)!==normal[2]))continue;
        const ratio=long?Math.abs(normal[2]/normal[0]):Math.abs(normal[0]/normal[2]);
        if(Math.abs(ratio-slope)>1e-6)continue;
        const v=(j)=>[pos.getX(j),pos.getY(j),pos.getZ(j)];
        const a=v(i), u=v(i+1).map((x,k)=>x-a[k]), w=v(i+2).map((x,k)=>x-a[k]);
        const cross=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
        const area=Math.hypot(...cross);
        if(area<1e-15)continue; // TESSELLATION: collapsed Float32 triangle.
        assert(cross.reduce((sum,x,k)=>sum+x*normal[k],0)>0,'terminal cap is inward');caps++;
      }
      before.dispose();after.dispose();
    }
    assert(removed>0 && retained>0 && nose>0 && side>0 && caps>0);
  });

  test(`${id}: final letters read the initial face on both arms of all six pockets`, () => {
    const G=api.makeGeom(id), prof=profile(G), before=[], after=[];
    const soup=(g,name)=>{
      // DERIVED: the standing browser writer rounds world metres to 1e-7.
      const p=g.attributes.position, ix=g.index?.array??Array.from({length:p.count},(_,i)=>i), tris=[];
      for(const i of ix)for(const v of [p.getX(i),p.getY(i),p.getZ(i)])tris.push(Math.round(v*1e7)/1e7*1000);
      return {name,tris}; // DERIVED: the actual browser writer's precision.
    };
    api.railPolysFor(G).forEach((poly,i)=>{
      const b=api.cushionGeom(G,poly,prof), a=api.proamCushionEnds(G,b.clone(),prof);
      before.push(soup(b,`dm-cushion-${i}`));after.push(soup(a,`dm-cushion-${i}`));
      b.dispose();a.dispose();
    });
    // TESSELLATION: a datum-only horizontal bed; the test reads real cushion
    // geometry, independent of cabinet/material/browser setup.
    const bed={name:'dm-bed-cloth',tris:[0,0,0,1,0,0,0,0,1]};
    const b=measureCushionGeometry([...before,bed]), a=measureCushionGeometry([...after,bed]);
    const previous=measureCushionGeometry([...before,bed],[],'pre-c9-facing');
    const ends=(m)=>m.cushions.flatMap(c=>c.long
      ? [['corner',m.endAnalysis(c,'corner')],['side',m.endAnalysis(c,'side')]]
      : [['corner',m.endAnalysis(c,-1)],['corner',m.endAnalysis(c,1)]]);
    const oldEnds=ends(b), newEnds=ends(a), priorEnds=ends(previous);
    assert.equal(oldEnds.length,12);
    assert.equal(a.CP01,b.CP01);assert.equal(a.SP01,b.SP01);
    oldEnds.forEach(([kind,old],i)=>{
      const now=newEnds[i][1], prior=priorEnds[i][1];
      for(const key of ['angle','rImplied','sag','undercut'])assert.equal(old[key],prior[key],`single-plane ${key}`);
      assert.deepEqual(now.P,old.P,'kernel mouth vertex moved');
      if(kind==='side')for(const key of ['angle','rImplied','sag','undercut'])assert.equal(now[key],old[key],`side ${key}`);
      // DERIVED: unchanged CP-02/SP-02, CP-06/SP-06 and CP-09 kernel targets;
      // the 0.001 measurement-precision witness is tighter than their letter bars.
      assert.ok(Math.abs(now.angle-(kind==='corner'?141:102))<.001,'initial facing angle');
      assert.ok(Math.abs(now.rImplied-(kind==='corner'?20.95:7.95))<.001,'initial jaw radius');
      assert.ok(Math.abs(now.undercut-15)<.001,'initial facing undercut');
      assert.ok(now.fitRows>=SAMPLING_LAW.minimum_fit_rows,'existing undercut heights');
      if(kind==='corner')assert.notDeepEqual(now.E,old.E,'terminal return must be measured separately');
    });
  });
}
