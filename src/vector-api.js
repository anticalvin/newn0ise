import {applyVectorPatch,createDefinition,createVectorVariation,exportVectorSVG,validateDefinition,vectorId} from './vector-generator.js';

const descriptions = {
  getVectorDocument:'Read the current generator.',
  createVectorGenerator:'Propose a new generator by family (generator).',
  setVectorParameters:'Propose a parameter merge (parameters).',
  createVectorVariation:'Propose a variation (optional seed).',
  duplicateVectorGenerator:'Propose a copy with a new identity.',
  applyVectorPatch:'Propose a patch to seed, parameters, style or locks (patch).',
  exportVectorSVG:'Read SVG for the current generator.',
  sendVectorToStudio:'Request human confirmation to send the current generator to Studio.'
};

export function createVectorAPI(read, propose) {
  return function run(command) {
    const current = read();
    switch (command?.cmd) {
      case 'describe': return descriptions;
      case 'getVectorDocument': return validateDefinition(current);
      case 'createVectorGenerator': return propose(createDefinition(command.generator,current.id));
      case 'setVectorParameters': return propose(applyVectorPatch(current,{parameters:command.parameters}));
      case 'createVectorVariation': return propose(createVectorVariation(current,command.seed));
      case 'duplicateVectorGenerator': return propose(validateDefinition({...current,id:vectorId()}));
      case 'applyVectorPatch': return propose(applyVectorPatch(current,command.patch));
      case 'exportVectorSVG': return exportVectorSVG(current);
      case 'sendVectorToStudio': return propose(current,true);
      default: throw Error('Unknown vector command. Run describe for the list.');
    }
  };
}

// Opt-in client for the existing local MCP bridge. Mutations only stage previews.
export function connectVectorBridge(run, status) {
  const socket = new WebSocket('ws://localhost:8787/vector');
  socket.onopen = () => status('AI bridge connected.');
  socket.onclose = () => status('AI bridge disconnected.');
  socket.onmessage = event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.id == null) return;
    let response;
    try { response = {result:run(message.args?.command)}; }
    catch (error) { response = {error:error.message}; }
    socket.send(JSON.stringify({id:message.id,...response}));
  };
}
