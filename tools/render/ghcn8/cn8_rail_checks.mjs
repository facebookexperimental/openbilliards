// Copyright (c) Meta Platforms, Inc. and affiliates.

// CPU reconstruction of the shipped CN8 plank call site for joint red arms.
// G must come from a named renderer census; no inferred table identity.
import * as THREE from '../../../web/vendor/three.module.min.js';
import { loadCornerBuilder, digest } from './cn8_emitted_checks.mjs';

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing constructor ${name}`);
  const end = source.indexOf('\n}', start);
  if (end < 0) throw new Error(`Unclosed constructor ${name}`);
  return source.slice(start, end + 2);
}

export function loadRailBuilder(renderer, clipSource) {
  const corner = loadCornerBuilder(renderer);
  const clip = new Function('THREE', functionSource(clipSource, 'clipGeometryPlane')
    + '\nreturn clipGeometryPlane;')(THREE);
  const names = ['toShape', 'arcPts', 'cn8LeftRailPlanHalves', 'cn8EndRailPlan', 'frameGeom'];
  const changed = renderer.includes('function cn8D3RailGeometry(');
  if (changed) names.push('cn8D3RailGeometry');
  if (renderer.includes('function cn8D3BatchDomains(')) names.push('cn8D3BatchDomains');
  // cn8land1 class D: the shipped rail plans call cn8JoyWoodCorner() (apron rebuild),
  // which reads CN8_JOY_CORNER. Both are carried from the renderer by NAME whenever the
  // renderer declares the helper; a renderer without it (an older merged preview tree)
  // needs neither. A declared helper whose constant is absent fails loudly below.
  const joyCorner = renderer.includes('function cn8JoyWoodCorner(');
  if (joyCorner) names.unshift('cn8JoyWoodCorner');
  const joyCornerConst = joyCorner ? renderer.match(/^const CN8_JOY_CORNER = .*;$/m)?.[0] : '';
  const midStart = renderer.indexOf('export const CN8_MID =');
  const midEnd = renderer.indexOf('\n};', midStart) + 3;
  const mid = renderer.slice(midStart, midEnd).replace('export const', 'const');
  const woodLip = renderer.match(/^const WOOD_LIP = .*;$/m)?.[0];
  const flips = ['flipX', 'flipY'].map((name) => renderer.match(new RegExp(`^const ${name} = .*;$`, 'm'))?.[0]);
  const optionsStart = renderer.indexOf('  const railSeatY =');
  const optionsEnd = renderer.indexOf('\n  };', optionsStart) + 5;
  const options = renderer.slice(optionsStart, optionsEnd);
  const cn8Options = renderer.match(/^  const cn8WoodOpts = .*;$/m)?.[0];
  if (midStart < 0 || !woodLip || flips.some((v) => !v) || optionsStart < 0 || !cn8Options || (joyCorner && !joyCornerConst)) {
    throw new Error('Rail frame/options declarations are absent');
  }
  const code = [mid, woodLip, ...flips, joyCornerConst, ...names.map((name) => functionSource(renderer, name)),
    `return Object.assign((G) => {
      if (G.render?.style !== 'cn8' || !G.template) throw new Error('Expected explicit CN8 frame');
      const F = frameGeom(G), mirX = flipX(G), mirY = flipY(G);
      const plans = [...cn8LeftRailPlanHalves(G,F), ...cn8LeftRailPlanHalves(G,F).map(mirX),
        cn8EndRailPlan(G,F), mirY(cn8EndRailPlan(G,F))];
      ${options}
      ${cn8Options}
      return plans.map((plan, i) => {
        ${changed ? 'return {name: "cn8-plank-"+i, geometry: cn8D3RailGeometry(G, i, cn8WoodOpts, railSeatY)};' : ''}
        let g = new THREE.ExtrudeGeometry(toShape(G, plan), cn8WoodOpts);
        g.rotateX(-Math.PI/2); g.translate(0, railSeatY + 0.004, 0);
        return {name:'cn8-plank-'+i, geometry:g};
      });
    }, { frameGeom, CN8_MID });`].join('\n');
  const build = new Function('THREE', 'CN8_R82', 'CN8_D2_SECTION', 'clipGeometryPlane', code)(THREE, corner.K, corner.S, clip);
  const woodMaterial = renderer.includes('function cn8D3WoodMaterial(')
    ? new Function('THREE', 'CN8_D2_SECTION', functionSource(renderer, 'cn8D3WoodMaterial')
      + '\nreturn cn8D3WoodMaterial;')(THREE, corner.S) : null;
  const resetNormalSamplers = renderer.includes('function resetWoodNormalSamplers(')
    ? new Function(functionSource(renderer, 'resetWoodNormalSamplers') + '\nreturn resetWoodNormalSamplers;')() : null;
  return { build, woodMaterial, resetNormalSamplers, corner, code, source_sha256: digest(code), clip_sha256: digest(functionSource(clipSource, 'clipGeometryPlane')) };
}
