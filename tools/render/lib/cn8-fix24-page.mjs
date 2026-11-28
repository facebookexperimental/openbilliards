// Copyright (c) Meta Platforms, Inc. and affiliates.

// Page-only operations, serialized by pageExpression(). Importing this module
// starts no server/browser and changes no application state.
export function makeFix24PageTools(T, env) {
  const need = (ok, code) => { if (!ok) throw new Error(`CN8_FIX24_${code}`); };
  const classes = ['pocket_furniture', 'rail_top_wood', 'rail_side', 'cushion_rubber_cloth',
    'cloth_bed', 'balls', 'room_bench_indirect', 'HUD'];
  const dbg = () => { need(env.__dbg?.scene && env.__dbg?.renderer && env.__dbg?.camera, 'DEBUG_SCENE_REQUIRED'); return env.__dbg; };
  const hash = async text => Array.from(new Uint8Array(await env.crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('');
  const pathOf = o => {
    const names = [];
    for (let p = o; p; p = p.parent) names.unshift(`${p.name || p.type}[${p.parent ? p.parent.children.indexOf(p) : 0}]`);
    return names.join('/');
  };
  const inTable = o => { for (let p = o; p; p = p.parent) if (p.name === 'obTable') return true; return false; };
  const isCover = o => /^(cn8r82-ring-\d+|cn8-mid-leather(?:-skirt)?-\d+|obPocketCap|obPocketValance)$/.test(o.name);
  function classify(o, rules = [], normal = null) {
    const path = pathOf(o), name = o.name || '';
    for (const rule of rules) {
      need(classes.includes(rule.class) && rule.source && (rule.path || rule.name), 'CLASS_RULE_INVALID');
      if (rule.path === path || rule.name === name) return rule.class;
    }
    if (/^cn8-plank-/.test(name)) return normal && normal.y > 0 ? 'rail_top_wood' : 'rail_side';
    if (/^cn8-bed$/.test(name)) return 'cloth_bed';
    if (/^(cn8-cushion-|cn8-cloth-|cn8r82-(tongue|endroll|rollface|wallface|curl|wall)-|cn8-mid-fallcloth-)/.test(name)) return 'cushion_rubber_cloth';
    if (isCover(o) || /^(cn8r82-(cup|hole|endwrap|stitch)-|cn8-(net|ring|fallbag|mid-(stitch|lace|slatecut))|cn8cap-|obPocket)/.test(name)) return 'pocket_furniture';
    if (/^cn8-(beam|blind|railend|bodyweb)-/.test(name)) return 'rail_side';
    for (let p = o; p; p = p.parent) {
      if (/^(obBench|obWallProps|obFarPropTable|obCueRack|obScorePlaque)$/.test(p.name)) return 'room_bench_indirect';
      if (/^obAim/.test(p.name)) return 'HUD';
    }
    // The live-ball shape is only a fallback; an explicit source-cited rule
    // can override it. Far prop-table spheres were handled by ancestry above.
    if (!inTable(o) && o.geometry?.type === 'SphereGeometry') return 'balls';
    return 'UNCLASSIFIED';
  }
  function state() {
    const { scene, camera, renderer } = dbg();
    const table = scene.getObjectByName('obTable');
    const rect = renderer.domElement.getBoundingClientRect();
    return { table_beacon: table?.userData.tableId ?? null,
      equipment: env.__test?.equipment?.() ?? null,
      camera: { matrixWorld: camera.matrixWorld.toArray(), projectionMatrix: camera.projectionMatrix.toArray() },
      canvas_rect_css: [rect.x, rect.y, rect.width, rect.height], device_pixel_ratio: env.devicePixelRatio,
      transport: table?.userData.cn8TransportArtifact ?? null };
  }
  function uniformRecord(gl, program) {
    const rows = {};
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const u = gl.getActiveUniform(program, i);
      if (!/^(uLight(Pos|Count)|hemisphereLights\[|ambientLightColor|uGi|uSpike)/.test(u.name)) continue;
      const value = gl.getUniform(program, gl.getUniformLocation(program, u.name));
      rows[u.name] = ArrayBuffer.isView(value) ? Array.from(value) : value;
    }
    return rows;
  }
  async function census() {
    const { scene, renderer } = dbg(); scene.updateMatrixWorld(true);
    const gl = renderer.getContext(), rows = [], lights = [];
    scene.traverse(o => { if (o.isLight) lights.push({ name: o.name, type: o.type, visible: o.visible,
      intensity: o.intensity, color: o.color?.toArray(), groundColor: o.groundColor?.toArray() }); });
    const covers = []; scene.traverse(o => { if (o.isMesh && isCover(o)) covers.push(o); });
    need(covers.length, 'COVER_CENSUS_EMPTY');
    for (const mesh of covers) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (let materialIndex = 0; materialIndex < materials.length; materialIndex++) {
        const m = materials[materialIndex], props = renderer.properties.get(m);
        const prog = props?.currentProgram;
        const vertex = prog ? gl.getShaderSource(prog.vertexShader) : null;
        const fragment = prog ? gl.getShaderSource(prog.fragmentShader) : null;
        const uniforms = prog ? uniformRecord(gl, prog.program) : {};
        const hemi = Object.entries(uniforms).filter(([k]) => /^hemisphereLights\[.*\.(skyColor|groundColor)$/.test(k));
        const ambient = Object.entries(uniforms).filter(([k]) => k === 'ambientLightColor');
        const energy = [...hemi, ...ambient].flatMap(([, v]) => Array.isArray(v) ? v : [v]);
        const light = uniforms.uLightPos ?? uniforms['uLightPosN[0]']?.slice(0, 3);
        const faces = [], g = mesh.geometry, pos = g.getAttribute('position'), idx = g.index;
        const groups = g.groups.length ? g.groups : [{ start: 0, count: idx?.count ?? pos.count, materialIndex: 0 }];
        for (const group of groups) {
          if (group.materialIndex !== materialIndex) continue;
          for (let i = group.start; i < group.start + group.count; i += 3) {
            const p = [0, 1, 2].map(k => new T.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld));
            const cross = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0]));
            if (cross.lengthSq() === 0) continue;
            const n = cross.normalize(), c = p[0].clone().add(p[1]).add(p[2]).multiplyScalar(1 / 3);
            // Geometric exterior census: outward in table x/z, normal more
            // horizontal than vertical. The separate A3 bbox excludes details.
            const exterior = n.x * c.x + n.z * c.z > 0 && Math.hypot(n.x, n.z) > Math.abs(n.y);
            if (!exterior) continue;
            const dot = light ? n.dot(new T.Vector3(...light).sub(c).normalize()) : null;
            faces.push({ triangle: i / 3, normal_world: n.toArray(), center_world: c.toArray(), n_dot_l: dot });
          }
        }
        const maps = Object.fromEntries(['map', 'normalMap', 'bumpMap', 'roughnessMap', 'envMap'].map(k => [k, m[k]?.uuid ?? null]));
        const material = { type: m.type, name: m.name, color: m.color?.getHexString(), emissive: m.emissive?.getHexString(),
          emissiveIntensity: m.emissiveIntensity, roughness: m.roughness, metalness: m.metalness,
          specularIntensity: m.specularIntensity, envMapIntensity: m.envMapIntensity,
          side: m.side, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor,
          polygonOffsetUnits: m.polygonOffsetUnits, maps,
          customProgramCacheKey: String(m.customProgramCacheKey()),
          onBeforeCompile_sha256: await hash(String(m.onBeforeCompile)),
          onBeforeCompile_source: String(m.onBeforeCompile) };
        rows.push({ mesh: mesh.name, path: pathOf(mesh), material_index: materialIndex, material,
          cn8Field: g.userData.cn8Field ?? null,
          irradiance: { selector: 'DERIVED outward x/z normal; horizontal component > abs(vertical component)',
            exterior_faces: faces.length, n_dot_l_nonpositive_fraction: light && faces.length
              ? faces.filter(f => f.n_dot_l <= 0).length / faces.length : null,
            lamp_world: light ?? null,
            lamp_source: uniforms.uLightPos ? 'linked uLightPos (analytic centroid)' : 'linked uLightPosN[0] (first emitter)', faces,
            hemisphere_compiled: prog ? hemi.length > 0 : null, ambient_compiled: prog ? ambient.length > 0 : null,
            reach: !prog ? 'UNCOMPILED' : (!energy.length ? 'INERT_NO_ACTIVE_AMBIENT_OR_HEMISPHERE_UNIFORM'
              : (energy.every(v => v === 0) ? 'INERT_ZERO_LINKED_UNIFORMS' : 'NONZERO_INPUT_TRANSFER_REQUIRES_GLSL_READ')),
            boundary: 'Linked-program uniforms are inputs. A nonzero input is never claimed to reach the output without reading its transfer.', uniforms },
          glsl: { vertex, fragment, vertex_sha256: vertex && await hash(vertex), fragment_sha256: fragment && await hash(fragment) } });
      }
    }
    return { tag: 'DERIVED / live material and linked-program census', actual_state: state(), lights, rows };
  }
  function inventory(rules = []) {
    const { scene } = dbg(), rows = [];
    scene.traverse(o => { if (o.isMesh || o.isLine || o.isPoints || o.isSprite) rows.push({ path: pathOf(o), name: o.name,
      class: classify(o, rules), per_face_classes: /^cn8-plank-/.test(o.name) ? ['rail_top_wood', 'rail_side'] : null,
      cover: isCover(o), material_count: Array.isArray(o.material) ? o.material.length : 1 }); });
    return rows;
  }
  function idRender(options = {}) {
    const { scene, renderer, camera } = dbg();
    const gl = renderer.getContext?.();
    const size = renderer.getDrawingBufferSize(new T.Vector2());
    const w = size.x, h = size.y;
    need(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0, 'DRAWING_BUFFER_INVALID');
    scene.updateMatrixWorld(true);
    const clone = scene.clone(true), originals = [], copies = [], ownedMaterials = [], ownedGeometries = [];
    scene.traverse(o => originals.push(o)); clone.traverse(o => copies.push(o));
    need(originals.length === copies.length, 'SCENE_CLONE_MISMATCH');
    const originalRefs = originals.map(o => ({ material: o.material, geometry: o.geometry }));
    const legend = { 0: { class: 'room_bench_indirect', mesh: '(background)', source: 'empty id-render background' } };
    const limitations = [], idFor = new Map();
    const next = (o, slot, cls) => {
      const key = `${pathOf(o)}|${slot}|${cls}`;
      if (!idFor.has(key)) {
        const id = idFor.size + 1; need(id < 0x1000000, 'ID_SPACE_EXHAUSTED'); idFor.set(key, id);
        legend[id] = { class: cls, mesh: o.name, path: pathOf(o), material_index: slot,
          cover: isCover(o) && slot === 0, source: options.rules?.find(r => r.path === pathOf(o) || r.name === o.name)?.source ?? 'named mesh / ancestry / geometric face rule' };
      }
      return idFor.get(key);
    };
    const rgb = id => [(id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255];
    let target;
    const saved = { target: renderer.getRenderTarget(), cubeFace: renderer.getActiveCubeFace?.() ?? 0,
      mipLevel: renderer.getActiveMipmapLevel?.() ?? 0, viewport: renderer.getViewport(new T.Vector4()),
      scissor: renderer.getScissor(new T.Vector4()), scissorTest: renderer.getScissorTest(),
      color: renderer.getClearColor(new T.Color()), alpha: renderer.getClearAlpha(),
      toneMapping: renderer.toneMapping, outputColorSpace: renderer.outputColorSpace,
      autoClear: renderer.autoClear, shadowEnabled: renderer.shadowMap.enabled,
      dither: gl?.isEnabled?.(gl.DITHER) ?? null };
    try {
      for (let i = 0; i < originals.length; i++) {
        const o = originals[i], c = copies[i];
        if (o.isLine) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          c.material = mats.map((m, slot) => {
            const idMat = new T.LineBasicMaterial({ color: new T.Color().setRGB(...rgb(next(o, slot,
              classify(o, options.rules))), T.LinearSRGBColorSpace), toneMapped: false, fog: false,
              depthTest: m.depthTest, depthWrite: m.depthWrite, linewidth: m.linewidth });
            idMat.visible = m.visible && m.opacity !== 0; ownedMaterials.push(idMat); return idMat;
          });
          if (!Array.isArray(o.material)) c.material = c.material[0];
          continue;
        }
        if (!o.isMesh) {
          need(!((o.isPoints || o.isSprite) && o.visible), 'POINT_OR_SPRITE_REQUIRES_MATCHED_ID_MATERIAL');
          continue;
        }
        need(!o.isSkinnedMesh && !o.morphTargetInfluences?.some(x => x !== 0), 'DEFORMED_MESH_REQUIRES_MATCHED_ID_VERTEX_SHADER');
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const split = /^cn8-plank-/.test(o.name);
        if (split) {
          const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); ownedGeometries.push(g); c.geometry = g;
          const pos = g.getAttribute('position'), color = new Float32Array(pos.count * 3);
          for (let j = 0; j < pos.count; j += 3) {
            const points = [0, 1, 2].map(k => new T.Vector3().fromBufferAttribute(pos, j + k).applyMatrix4(o.matrixWorld));
            const n = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
            const slot = g.groups.find(x => j >= x.start && j < x.start + x.count)?.materialIndex ?? 0;
            const value = rgb(next(o, slot, classify(o, options.rules, n)));
            for (let k = 0; k < 3; k++) color.set(value, (j + k) * 3);
          }
          g.setAttribute('color', new T.Float32BufferAttribute(color, 3));
        }
        c.material = mats.map((m, slot) => {
          const value = split ? [1, 1, 1] : rgb(next(o, slot, classify(o, options.rules)));
          const idMat = new T.MeshBasicMaterial({ color: new T.Color().setRGB(...value, T.LinearSRGBColorSpace),
            side: m.side, toneMapped: false, fog: false, vertexColors: split,
            depthTest: m.depthTest, depthWrite: m.depthWrite,
            polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits,
            alphaTest: m.alphaTest, alphaMap: m.alphaMap, map: m.alphaTest > 0 ? m.map : null });
          idMat.visible = m.visible && m.opacity !== 0;
          if (m.transparent) limitations.push({ path: pathOf(o), material_index: slot, reason: 'id is nearest geometric surface; transparency energy is not an id weight' });
          // Preserve alpha cutouts without letting a texture tint the ID.
          idMat.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>',
            '#include <alphatest_fragment>\ndiffuseColor.rgb = diffuse;\n#ifdef USE_COLOR\ndiffuseColor.rgb *= vColor;\n#endif'); };
          ownedMaterials.push(idMat); return idMat;
        });
        if (!Array.isArray(o.material)) c.material = c.material[0];
      }
      clone.background = new T.Color(0); clone.environment = null; clone.fog = null;
      target = new T.WebGLRenderTarget(w, h, { samples: 0, type: T.UnsignedByteType,
        minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: true, stencilBuffer: false });
      target.texture.colorSpace = T.NoColorSpace;
      if (saved.dither !== null) gl.disable(gl.DITHER);
      renderer.shadowMap.enabled = false; renderer.toneMapping = T.NoToneMapping;
      renderer.outputColorSpace = T.LinearSRGBColorSpace; renderer.autoClear = true;
      renderer.setRenderTarget(target); renderer.setViewport(0, 0, w, h); renderer.setScissorTest(false);
      renderer.setClearColor(0, 1); renderer.clear(); renderer.render(clone, camera);
      const raw = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(target, 0, 0, w, h, raw);
      const top = new Uint8Array(raw.length);
      for (let y = 0; y < h; y++) top.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      let binary = ''; for (let i = 0; i < top.length; i += 32768) binary += String.fromCharCode(...top.subarray(i, i + 32768));
      return { tag: 'DERIVED / direct unlit id render, no post-FX, no MSAA, top-left RGBA8',
        width: w, height: h, rgba_base64: env.btoa(binary), legend, limitations,
        hardware_dither_disabled: saved.dither !== null,
        actual_state: state(), original_scene_materials_untouched: originals.every((o, i) =>
          o.material === originalRefs[i].material && o.geometry === originalRefs[i].geometry) };
    } finally {
      renderer.setRenderTarget(saved.target, saved.cubeFace, saved.mipLevel); renderer.setViewport(saved.viewport); renderer.setScissor(saved.scissor);
      renderer.setScissorTest(saved.scissorTest); renderer.setClearColor(saved.color, saved.alpha);
      renderer.toneMapping = saved.toneMapping; renderer.outputColorSpace = saved.outputColorSpace;
      renderer.autoClear = saved.autoClear; renderer.shadowMap.enabled = saved.shadowEnabled;
      if (saved.dither !== null) { if (saved.dither) gl.enable(gl.DITHER); else gl.disable(gl.DITHER); }
      target?.dispose(); for (const m of ownedMaterials) m.dispose(); for (const g of ownedGeometries) g.dispose();
    }
  }
  function hudUnderlay(action) {
    const key = '__cn8Fix24HudUnderlay', { renderer } = dbg();
    if (action === 'end') { env[key]?.node.remove(); delete env[key]; return { restored: true }; }
    if (!env[key]) {
      need(action === 'black', 'HUD_PROBE_BEGIN_WITH_BLACK');
      const canvas = renderer.domElement, rect = canvas.getBoundingClientRect(), style = env.getComputedStyle(canvas);
      need(style.transform === 'none' && rect.width > 0 && rect.height > 0, 'HUD_CANVAS_LAYOUT_UNSUPPORTED');
      const node = env.document.createElement('div');
      node.setAttribute('data-cn8-fix24-instrument', 'canvas-underlay');
      node.style.cssText = `position:fixed;pointer-events:none;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;z-index:${style.zIndex};`;
      canvas.insertAdjacentElement('afterend', node); env[key] = { node, rect: [rect.x, rect.y, rect.width, rect.height] };
    }
    need(['black', 'white'].includes(action), 'HUD_PROBE_ACTION_INVALID');
    env[key].node.style.background = action === 'black' ? 'rgb(0,0,0)' : 'rgb(255,255,255)';
    return { action, canvas_rect_css: env[key].rect, device_pixel_ratio: env.devicePixelRatio,
      boundary: 'opaque canvas underlay only; all HUD nodes remain visible; end in a caller finally block' };
  }
  return { census, inventory, idRender, hudUnderlay, snapshot: () => ({ actual_state: state() }) };
}

export function pageExpression(action, options = {}) {
  if (!['census', 'inventory', 'idRender', 'hudUnderlay', 'snapshot'].includes(action)) throw new Error('CN8_FIX24_PAGE_ACTION_INVALID');
  return `(async () => { const T = await import('three'); const tools = (${makeFix24PageTools.toString()})(T, window);`
    + ` const result = await tools[${JSON.stringify(action)}](${JSON.stringify(options)});`
    + ` if (result.actual_state) result.actual_state.activeTableId_raw = (await import('./scene/table.js')).activeTableId(); return result; })()`;
}
