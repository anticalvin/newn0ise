import {GENERATORS,STYLE_CONTROLS,MAX_DEFINITION_LENGTH,createDefinition,parseDefinition,
  applyVectorPatch,createVectorVariation,generateGeometry,geometryMarkup,exportVectorSVG,viewBox} from './vector-generator.js';
import {openVectorTab,returnVector,takeVector} from './vector-handoff.js';
import {createVectorAPI,connectVectorBridge} from './vector-api.js';

const STORAGE = 'n0ise-lab-vector-v1';
const $ = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
const json = value => JSON.stringify(value,null,2);
const presets = [
  ['Displaced rings','concentric',{count:22,eccentricity:.82,offset:58,offsetY:-33}],
  ['Moiré lens','interference',{count:30,separation:85,mask:'overlap',drift:.29}],
  ['Interrupted orbit','concentric',{count:27,gap:103,twist:9}],
  ['Nested grid','architecture',{rows:2,columns:3,count:10,sides:6}],
  ['Rotating frames','transform',{count:31,scale:.963,twist:8,copies:1}]
];
function button(label, action, className = 'pill') {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.className = className;
  control.onclick = action;
  return control;
}

function download(name, contents, type) {
  const url = URL.createObjectURL(new Blob([contents],{type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),30000);
}

export function mountVectorLab({editor,applyPause}) {
  const lab = $('lab'), preview = $('vector-preview').querySelector('svg'), code = $('code');
  const search = new URLSearchParams(location.search);
  let ticket = search.get('vectorEdit'), loading = !!ticket, active = false;
  let definition = createDefinition(), cleanSource, raf, geometry, rendered;
  let p5Source = lab.dataset.src !== 'off', vectorSource = false, p5Draft = '', vectorDraft = '';
  let proposal = null, sending = false, drawer = null;
  const past = [], future = [], fields = new Map();
  const sketchNodes = [$('preview'),$('pause'),$('status').parentElement,$('run').closest('.lab-meta'),
    $('lab-actions'),$('lab-params').closest('.lab-drawers'),$('editor').querySelector('.editor-title')];
  const vectorNodes = ['vector-preview','vector-status-line','vector-meta','vector-actions',
    'vector-drawers','vector-source-tools'].map($);
  try {
    if (ticket) {
      const saved = sessionStorage.getItem(STORAGE+':'+ticket);
      if (saved) {
        definition = parseDefinition(saved);
        loading = false;
      }
    } else {
      const saved = localStorage.getItem(STORAGE);
      if (saved) definition = parseDefinition(saved);
    }
  } catch {}
  cleanSource = json(definition);
  const status = text => { $('vector-status').textContent = text; };
  const error = text => { $('vector-error').textContent = text; };
  const readSource = () => editor ? editor.get() : code.value;
  function writeSource(value) {
    if (editor) editor.set(value,{addToHistory:false});
    else code.value = value;
  }
  const canReplaceSource = () => readSource() === cleanSource;
  const refreshSource = force => {
    if (force || canReplaceSource()) writeSource(json(definition));
    cleanSource = json(definition);
  };
  function sourceVisibility(on) {
    lab.dataset.src = on ? 'on' : 'off';
    $('src-toggle').setAttribute('aria-pressed',String(on));
  }
  function showDrawer(name) {
    drawer = name;
    for (const control of $('vector-actions').querySelectorAll('button')) {
      const on = name === control.dataset.vectorDrawer;
      control.setAttribute('aria-expanded',String(on));
      $(control.getAttribute('aria-controls')).hidden = !on;
    }
  }
  function switchMode(on) {
    if (active === on) return;
    active = on;
    if (on) p5Source = lab.dataset.src !== 'off';
    else vectorSource = lab.dataset.src !== 'off';
    lab.dataset.mode = on ? 'vector' : 'sketch';
    $('lab-project-kind').textContent = on ? 'Vector' : 'Sketch';
    sourceVisibility(on ? vectorSource : p5Source);
    sketchNodes.forEach(node => { node.hidden = on; });
    vectorNodes.forEach(node => { node.hidden = !on; });
    $('modeVector').setAttribute('aria-pressed',String(on));
    $('modeSketch').setAttribute('aria-pressed',String(!on));
    if (editor) editor.showDefinition(on,cleanSource);
    else {
      if (on) p5Draft = code.value;
      else vectorDraft = code.value;
      code.value = on ? vectorDraft || cleanSource : p5Draft;
      code.setAttribute('aria-label',on ? 'Vector generator definition' : 'p5 sketch code');
    }
    applyPause(on);
    if (on) update(true);
  }

  function render() {
    raf = 0;
    const shown = proposal?.next ?? definition;
    if (shown === rendered) return;
    geometry = generateGeometry(shown);
    rendered = shown;
    preview.setAttribute('viewBox',viewBox(geometry).join(' '));
    preview.innerHTML = geometryMarkup(geometry);
    $('vector-name').textContent = GENERATORS[shown.generator].name;
    $('vector-info').textContent = `${geometry.length} paths · seed ${shown.seed}`;
  }
  function syncFields() {
    for (const [key,{group,field,range,lock}] of fields) {
      const value = definition[group][key], locked = definition.locks.includes(lock.dataset.key);
      if (field !== document.activeElement) field.value = value;
      if (range) range.value = value;
      lock.setAttribute('aria-pressed',String(locked));
      lock.textContent = locked ? 'Locked' : 'Lock';
    }
    $('vector-seed').value = definition.seed;
    $('vector-color').value = definition.style.color;
  }
  function update(rebuild = false) {
    if (rebuild) buildFields();
    syncFields();
    for (const look of $('vector-look-list').children) {
      const current = look.dataset.generator === definition.generator;
      look.classList.toggle('on',current);
      look.setAttribute('aria-pressed',String(current));
    }
    $('vector-undo').disabled = !past.length;
    $('vector-redo').disabled = !future.length;
    $('vector-studio').textContent = ticket ? 'Update Studio layer' : 'Send to Studio';
    $('vector-cancel').hidden = !ticket;
    if (!raf) raf = requestAnimationFrame(render);
  }

  function remember(before) {
    past.push(before);
    if (past.length > 60) past.shift();
    future.length = 0;
  }
  function setDefinition(next,{history = true,source = false,controls = true} = {}) {
    const changed = json(next) !== json(definition);
    if (changed && history) remember(definition);
    const rebuild = definition.generator !== next.generator;
    definition = next;
    proposal = null;
    $('vector-proposal').hidden = true;
    refreshSource(source);
    error('');
    if (ticket) {
      try { sessionStorage.setItem(STORAGE+':'+ticket,json(definition)); } catch {}
    }
    if (controls) update(rebuild);
    else if (!raf) raf = requestAnimationFrame(render);
  }
  function undo(direction) {
    const [from,to] = direction === 'undo' ? [past,future] : [future,past];
    if (!from.length) return;
    to.push(definition);
    setDefinition(from.pop(),{history:false});
  }

  function buildFields() {
    const list = $('vector-controls');
    list.replaceChildren();
    fields.clear();
    for (const [group,specs] of [['parameters',GENERATORS[definition.generator].parameters],['style',STYLE_CONTROLS]]) {
      for (const [key,spec] of Object.entries(specs)) {
        const row = document.createElement('div');
        row.className = 'vector-field control';
        const field = document.createElement(spec.options ? 'select' : 'input');
        field.id = 'vector-input-'+key;
        const label = document.createElement('label');
        label.htmlFor = field.id;
        label.textContent = spec.label;
        const lockKey = group === 'style' ? 'style.'+key : key;
        const lock = button('Lock',() => {
          const locks = definition.locks.includes(lockKey)
            ? definition.locks.filter(value => value !== lockKey) : [...definition.locks,lockKey];
          setDefinition(applyVectorPatch(definition,{locks}));
        });
        lock.setAttribute('aria-label','Lock '+spec.label);
        lock.dataset.key = lockKey;
        const patch = value => applyVectorPatch(definition,{[group]:{[key]:value}});
        let range;
        if (spec.options) {
          for (const value of spec.options) field.add(new Option(value,value));
          field.onchange = () => setDefinition(patch(field.value));
        } else {
          const limits = {min:spec.min,max:spec.max,step:spec.step};
          Object.assign(field,{type:'number',...limits});
          field.onchange = () => attempt(() => {
            try { setDefinition(patch(field.valueAsNumber)); }
            finally { field.value = definition[group][key]; }
          });
          range = document.createElement('input');
          Object.assign(range,{type:'range',...limits});
          range.setAttribute('aria-label',spec.label+' slider');
          let start;
          range.oninput = () => {
            start ??= definition;
            setDefinition(patch(range.valueAsNumber),{history:false,controls:false});
            field.value = range.value;
          };
          const finish = () => {
            if (start && json(start) !== json(definition)) remember(start);
            start = null;
            update();
          };
          range.onchange = range.onblur = finish;
          range.onpointercancel = finish;
        }
        row.append(label,field,lock);
        if (range) row.append(range);
        fields.set(key,{group,field,range,lock});
        list.append(row);
      }
    }
  }

  function buildLooks() {
    for (const [key,config] of Object.entries(GENERATORS)) {
      const starter = createDefinition(key,definition.id);
      if (key === 'interference') starter.parameters.count = 9;
      const paths = generateGeometry(starter);
      const thumb = document.createElementNS(svgNS,'svg');
      thumb.setAttribute('viewBox',viewBox(paths).join(' '));
      thumb.setAttribute('aria-hidden','true');
      thumb.innerHTML = geometryMarkup(paths.map(path => ({...path,stroke:'currentColor',strokeWidth:5})));
      const look = button(config.name,() => setDefinition(createDefinition(key,definition.id)),'look');
      look.dataset.generator = key;
      look.prepend(thumb);
      $('vector-look-list').append(look);
    }
    for (const [name,key,parameters] of presets) {
      $('vector-presets').append(button(name,() => setDefinition(applyVectorPatch(createDefinition(key,definition.id),{parameters}))));
    }
  }

  function attempt(run) {
    try { return run(); }
    catch (failure) { error(failure.message); }
  }
  function applySource() {
    attempt(() => {
      if (loading) throw Error('Waiting for Studio’s generator.');
      const next = parseDefinition(readSource());
      if (ticket && next.id !== definition.id) throw Error('Keep the generator ID while editing a Studio layer.');
      setDefinition(next,{source:true});
      status('Definition applied.');
    });
  }
  function requireApplied() {
    if (loading) throw Error('Waiting for Studio’s generator.');
    if (!canReplaceSource()) throw Error('Apply or restore the source before continuing.');
  }

  async function sendStudio() {
    if (sending) return;
    try {
      requireApplied();
      sending = true;
      $('vector-studio').disabled = true;
      if (ticket) {
        await returnVector(ticket,definition);
        sessionStorage.removeItem(STORAGE+':'+ticket);
        status('Studio layer updated.');
        window.close();
      } else {
        const {ready} = openVectorTab('studio-app.html',definition);
        await ready;
        status('Vector project opened in Studio.');
      }
    } catch (failure) { error(failure.message); }
    finally { sending = false; $('vector-studio').disabled = false; }
  }

  const box = document.createElement('div');
  box.id = 'vector-proposal';
  box.className = 'segment compact';
  box.hidden = true;
  const description = document.createElement('span');
  box.append(description,button('Apply proposal',() => {
    if (!proposal) return;
    const {next,send} = proposal;
    attempt(() => {
      requireApplied();
      if (send) {
        proposal = null;
        box.hidden = true;
        void sendStudio();
      } else setDefinition(next);
    });
  }),button('Dismiss',() => {
    proposal = null;
    box.hidden = true;
    status('');
    update();
  }));
  $('vector-status-line').append(box);
  const runAgent = createVectorAPI(() => definition,(next,send) => {
    if (loading) throw Error('Waiting for Studio’s generator.');
    if (ticket && next.id !== definition.id) throw Error('A Studio edit must retain its generator ID.');
    switchMode(true);
    proposal = {next,send};
    description.textContent = send ? 'AI request to send vector to Studio' : 'AI proposal preview';
    box.hidden = false;
    update();
    return {status:'awaiting-user',definition:next};
  });
  window.n0vector = Object.freeze({run:runAgent});
  if (search.get('mcp') === 'vector') {
    switchMode(true);
    connectVectorBridge(runAgent,status);
  }

  $('modeSketch').addEventListener('click',() => switchMode(false));
  $('modeVector').addEventListener('click',() => switchMode(true));
  $('vector-actions').onclick = event => {
    const name = event.target.closest('button')?.dataset.vectorDrawer;
    if (name) showDrawer(name === drawer ? null : name);
  };
  $('vector-undo').onclick = () => undo('undo');
  $('vector-redo').onclick = () => undo('redo');
  $('vector-variation').onclick = () => setDefinition(createVectorVariation(definition));
  $('vector-random').onclick = () => setDefinition(createVectorVariation(definition,definition.seed));
  $('vector-reset').onclick = () => {
    const reset = createDefinition(definition.generator,definition.id);
    setDefinition({...reset,seed:definition.seed,locks:definition.locks,style:{...reset.style,color:definition.style.color}});
  };
  $('vector-seed').onchange = event => attempt(() => {
    try { setDefinition(applyVectorPatch(definition,{seed:event.target.valueAsNumber})); }
    finally { event.target.value = definition.seed; }
  });
  $('vector-color').oninput = event => setDefinition(applyVectorPatch(definition,{style:{color:event.target.value}}));
  $('vector-paper').onchange = event => $('vector-preview').classList.toggle('light',event.target.checked);
  $('vector-apply').onclick = applySource;
  $('vector-restore').onclick = () => { refreshSource(true); error(''); status('Current definition restored.'); };
  $('vector-save').onclick = () => attempt(() => {
    requireApplied();
    download(definition.generator+'.n0vector.json',json(definition),'application/json');
    if (!ticket) {
      try { localStorage.setItem(STORAGE,json(definition)); } catch {}
    }
    status('Vector project downloaded.');
  });
  $('vector-open').onclick = () => $('vector-file').click();
  $('vector-file').onchange = async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      requireApplied();
      if (file.size > MAX_DEFINITION_LENGTH) throw Error('Vector definition exceeds 16 KB.');
      const before = definition;
      const next = parseDefinition(await file.text());
      if (before !== definition || !active) throw Error('The generator changed while opening the file. Open it again.');
      requireApplied();
      setDefinition(ticket ? {...next,id:definition.id} : next,{source:true});
      status('Vector project opened.');
    } catch (failure) { error(failure.message); }
  };
  $('vector-svg').onclick = () => attempt(() => {
    requireApplied();
    download(definition.generator+'.svg',exportVectorSVG(definition),'image/svg+xml');
  });
  $('vector-copy').onclick = async () => {
    try {
      requireApplied();
      await navigator.clipboard.writeText(json(definition));
      status('Definition copied.');
    } catch (failure) { error(failure.message); }
  };
  $('vector-studio').onclick = sendStudio;
  $('vector-cancel').onclick = () => {
    try { sessionStorage.removeItem(STORAGE+':'+ticket); } catch {}
    window.close();
  };
  document.addEventListener('keydown',event => {
    if (!active || event.defaultPrevented || !(event.ctrlKey || event.metaKey) ||
      event.key.toLowerCase() !== 'z' || event.target.closest('.cm-editor,textarea,input')) return;
    event.preventDefault();
    undo(event.shiftKey ? 'redo' : 'undo');
  });
  buildLooks();
  showDrawer('looks');
  $('modeVector').disabled = false;
  if (ticket) {
    switchMode(true);
    showDrawer('params');
    if (loading) takeVector(ticket,'studio-vector').then(next => {
      loading = false;
      setDefinition(next,{history:false,source:true});
      status('Edit the Studio layer, then choose Update Studio layer in Export.');
    }).catch(failure => {
      loading = false;
      ticket = null;
      update();
      error(failure.message);
    });
  } else if (search.has('vector')) switchMode(true);
  return {get active() { return active; },applySource};
}
