// Copyright (c) Meta Platforms, Inc. and affiliates.

// env/ambient.js — the arithmetic of the ambient cube (env.js `env.ambient`). Pure and free of three, so the node arm reads it
// (web/tools/club/test-club-core.mjs).
//
// Input: the six faces of a small cube capture as the renderer read them back (RGBA, row 0 at the bottom of the face, as
// gl.readPixels returns it), and for each face the camera that drew it (its world matrix and its projection matrix, both as
// column-major arrays of 16). Output: for each world axis +x, -x, +y, -y, +z, -z the cosine-weighted mean radiance of the
// hemisphere around it,
//   A_i = ( integral over the sphere of L(w) max(w . a_i, 0) dw ) / ( integral of max(w . a_i, 0) dw ),
// so that a diffuse surface with unit world normal n receives the irradiance
//   E(n) = PI * sum_i max(+-n_i, 0)^2 * A_i            (exact for n on an axis; a smooth blend between them).
// The direction of a texel comes from the camera's own matrices (three's cube cameras have a negative field of view: no sign
// is assumed here), its solid angle is (2 / N)^2 / (x^2 + y^2 + 1)^1.5 up to the constant the normalisation removes.

export const AMBIENT_AXES = Object.freeze([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);

/**
 * hemisphereMeans({ size, faces, max }) -> { values: [[r, g, b] x 6], energy }
 *   size   face size N in texels
 *   faces  six of { world: number[16], projection: number[16], at(i) -> number } where at(i) is channel i of the face's
 *          texel buffer (index = (row * N + column) * 4 + channel), already in scene-linear floats
 *   max    a radiance above this is clamped (one hot texel must not own a hemisphere)
 * `energy` is the sum of everything read: 0 means the read-back held nothing (a failed read leaves a buffer untouched).
 */
export function hemisphereMeans({ size, faces, max = Infinity }) {
  const N = size;
  const sum = AMBIENT_AXES.map(() => [0, 0, 0, 0]);
  let energy = 0;
  for (const face of faces) {
    const e = face.world, P = face.projection, at = face.at;
    const kx = 1 / P[0], ky = 1 / P[5];
    for (let py = 0; py < N; py++) {
      const y = ((py + 0.5) / N * 2 - 1) * ky;
      for (let px = 0; px < N; px++) {
        const x = ((px + 0.5) / N * 2 - 1) * kx;
        const inv = 1 / Math.sqrt(x * x + y * y + 1);
        const dx = (x * e[0] + y * e[4] - e[8]) * inv, dy = (x * e[1] + y * e[5] - e[9]) * inv, dz = (x * e[2] + y * e[6] - e[10]) * inv;
        const w = inv * inv * inv;
        const i = (py * N + px) * 4;
        let r = at(i), g = at(i + 1), b = at(i + 2);
        if (!(r >= 0)) r = 0; if (!(g >= 0)) g = 0; if (!(b >= 0)) b = 0;
        if (r > max) r = max; if (g > max) g = max; if (b > max) b = max;
        energy += r + g + b;
        for (let a = 0; a < 6; a++) {
          const ax = AMBIENT_AXES[a];
          const c = dx * ax[0] + dy * ax[1] + dz * ax[2];
          if (c <= 0) continue;
          const s = sum[a], k = c * w;
          s[0] += r * k; s[1] += g * k; s[2] += b * k; s[3] += k;
        }
      }
    }
  }
  return { values: sum.map((s) => (s[3] > 0 ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : [0, 0, 0])), energy };
}

/** The irradiance a diffuse surface with unit world normal n receives from the six values (the JS twin of the consumers' GLSL). */
export function ambientIrradiance(values, n) {
  const out = [0, 0, 0];
  for (let a = 0; a < 6; a++) {
    const ax = AMBIENT_AXES[a];
    const c = Math.max(0, n[0] * ax[0] + n[1] * ax[1] + n[2] * ax[2]);
    const k = Math.PI * c * c;
    out[0] += values[a][0] * k; out[1] += values[a][1] * k; out[2] += values[a][2] * k;
  }
  return out;
}

// the GLSL a consumer may paste (it declares the uniform; CONTRACT.md: shared uniform OBJECT `env.ambient.uniforms.uClubEnvAmb`)
export const AMBIENT_GLSL = /* glsl */`
uniform vec3 uClubEnvAmb[ 6 ];
vec3 clubEnvAmbient( vec3 n ) {
	vec3 p = max( n, 0.0 ), m = max( - n, 0.0 );
	return PI * ( p.x * p.x * uClubEnvAmb[ 0 ] + m.x * m.x * uClubEnvAmb[ 1 ] + p.y * p.y * uClubEnvAmb[ 2 ]
		+ m.y * m.y * uClubEnvAmb[ 3 ] + p.z * p.z * uClubEnvAmb[ 4 ] + m.z * m.z * uClubEnvAmb[ 5 ] );
}
`;
