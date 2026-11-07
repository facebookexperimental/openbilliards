// Copyright (c) Meta Platforms, Inc. and affiliates.

// jsonschema.js — a small, dependency-free validator for the subset of JSON Schema
// 2020-12 that docs/geometry/ball-return-track.schema.json uses (feature 037, seal 5,
// review r3 P2: "the runtime refuses exactly what the schema refuses"). PURE,
// node-importable. Keywords: $ref (local, `#/…`), type (incl. integer, unions),
// enum, const, required, properties, additionalProperties, items, minItems,
// maxItems, minLength, pattern, minimum, maximum, exclusiveMinimum,
// exclusiveMaximum, format ('date' only), oneOf / anyOf / allOf, not. Annotation
// keywords (title, description, default, examples, $schema, $id) are ignored — with
// one stated use: an anyOf branch's `title` is quoted in the refusal message. Any
// keyword outside this list makes validation THROW — a schema change that needs
// more must extend this file (the node gate keeps the JS mirror of the schema in
// byte parity with the docs file, so the two cannot drift silently). Two stated
// choices where 2020-12 leaves room: `format: date` is ASSERTED (a stock validator
// treats format as an annotation unless the format-assertion vocabulary is on — a
// calendar-invalid date is refused here on purpose), and `minLength` counts UTF-16
// code units, not code points (this schema's strings are ASCII).

const KNOWN = new Set(['$ref', 'type', 'enum', 'const', 'required', 'properties', 'additionalProperties', 'items',
  'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
  'format', 'oneOf', 'anyOf', 'allOf', 'not', 'title', 'description', 'default', 'examples', '$schema', '$id', '$defs', 'definitions', '$comment']);

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const validDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d); // full-year form: years 0000–0099 stay themselves
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

function resolveRef(root, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#')) throw new Error(`jsonschema: only local $ref is supported (${ref})`);
  let node = root;
  for (const raw of ref.slice(1).split('/').filter(Boolean)) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    node = node?.[key];
    if (node === undefined) throw new Error(`jsonschema: unresolved $ref ${ref}`);
  }
  return node;
}

/**
 * Validate `value` against `schema`. Returns an array of { path, keyword, message }
 * (empty = valid); collection stops after `limit` errors. `path` is a JSON pointer
 * into the VALUE.
 */
