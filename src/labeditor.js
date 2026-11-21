/* Lab's code editor: CodeMirror 6 with p5 completions. Bundled into assets/labeditor.js so it works offline and there is only one copy of
   the editor core. lab.html falls back to its plain textarea if this file can't load. */
import {basicSetup} from 'codemirror';
import {EditorView,keymap,Decoration} from '@codemirror/view';
import {EditorState,StateField,StateEffect,Transaction,Prec} from '@codemirror/state';
import {javascript,javascriptLanguage} from '@codemirror/lang-javascript';
import {oneDark} from '@codemirror/theme-one-dark';
import {completeFromList} from '@codemirror/autocomplete';
import {indentMore,indentLess} from '@codemirror/commands';
const P5=('setup draw createCanvas resizeCanvas background fill stroke noStroke noFill strokeWeight rect ellipse circle line point triangle quad arc square bezier curve beginShape vertex endShape push pop translate rotate scale '+
  'random randomSeed noise noiseSeed map lerp lerpColor constrain dist sin cos tan atan2 floor ceil round abs sqrt pow min max frameCount width height mouseX mouseY mouseIsPressed colorMode color hue saturation brightness '+
  'createVector createGraphics loadImage image text textSize textFont textAlign pixelDensity noLoop loop millis frameRate blendMode drawingContext PI TWO_PI HALF_PI HSB RGB CENTER CORNER windowWidth windowHeight '+
  'loadPixels updatePixels pixels get set copy fill erase noErase curveVertex bezierVertex rectMode ellipseMode angleMode radians degrees lum px rgbc').split(' ');
const PARAMS=['params.speed','params.density','params.scale','params.hue','params.sat','params.bright','params.trail'];
const complete=javascriptLanguage.data.of({autocomplete:completeFromList([...P5.map(l=>({label:l,type:/^[A-Z_]+$/.test(l)?'constant':'function'})),...PARAMS.map(l=>({label:l,type:'property',detail:'slider'}))])});
const setErr=StateEffect.define();
const errField=StateField.define({
  create:()=>Decoration.none,
  update(v,tr){
    for(const e of tr.effects)if(e.is(setErr)){const n=e.value;if(!n||n<1||n>tr.state.doc.lines)return Decoration.none;return Decoration.set([Decoration.line({class:'cm-errline'}).range(tr.state.doc.line(n).from)]);}
    return tr.docChanged?Decoration.none:v;
  },
  provide:f=>EditorView.decorations.from(f)
});
export function createEditor(parent,{doc,onRun,onChange,definition = false}){
  let trap=true;
  const theme=EditorView.theme({
    '&':{height:'100%',backgroundColor:'#121316',fontSize:'12.5px'},
    '.cm-scroller':{fontFamily:'ui-monospace,SFMono-Regular,Consolas,monospace',lineHeight:'1.7',overflow:'auto'},
    '.cm-gutters':{backgroundColor:'#121316',borderRight:'1px solid #1d2020',color:'#5b6360'},
    '.cm-activeLine,.cm-activeLineGutter':{backgroundColor:'rgba(232,209,182,.06)'},
    '&.cm-focused':{outline:'2px solid rgba(233,223,203,.6)',outlineOffset:'-2px'},
    '.cm-errline':{backgroundColor:'rgba(255,90,60,.2)',boxShadow:'inset 3px 0 0 #ff5a3c'},
    '.cm-content':{caretColor:'#e8d1b6'},
    '.cm-tooltip':{maxWidth:'90vw'}
  },{dark:true});
  const makeState=(doc,definition)=>EditorState.create({doc,extensions:[
    Prec.highest(keymap.of([
      {key:'Mod-Enter',run:()=>{onRun&&onRun();return true;}},
      {key:'Escape',run:()=>{trap=false;return false;}},
      {key:'Tab',run:v=>trap?indentMore(v):false,shift:v=>trap?indentLess(v):false}
    ])),
    basicSetup,javascript(),definition ? [] : complete,oneDark,theme,EditorView.lineWrapping,errField,
    EditorView.contentAttributes.of({'aria-label':definition ? 'Vector generator definition' : 'p5 sketch code',spellcheck:'false',autocapitalize:'off',autocorrect:'off'}),
    EditorView.domEventHandlers({blur:()=>{trap=true;}}),
    EditorView.updateListener.of(u=>{if(u.docChanged&&onChange)onChange();})
  ]});
  const view=new EditorView({parent,state:makeState(doc,definition)});
  let sketchState, vectorState, showingVector = definition;
  return {
    showDefinition(on,source){
      if(on === showingVector)return;
      if(on)sketchState=view.state;else vectorState=view.state;
      view.setState(on ? vectorState ?? makeState(source,true) : sketchState);
      showingVector=on;
    },
    view,
    get:()=>view.state.doc.toString(),
    set(v,{addToHistory = true} = {}){view.dispatch({annotations:Transaction.addToHistory.of(addToHistory),changes:{from:0,to:view.state.doc.length,insert:String(v)},selection:{anchor:0},scrollIntoView:true});},
    setError(n){view.dispatch({effects:setErr.of(n||null)});if(n&&n<=view.state.doc.lines){const l=view.state.doc.line(n);view.dispatch({effects:EditorView.scrollIntoView(l.from,{y:'center'})});}},
    lines:()=>view.state.doc.lines,
    focus:()=>view.focus(),
    selectAll:()=>view.dispatch({selection:{anchor:0,head:view.state.doc.length}})
  };
}
