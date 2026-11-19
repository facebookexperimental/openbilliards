// Copyright (c) Meta Platforms, Inc. and affiliates.

// C7: section the actual emitted geometry. Run with plain node <file>.
// DERIVED: the VM flag is enabled by this entry, as in the C3 orientation arm.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';
import {tableModule} from './table_module_621.mjs';
if(typeof vm.SourceTextModule!=='function'){
  const child=spawnSync(process.execPath,[...process.execArgv,'--experimental-vm-modules',...process.argv.slice(1)],{stdio:'inherit'});
  if(child.error)throw child.error;
  if(child.signal)process.kill(process.pid,child.signal);
  process.exit(child.status??1);
}
const {api}=await tableModule();

function section(geometry,y,range=null){
  const p=geometry.attributes.position,ix=geometry.index;
  const segments=[],start=range?.start??0,end=range?start+range.count:ix?.count??p.count;
  for(let i=start;i<end;i+=3){
    const tri=[0,1,2].map(k=>{const j=ix?ix.getX(i+k):i+k;return[p.getX(j),p.getY(j),p.getZ(j)];});
    const points=[];
    for(let k=0;k<3;k++){
      const a=tri[k],b=tri[(k+1)%3];
      if((a[1]>y)===(b[1]>y))continue;
      const t=(y-a[1])/(b[1]-a[1]);points.push([a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t]);
    }
    if(points.length===2)segments.push(points);
  }
  return segments;
}

function leg(segments,sx,sz){
  const points=segments.flat().map(([x,z])=>[sx*x*1000,sz*z*1000]).filter(([x,z])=>x>0&&z>0);
  assert(points.length>0,'missing emitted section');
  const X=Math.max(...points.map(p=>p[0])),Z=Math.max(...points.map(p=>p[1]));
  const support=Math.max(...points.map(p=>p[0]+p[1]));
  return X+Z-support;
}

function capRows(G,reference=G.render.cornerOutline){
  const plans=api.d621RailPlans(G,api.d621FrameGeom(G)),rows=[];
  for(const plan of plans.blocks){
    const geometry=api.d621CrownedPlankGeom(G,plan,G.render.capCrown,G.render.railSeatY,G.render.frameTop);
    try{
      const p=geometry.attributes.position;
      const sx=Math.sign(p.getX(0)),sz=Math.sign(p.getZ(0));
      for(const height of [20,30]){ // MODEL: C7's independently cross-checked Z=790/800 sections.
        const actual=leg(section(geometry,height/1000),sx,sz);
        const expected=reference.cap.rings.find(row=>row.above_bed_mm===height).chamfer_leg_mm;
        // TESSELLATION: a rounded joint's split lies within 0.15 mm of the
        // virtual intersection of its two measured straight faces.
        assert(Math.abs(actual-expected)<.15,`chamfer ${G.id} @ ${height}: ${actual} vs ${expected}`);
        rows.push({actual,expected});
      }
    }finally{geometry.dispose();}
  }
  return rows;
}

test('four emitted block sections follow both measured crown-edge rings in all sizes',()=>{
  for(const size of ['9ft','8ft','7ft'])assert.equal(capRows(api.makeGeom('diamond_proam_'+size)).length,8);
});

// DERIVED: restore the rejected legacy block dimension as a negative control.
test('the retired 82.5 mm block chamfer fails the geometry arm',()=>{
  const original=api.makeGeom('diamond_proam_8ft');
  const G={...original,render:structuredClone(original.render)};
  for(const row of G.render.cornerOutline.cap.rings)row.chamfer_leg_mm=82.5; // DERIVED: adversarial former dimension.
  assert.throws(()=>capRows(G,original.render.cornerOutline),/chamfer/);
});

test('frame and apron have their own emitted rings at Z=700 and Z=760',()=>{
  for(const size of ['9ft','8ft','7ft']){
    const G=api.makeGeom('diamond_proam_'+size),X=G.L/2+G.CW+G.render.frameWidth,Z=G.W/2+G.CW+G.render.frameWidth;
    const geometry=api.d621ApronGeometry(G,X,Z,G.render.apronBand);
    try{
      for(const family of ['apron','frame'])for(const height of [-70,-10]){
        const row=G.render.cornerOutline[family].rings.find(r=>r.above_bed_mm===height);
        const range=geometry.userData.cornerOutlineParts.find(r=>r.family===family);
        const parts=section(geometry,height/1000,range);
        for(const [sx,sz]of [[1,1],[-1,1],[-1,-1],[1,-1]]){
          const actual=leg(parts,sx,sz),expected=2*row.shoulder_inset_mm+row.chamfer_leg_mm;
          assert(Math.abs(actual-expected)<.01,`${family}/${size}/${height}: ${actual} vs ${expected}`);
        }
      }
    }finally{geometry.dispose();}
  }
});

test('the outer junction has sampled curved faces, while the central chamfer stays straight',()=>{
  const G=api.makeGeom('diamond_proam_8ft'),F=api.d621FrameGeom(G),plans=api.d621RailPlans(G,F);
  const angles=new Set();
  for(const plan of [...plans.planks,...plans.blocks]){
    const geo=api.d621CrownedPlankGeom(G,plan,G.render.capCrown,G.render.railSeatY,G.render.frameTop);
    try{
      for(const [a,b]of section(geo,.030)){
        const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
        if(mid[0]>=0||mid[1]>=0)continue;
        const u=(G.W/2+G.CW+G.render.frameWidth+mid[1])*1000;
        const v=(G.L/2+G.CW+G.render.frameWidth+mid[0])*1000;
        // DERIVED: select the outer end of the measured chamfer, clear of
        // the pocket-cut arc. These bounds are deliberately wider than R.
        if(u<0||u>5||v<70||v>90)continue;
        const dx=b[0]-a[0],dz=b[1]-a[1];
        if(Math.hypot(dx,dz)<1e-7)continue;
        const degrees=Math.atan2(Math.abs(dx),Math.abs(dz))*180/Math.PI;
        if(degrees>.5&&degrees<89.5)angles.add(Math.round(degrees*2)/2);
      }
    }finally{geo.dispose();}
  }
  assert(angles.size>=6,`missing small junction round: ${[...angles]}`);
});
