// Prefab parameter schemas. A prefab declares its components and a schema of fields {name, type, min, max, step, default, label, group, options};
// validation, the details panel, `describe` and the console's `prefab <name>` help are all derived from that one declaration.
// Types: number, int, bool, color, vec3, enum, string. Records stay plain JSON; schemas never get saved.
// Components are a declaration of what a prefab IS made of (model, collider, rigidbody, character, health, weapon, pickup, vehicle, ai, trigger, spawner, light, audio, emitter, script).
// Honest status: today they describe the prefab (for describe, the panel and docs); systems do not yet read them to decide what to run.
export const COMPONENTS = ['model', 'collider', 'rigidbody', 'character', 'health', 'weapon', 'pickup', 'vehicle', 'ai', 'trigger', 'spawner', 'light', 'audio', 'emitter', 'script'];
export const TYPES = ['number', 'int', 'bool', 'color', 'vec3', 'enum', 'string'];
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const hexOk = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

export const field = (name, type, o = {}) => ({ name, type, label: o.label || name[0].toUpperCase() + name.slice(1), group: o.group || 'Parameters', step: o.step, min: o.min, max: o.max, default: o.default, options: o.options });

// check a schema itself (used by tests and at registration so a typo fails loudly)
export function checkSchema(schema, who = 'prefab') {
  const seen = new Set();
  for (const f of schema) {
    if (!f.name || seen.has(f.name)) throw new Error(`${who}: duplicate or empty field name "${f.name}"`); seen.add(f.name);
    if (!TYPES.includes(f.type)) throw new Error(`${who}.${f.name}: unknown type "${f.type}"`);
    if (f.type === 'enum' && !(f.options && f.options.length)) throw new Error(`${who}.${f.name}: enum needs options`);
    if (f.default === undefined) throw new Error(`${who}.${f.name}: default is required`);
  }
  return schema;
}

// params + schema -> canonical params (defaults filled, unknown keys kept only if the prefab says so). Throws via bad(code, msg, path).
export function validateParams(schema, p, bad, extra = false) {
  const out = extra ? { ...p } : {};
  for (const f of schema) {
    let v = p[f.name]; const path = 'parameters.' + f.name;
    if (v == null) { out[f.name] = Array.isArray(f.default) ? f.default.slice() : f.default; continue; }
    switch (f.type) {
      case 'number': case 'int': {
        v = +v; if (!isNum(v) || (f.type === 'int' && !Number.isInteger(v))) bad('entity.invalid', `${path} must be ${f.type === 'int' ? 'a whole number' : 'a number'}`, path);
        if ((f.min != null && v < f.min) || (f.max != null && v > f.max)) bad('entity.invalid', `${path} must be ${f.min ?? '-inf'} to ${f.max ?? 'inf'}`, path); break; }
      case 'bool': if (typeof v !== 'boolean') bad('entity.invalid', `${path} must be true or false`, path); break;
      case 'color': if (!hexOk(v)) bad('entity.invalid', `${path} must look like "${f.default}"`, path); break;
      case 'vec3': {
        if (!Array.isArray(v) || v.length !== 3 || !v.every(isNum)) bad('entity.invalid', `${path} must be [x,y,z] numbers`, path);
        v = v.map(n => Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, n))); break; }
      case 'enum': if (!f.options.includes(v)) bad('entity.invalid', `${path} must be one of ${f.options.join(', ')}`, path); break;
      case 'string': v = String(v); break;
    }
    out[f.name] = v;
  }
  return out;
}

// one prefab -> a plain description (what `describe` and the console print)
export function describePrefab(name, def) {
  return { prefab: name, label: def.label || name, category: def.category || null, components: def.components ? def.components.slice() : [], parameters: (def.schema || []).map(f => ({ name: f.name, type: f.type, label: f.label, group: f.group, min: f.min, max: f.max, step: f.step, default: f.default, options: f.options })) };
}
export const helpText = d => `${d.prefab} [${d.components.join(', ') || 'no components declared'}]\n` + (d.parameters.length ? d.parameters.map(f => `  ${f.name}: ${f.type}${f.min != null || f.max != null ? ` ${f.min ?? ''}..${f.max ?? ''}` : ''}${f.options ? ' ' + f.options.join('|') : ''} (default ${JSON.stringify(f.default)})`).join('\n') : '  no parameters');