export function validateAgainstSchema(schema, value, { limit = 8 } = {}) {
  const errors = [];
  const root = schema;
  const push = (path, keyword, message) => { if (errors.length < limit) errors.push({ path: path || '/', keyword, message }); };
  const check = (sch, v, path) => {
    if (sch === true) return true;
    if (sch === false) { push(path, 'false', 'schema false'); return false; }
    if (!sch || typeof sch !== 'object') throw new Error(`jsonschema: bad subschema at ${path}`);
    for (const k of Object.keys(sch)) if (!KNOWN.has(k)) throw new Error(`jsonschema: unsupported keyword "${k}" at ${path || '/'}`);
    const before = errors.length;
    if (sch.$ref !== undefined) check(resolveRef(root, sch.$ref), v, path);
    if (sch.type !== undefined) {
      const types = Array.isArray(sch.type) ? sch.type : [sch.type];
      const t = typeOf(v);
      const ok = types.some((tt) => (tt === 'integer' ? isInt(v) : tt === 'number' ? typeof v === 'number' && Number.isFinite(v) : t === tt));
      if (!ok) push(path, 'type', `expected ${types.join('|')}, got ${t}`);
    }
    if (sch.enum !== undefined && !sch.enum.some((e) => deepEq(e, v))) push(path, 'enum', `must be one of ${JSON.stringify(sch.enum)}`);
    if (sch.const !== undefined && !deepEq(sch.const, v)) push(path, 'const', `must equal ${JSON.stringify(sch.const)}`);
    if (typeOf(v) === 'object') {
      if (sch.required) for (const r of sch.required) if (!Object.prototype.hasOwnProperty.call(v, r)) push(path, 'required', `missing property "${r}"`);
      if (sch.properties) for (const [k, sub] of Object.entries(sch.properties)) if (Object.prototype.hasOwnProperty.call(v, k)) check(sub, v[k], `${path}/${k}`);
      if (sch.additionalProperties !== undefined) {
        for (const k of Object.keys(v)) {
          if (sch.properties && Object.prototype.hasOwnProperty.call(sch.properties, k)) continue; // own keys only: a prototype name (constructor, __proto__) is an unexpected property
          if (sch.additionalProperties === false) push(`${path}/${k}`, 'additionalProperties', `unexpected property "${k}"`);
          else check(sch.additionalProperties, v[k], `${path}/${k}`);
        }
      }
    }
    if (Array.isArray(v)) {
      if (sch.minItems !== undefined && v.length < sch.minItems) push(path, 'minItems', `at least ${sch.minItems} items`);
      if (sch.maxItems !== undefined && v.length > sch.maxItems) push(path, 'maxItems', `at most ${sch.maxItems} items`);
      if (sch.items !== undefined) v.forEach((it, i) => check(sch.items, it, `${path}/${i}`));
    }
    if (typeof v === 'string') {
      if (sch.minLength !== undefined && v.length < sch.minLength) push(path, 'minLength', `at least ${sch.minLength} characters`);
      if (sch.maxLength !== undefined && v.length > sch.maxLength) push(path, 'maxLength', `at most ${sch.maxLength} characters`);
      if (sch.pattern !== undefined && !new RegExp(sch.pattern).test(v)) push(path, 'pattern', `must match ${sch.pattern}`);
      if (sch.format === 'date' && !validDate(v)) push(path, 'format', 'must be a calendar date YYYY-MM-DD');
    }
    if (typeof v === 'number') {
      if (sch.minimum !== undefined && v < sch.minimum) push(path, 'minimum', `must be >= ${sch.minimum}`);
      if (sch.maximum !== undefined && v > sch.maximum) push(path, 'maximum', `must be <= ${sch.maximum}`);
      if (sch.exclusiveMinimum !== undefined && !(v > sch.exclusiveMinimum)) push(path, 'exclusiveMinimum', `must be > ${sch.exclusiveMinimum}`);
      if (sch.exclusiveMaximum !== undefined && !(v < sch.exclusiveMaximum)) push(path, 'exclusiveMaximum', `must be < ${sch.exclusiveMaximum}`);
    }
    if (sch.allOf) for (const sub of sch.allOf) check(sub, v, path);
    if (sch.anyOf) {
      const save = errors.length;
      const ok = sch.anyOf.some((sub) => { const n = errors.length; const r = check(sub, v, path); errors.length = n; return r; });
      errors.length = save;
      // a failed alternation names its branches when the schema titles them: the
      // topology branches carry their own minimum counts, and "matches none of the
      // alternatives" alone would not say which law was missed (review r9 P2-1)
      if (!ok) {
        const titles = sch.anyOf.map((sub) => sub.title).filter((t) => typeof t === 'string').join('; ');
        push(path, 'anyOf', `matches none of the alternatives${titles ? ` (${titles})` : ''}`);
      }
    }
    if (sch.oneOf) {
      const save = errors.length;
      let n = 0;
      for (const sub of sch.oneOf) { const m = errors.length; if (check(sub, v, path)) n += 1; errors.length = m; }
      errors.length = save;
      if (n !== 1) push(path, 'oneOf', `matches ${n} alternatives, must match exactly one`);
    }
    if (sch.not !== undefined) {
      const save = errors.length;
      const r = check(sch.not, v, path);
      errors.length = save;
      if (r) push(path, 'not', 'must not match the excluded schema');
    }
    return errors.length === before;
  };
  check(schema, value, '');
  return errors;
}

/** One-line refusal text for the first error (the law line the module reports). */
export function schemaRefusal(errors) {
  const e = errors[0];
  return e ? `${e.path} ${e.keyword}: ${e.message}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ''}` : '';
}
