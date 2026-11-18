'use strict';

const StudioGraph = (() => {
  const portTypes = Object.freeze(['image','texture','mask','geometry','scene','material','number','color','signal']);
  const schema = Object.freeze({
    scene: {inputs:{},outputs:{frame:'texture'}},
    layer: {inputs:{},outputs:{frame:'image'}},
    upload: {inputs:{input:'image'},outputs:{frame:'texture'}},
    effect: {inputs:{input:'texture'},outputs:{frame:'texture'}},
    output: {inputs:{input:'texture'},outputs:{}}
  });
  function node(id,type,x,y,params = {}) {
    return {id,type,version:1,x,y,params};
  }
  function create(layerType) {
    const spatial = layerType === 'scene';
    const nodes = [node('source',spatial ? 'scene' : 'layer',36,52)];
    if (!spatial) nodes.push(node('upload','upload',218,52));
    nodes.push(node('output','output',400,52));
    const edges = nodes.slice(1).map((n,i) => ({from:nodes[i].id,out:'frame',to:n.id,in:'input'}));
    return {version:1,nodes,edges};
  }
  function connection(g, from, to, out = 'frame', input = 'input') {
    if (from === to) return 'A node cannot connect to itself.';
    const a = g.nodes.find(n => n.id === from), b = g.nodes.find(n => n.id === to);
    const source = schema[a?.type]?.outputs[out], destination = schema[b?.type]?.inputs[input];
    if (!source || !destination || source !== destination) return 'Choose a compatible output and input.';
    const edges = g.edges.filter(e => e.to !== to || e.in !== input);
    const seen = new Set(), queue = [to];
    while (queue.length) {
      const id = queue.pop();
      if (id === from) return 'That connection would create a cycle.';
      if (seen.has(id)) continue;
      seen.add(id);
      for (const e of edges) if (e.from === id) queue.push(e.to);
    }
    return null;
  }
  function connect(g,from,to,out = 'frame',input = 'input') {
    const error = connection(g,from,to,out,input);
    if (error) return error;
    g.edges = g.edges.filter(e => e.to !== to || e.in !== input);
    g.edges.push({from,out,to,in:input});
    return null;
  }
  function normalize(g,layerType) {
    if (!g) return create(layerType);
    if (g.version !== 1 || !Array.isArray(g.nodes) || !Array.isArray(g.edges) ||
      g.nodes.length > 64 || g.edges.length > 256) throw Error('Unsupported Studio graph.');
    const ids = new Set();
    const nodes = g.nodes.map(n => {
      if (!n || typeof n.id !== 'string' || !n.id || ids.has(n.id) ||
        typeof n.type !== 'string' || !Number.isInteger(n.version) ||
        !Number.isFinite(n.x) || !Number.isFinite(n.y) || !n.params ||
        typeof n.params !== 'object' || Array.isArray(n.params)) throw Error('Invalid Studio node.');
      ids.add(n.id);
      return {id:n.id,type:n.type,version:n.version,x:n.x,y:n.y,params:n.params};
    });
    if (!nodes.some(n => n.id === 'output' && n.type === 'output') ||
      !nodes.some(n => n.id === 'source' && n.type === (layerType === 'scene' ? 'scene' : 'layer'))) {
      throw Error('This graph is missing its layer input or output.');
    }
    const graph = {version:1,nodes,edges:[]};
    for (const e of g.edges) {
      if (!e || !ids.has(e.from) || !ids.has(e.to) || typeof e.out !== 'string' || typeof e.in !== 'string' ||
        graph.edges.some(other => other.to === e.to && other.in === e.in)) throw Error('Invalid Studio connection.');
      const a = nodes.find(n => n.id === e.from), b = nodes.find(n => n.id === e.to);
      // Keep references to unavailable versions or adapters for later recovery.
      if (!Object.hasOwn(schema,a.type) || !Object.hasOwn(schema,b.type) || a.version !== 1 || b.version !== 1) {
        graph.edges.push({...e});
        continue;
      }
      const error = connect(graph,e.from,e.to,e.out,e.in);
      if (error) throw Error(error);
    }
    // Check cycles even when an unavailable adapter's port declarations cannot be inspected.
    const visiting = new Set(), checked = new Set();
    function validate(id) {
      if (visiting.has(id)) throw Error('Graph contains a cycle.');
      if (checked.has(id)) return;
      visiting.add(id);
      for (const e of graph.edges) if (e.to === id) validate(e.from);
      visiting.delete(id);
      checked.add(id);
    }
    for (const {id} of nodes) validate(id);
    return graph;
  }

  function plan(g,output = 'output') {
    const nodes = new Map(g.nodes.map(n => [n.id,n]));
    const incoming = new Map(g.edges.map(e => [e.to+':'+e.in,e]));
    const visiting = new Set(), ordered = new Map();
    function visit(id) {
      if (visiting.has(id)) throw Error('Graph contains a cycle.');
      if (ordered.has(id)) return;
      const n = nodes.get(id);
      if (!n || !Object.hasOwn(schema,n.type) || n.version !== 1) throw Error('A graph adapter is unavailable.');
      visiting.add(id);
      const inputs = Object.create(null);
      for (const name of Object.keys(schema[n.type].inputs)) {
        const e = incoming.get(id+':'+name);
        if (!e) throw Error('The layer graph has a disconnected input.');
        const parent = nodes.get(e.from);
        if (schema[parent?.type]?.outputs[e.out] !== schema[n.type].inputs[name]) throw Error('Graph port types differ.');
        visit(e.from);
        inputs[name] = e.from;
      }
      visiting.delete(id);
      ordered.set(id,{node:n,inputs});
    }
    visit(output);
    return [...ordered.values()];
  }
  function insertEffect(g, id, effect, params) {
    if (g.nodes.length >= 64) throw Error('This layer graph has reached its 64-node limit.');
    const output = g.nodes.find(n => n.id === 'output');
    const predecessor = g.edges.find(e => e.to === output.id);
    const left = g.nodes.find(n => n.id === predecessor?.from)?.x;
    const roomy = Number.isFinite(left) && output.x-left >= 350;
    const x = roomy ? (left+output.x)/2 : output.x;
    const n = node(id,'effect',x,output.y,{effect,values:params});
    g.nodes.push(n);
    if (!roomy) output.x += 180;
    if (predecessor) {
      const error = connect(g,predecessor.from,n.id,predecessor.out);
      if (error) g.edges = g.edges.filter(e => e.to !== output.id);
    }
    connect(g,n.id,output.id);
    return n;
  }
  return {portTypes,schema,create,connection,connect,normalize,plan,insertEffect};
})();
