import * as T from './vendor/three.mjs';
import * as engine from '../src/engine.js';
import {effects,effectValues,effectService} from './effects.mjs';

export {effects,effectValues};

const degree = Math.PI/180;
const targetOptions = {depthBuffer:true,minFilter:T.LinearFilter,magFilter:T.LinearFilter};
const blit = engine.HEAD+`
uniform sampler2D uSrc;
uniform float uEncode;
vec3 encode(vec3 c) {
  return mix(c*12.92,1.055*pow(max(c,0.),vec3(1./2.4))-.055,step(vec3(.0031308),c));
}
void main(){
  vec4 c=texture(uSrc,vUv);
  o=vec4(uEncode>.5?encode(c.rgb):c.rgb,c.a);
}`;

function canvas2d(w,h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

export function createRuntime(canvas,onChange,onError) {
  let hardware, spatialLayer, dragStart, disposed = false;
  let visible = new Set();
  const cache = new Map(), errors = new Map();
  const graph = StudioGraph;

  function init() {
    if (hardware) return hardware;
    if (disposed) throw Error('The Studio renderer has been released.');
    const renderer = new T.WebGLRenderer({
      canvas,alpha:true,premultipliedAlpha:false,antialias:true,preserveDrawingBuffer:true
    });
    renderer.setClearColor(0,0);
    const gl = renderer.getContext();
    engine.attachGL(canvas,null,gl);
    const scene = new T.Scene();
    scene.add(new T.HemisphereLight(0xffffff,0x44444a,.35));
    const key = new T.DirectionalLight(0xffffff,1.5);
    key.position.set(3,5,4);
    const rim = new T.DirectionalLight(0xaab8ff,.5);
    rim.position.set(-4,2,-3);
    scene.add(key,rim);
    const room = new T.RoomEnvironment(), pmrem = new T.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(room,.04);
    room.dispose();
    pmrem.dispose();
    scene.environment = environment.texture;
    scene.environmentIntensity = 1.45;
    const camera = new T.PerspectiveCamera(42,1,.05,200);
    camera.position.set(0,0,3.55);
    camera.lookAt(0,0,0);
    const material = new T.MeshStandardMaterial();
    const mesh = new T.Mesh(new T.TorusGeometry(.7,.28,32,64),material);
    scene.add(mesh);

    const controls = new T.TransformControls(camera);
    controls.setMode('rotate');
    controls.setSize(.8);
    const helper = controls.getHelper();
    scene.add(helper);
    helper.visible = false;
    controls.addEventListener('mouseDown',() => {
      dragStart = spatialLayer?.asset.transform.rotation.slice();
    });
    controls.addEventListener('objectChange',() => {
      if (!spatialLayer) return;
      spatialLayer.asset.transform.rotation = mesh.rotation.toArray().slice(0,3);
      spatialFrame();
    });
    controls.addEventListener('mouseUp',() => {
      if (spatialLayer && dragStart) onChange(dragStart);
      dragStart = null;
    });

    const vao = gl.createVertexArray(), upload = gl.createTexture();
    const program = engine.mkProg(engine.VS,blit);
    for (const shader of gl.getAttachedShaders(program.p)) {
      gl.detachShader(program.p,shader);
      gl.deleteShader(shader);
    }
    hardware = {
      renderer,gl,scene,camera,mesh,material,environment,controls,helper,vao,upload,program,
      service:effectService(gl),target:null,targets:[],size:'',meshKey:'',sceneKey:'',sceneTexture:null
    };
    return hardware;
  }

  function supportedAsset(asset) {
    return asset?.format === 'studio-scene' && asset.version === 1 &&
      asset.geometry?.kind === 'torus' && asset.material?.kind === 'metal';
  }

  function setMesh(h,asset) {
    if (!supportedAsset(asset)) throw Error('Scene asset requires an unavailable adapter.');
    const g = asset.geometry, m = asset.material;
    const limits = (n,d,min,max) => Number.isFinite(n) ? Math.min(max,Math.max(min,n)) : d;
    const args = [limits(g.radius,.7,.05,2),limits(g.tube,.28,.02,1),
      Math.round(limits(g.radialSegments,32,8,128)),Math.round(limits(g.tubularSegments,64,8,128))];
    const key = args.join(',');
    if (key !== h.meshKey) {
      h.mesh.geometry.dispose();
      h.mesh.geometry = new T.TorusGeometry(...args);
      h.meshKey = key;
    }
    h.material.color.set(/^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#d8d6cf');
    h.material.roughness = limits(m.roughness,.21,.03,1);
    h.material.metalness = limits(m.metalness,1,0,1);
    h.mesh.rotation.set(...asset.transform.rotation,'XYZ');
    h.mesh.updateMatrixWorld(true);
  }

  function resize(h,w,height) {
    const size = w+'x'+height;
    if (size === h.size) return;
    h.target?.dispose();
    for (const target of h.targets) engine.freeRT(target);
    h.targets = [];
    h.target = null;
    h.sceneKey = '';
    h.sceneTexture = null;
    h.renderer.setSize(w,height,false);
    h.camera.aspect = w/height;
    h.camera.zoom = Math.min(1,w/height);
    h.camera.updateProjectionMatrix();
    h.size = size;
  }

  function sceneTexture(h,asset,w,height) {
    const key = JSON.stringify(asset);
    if (key === h.sceneKey) return h.sceneTexture;
    h.target ??= new T.WebGLRenderTarget(w,height,targetOptions);
    setMesh(h,asset);
    h.helper.visible = false;
    h.renderer.setRenderTarget(h.target);
    h.renderer.render(h.scene,h.camera);
    const {gl} = h;
    h.sceneTexture = gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME);
    h.renderer.setRenderTarget(null);
    h.sceneKey = key;
    return h.sceneTexture;
  }

  function beginRaw(h) {
    const {gl} = h;
    h.renderer.resetState();
    gl.bindVertexArray(h.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true,true,true,true);
  }

  function copyTexture(h,source,target,encode = false) {
    engine.bindRT(target);
    h.program.use();
    h.program.f('uEncode',encode ? 1 : 0);
    engine.samp(h.program,'uSrc',0,source);
    engine.draw();
    return target?.tex;
  }

  function upload(h,source) {
    const {gl} = h;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,h.upload);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    try {
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,source);
    } finally { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); }
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return h.upload;
  }

  function renderLayer(layer,doc,w,height,raster,resourceKey = raster) {
    visible.add(layer.id);
    const context = {
      width:w,height,time:doc.time,fps:doc.fps,frame:Math.round(doc.time*doc.fps),
      seed:doc.seed,quality:'full',signal:lifetime.signal
    };
    let plan, warning = '';
    try {
      plan = graph.plan(layer.chain);
      if (plan.some(({node}) => node.type === 'effect' && !effects.has(node.params.effect))) {
        throw Error('A saved effect is unavailable. Its settings are preserved.');
      }
    } catch (e) {
      warning = e.message;
      plan = graph.plan(graph.create(layer.type));
    }
    const signature = JSON.stringify([
      context.width,context.height,context.time,context.fps,context.seed,layer.asset,warning,
      plan.map(({node,inputs}) => [node.id,node.type,node.params,inputs])
    ]);
    const previous = cache.get(layer.id);
    if (previous?.signature === signature && previous.source === resourceKey) {
      cache.delete(layer.id);
      cache.set(layer.id,previous);
      return previous.canvas;
    }

    let result = null;
    try {
      if (context.signal.aborted) return null;
      const h = init();
      resize(h,w,height);
      const source = layer.type === 'scene' ? sceneTexture(h,layer.asset,w,height) : null;
      beginRaw(h);
      try {
        const targets = h.targets;
        if (!targets.length) targets.push(engine.mkRT(w,height),engine.mkRT(w,height));
        const outputs = new Map();
        let i = 0;
        for (const {node,inputs} of plan) {
          if (node.type === 'scene') outputs.set(node.id,copyTexture(h,source,targets[i++%2],true));
          else if (node.type === 'layer') outputs.set(node.id,raster());
          else if (node.type === 'upload') outputs.set(node.id,upload(h,outputs.get(inputs.input)));
          else if (node.type === 'effect') {
            outputs.set(node.id,h.service.apply(node.params.effect,node.params.values,outputs.get(inputs.input),targets[i++%2],context));
          } else if (node.type === 'output') copyTexture(h,outputs.get(inputs.input),null);
        }
        result = previous?.canvas ?? canvas2d(w,height);
        if (result.width !== w) result.width = w;
        if (result.height !== height) result.height = height;
        const ctx = result.getContext('2d');
        ctx.clearRect(0,0,w,height);
        ctx.drawImage(canvas,0,0);
      } finally { h.renderer.resetState(); }
    } catch (e) {
      warning = e.message;
    }
    errors.set(layer.id,warning);
    if (result) {
      cache.set(layer.id,{signature,canvas:result,source:resourceKey});
      while (cache.size > 4) cache.delete(cache.keys().next().value);
    }
    return result;
  }

  function spatialFrame() {
    if (!spatialLayer || !hardware) return;
    const h = hardware;
    h.renderer.setRenderTarget(null);
    h.renderer.render(h.scene,h.camera);
  }

  function enter(layer,w,height) {
    try {
      const h = init();
      resize(h,w,height);
      const wasInSpatial = !!spatialLayer;
      spatialLayer = layer;
      if (!wasInSpatial) {
        h.controls.connect(canvas);
        h.controls.attach(h.mesh);
      }
      setMesh(h,layer.asset);
      h.helper.visible = true;
      spatialFrame();
      return true;
    } catch (e) {
      exit();
      onError(e.message);
      return false;
    }
  }

  function exit() {
    if (!spatialLayer) return;
    spatialLayer = null;
    dragStart = null;
    hardware.controls.detach();
    hardware.controls.disconnect();
    hardware.helper.visible = false;
  }

  function setRotation(layer,axis,value) {
    if (!supportedAsset(layer.asset)) return;
    layer.asset.transform.rotation[axis] = value*degree;
    if (spatialLayer && hardware) {
      spatialLayer = layer;
      setMesh(hardware,layer.asset);
      spatialFrame();
    }
  }

  const lifetime = new AbortController();
  function dispose() {
    if (disposed) return;
    disposed = true;
    lifetime.abort();
    cache.clear();
    errors.clear();
    exit();
    const h = hardware;
    if (!h) return;
    h.controls.dispose();
    h.target?.dispose();
    h.environment.dispose();
    h.mesh.geometry.dispose();
    h.material.dispose();
    for (const target of h.targets) engine.freeRT(target);
    h.service.dispose();
    h.gl.deleteProgram(h.program.p);
    h.gl.deleteVertexArray(h.vao);
    h.gl.deleteTexture(h.upload);
    h.renderer.dispose();
    h.renderer.forceContextLoss();
    hardware = null;
  }

  return {
    enter,exit,setRotation,supportedAsset,renderLayer,dispose,
    begin() { visible = new Set(); },
    end() {
      for (const id of cache.keys()) if (!visible.has(id)) cache.delete(id);
      for (const id of errors.keys()) if (!visible.has(id)) errors.delete(id);
      return [...errors.values()].filter(Boolean);
    }
  };
}
