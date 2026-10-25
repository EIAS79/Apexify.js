import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createCanvas } from '@napi-rs/canvas';
import { ApexPainter } from '../lib-next/apex-painter/main';
import { paintChartCanvasBackground } from '../lib-next/chart/helpers/chartBackground';
import { applyShadow } from '../lib-next/render/shadow-renderer';
import { validateCanvasConfig, validatePatternOptions } from '../lib-next/canvas/canvas-validation';

const api = new ApexPainter('png');
const digest = (raw: Buffer | Uint8Array) => createHash('sha256').update(raw).digest('hex');
const canvasDigest = async (cfg: Record<string,unknown>) => {
  const out = await api.createCanvas({width:192,height:144,...cfg} as any);
  return digest(await sharp(out.buffer).ensureAlpha().raw().toBuffer());
};
const colors = {color:'#a323cf',secondaryColor:'#35ffc1',size:15,spacing:17};
const kinds = ['grid','dots','diagonal','stripes','waves','crosses','hexagons','checkerboard','diamonds','triangles','stars','polka'] as const;
const modes = ['repeat','repeat-x','repeat-y','no-repeat'] as const;

test('S20 native pixels: both public repeat paths, 12 procedural types, four values and unchanged omitted/default',async()=>{
 let verified=0;
 for(const kind of kinds)for(const place of ['root','layer'] as const){
   const hashes: Record<string,string> = {};
   for(const mode of modes){
     const pattern={...colors,type:kind,repeat:mode};
     const cfg = place==='root' ? {colorBg:'#fff7dc',patternBg:pattern} : {colorBg:'#fff7dc',bgLayers:[{type:'presetPattern',pattern}]};
     hashes[mode] = await canvasDigest(cfg);
   }
   const pattern={...colors,type:kind};
   const cfg = place==='root' ? {colorBg:'#fff7dc',patternBg:pattern} : {colorBg:'#fff7dc',bgLayers:[{type:'presetPattern',pattern}]};
   assert.equal(await canvasDigest(cfg),hashes.repeat,kind+' '+place+' omitted repeat must preserve default raster');
   assert.equal(new Set(Object.values(hashes)).size,4,kind+' '+place+' all four repeat semantics must visibly differ');
   verified++;
 }
 assert.equal(verified,24);
 console.log('S20_NATIVE_REPEAT_VARIANTS_24_GROUPS_X4=96;OMITTED_DEFAULT_IDENTICAL_24=TRUE');
});

test('S20 pinned root and ordered-layer unmodified repeat golden hashes preserved',async()=>{
 for(const place of ['root','layer'] as const){
   const pattern={type:'grid',size:22,spacing:18,color:'#fa419b',secondaryColor:'#35b2ea'};
   const c=place==='root'?{colorBg:'#f0d778',patternBg:pattern}:{colorBg:'#f0d778',bgLayers:[{type:'presetPattern',pattern}]};
   const pinnedSizeOutput=await api.createCanvas({width:256,height:192,...c} as any);
   assert.equal(digest(await sharp(pinnedSizeOutput.buffer).ensureAlpha().raw().toBuffer()),'e801dd9a4fa3ab3c54d44a22a34b75084d4061f0d0dc3d3e8ae8646d91b461f1');
 }
 console.log('S20_PINNED_GOLDEN_DEFAULT_GRID_PIXELS_IDENTICAL=TRUE');
});

test('S20 native shadow radius explicit override, fallback, clipping and deprecated alias precedence',async()=>{
 const sh={color:'#fc487c',opacity:1,offsetX:0,offsetY:0,blur:0};
 const make=(shadow:object,rootRadius:number|string=0) => canvasDigest({transparentBase:true,borderRadius:rootRadius,shadow:{...sh,...shadow}});
 const radii = await Promise.all([0,24,66,'circular'].map(borderRadius=>make({borderRadius})));
 assert.ok(new Set(radii).size>=3);
 for(const inherited of [0,24,66] as const)
   assert.equal(await make({},inherited),await make({borderRadius:inherited},inherited),'Unspecified shadow radius preserves owning radius');
 const alias:Record<string,string>={};
 for(const borderPosition of ['all','top','left','bottom-right'] as const)
   alias[borderPosition] = await make({borderPosition,color:'#f04375'},53);
 assert.ok(new Set(Object.values(alias)).size>=3);
 assert.equal(await make({borderPosition:'all',roundedCorners:'top'},53),await make({roundedCorners:'top'},53));
 assert.equal(await make({},53),await make({borderPosition:'all'},53),'Legacy default equivalent to all corners');
 console.log('S20_SHADOW_RADIUS_SHAPES_DISTINCT='+new Set(radii).size+';LEGACY_POSITIONS_DISTINCT='+new Set(Object.values(alias)).size);
});

test('S20 validation: existing allowed enums, nonfinite/negative radius, malformed repeat fail closed',()=>{
 for(const mode of modes){
   assert.doesNotThrow(()=>validatePatternOptions({type:'dots',repeat:mode,size:12,spacing:6}));
   assert.doesNotThrow(()=>validateCanvasConfig({width:192,height:144,bgLayers:[{type:'presetPattern',pattern:{type:'grid',repeat:mode}}]}));
 }
 for(const borderRadius of [0,16,'circular'] as const)
   assert.doesNotThrow(()=>validateCanvasConfig({width:192,height:144,shadow:{borderRadius}}));
 for(const value of [NaN,Infinity,-Infinity,-1,-200])
   assert.throws(()=>validateCanvasConfig({width:192,height:144,shadow:{borderRadius:value}}),/borderRadius|finite|0/);
 for(const bad of ['bad','repeat-xy','reflect'] as const)
   assert.throws(()=>validatePatternOptions({type:'grid',repeat:bad as any}),/repeat/);
 assert.doesNotThrow(()=>validateCanvasConfig({width:192,height:144,shadow:{roundedCorners:'top',borderPosition:'bottom-right'}}));
});

test('S20 Chart: shared procedural renderer native pixels and omitted repeat compatible',async()=>{
 const render = async (repeat?:typeof modes[number]) => {
  const c=createCanvas(192,144);const ctx=c.getContext('2d');
  await paintChartCanvasBackground(ctx,c,192,144,{backgroundColor:'#fff7dc',patternBg:{...colors,type:'dots',...(repeat?{repeat}:{})}} as any);
  return digest(Buffer.from(ctx.getImageData(0,0,192,144).data));
 };
 const hashes=await Promise.all(modes.map(v=>render(v)));
 assert.equal(new Set(hashes).size,4,'Chart background must preserve all directional pattern repeat effects');
 assert.equal(await render(),hashes[0],'Chart background unspecified repeat identical to explicit repeat');
 console.log('S20_SHARED_CHART_PATTERN_REPEAT_DISTINCT=4');
});

test('S20 Image: shared shadow helper first-overload and public image keep legacy defaults',async()=>{
 const draw=(shadow:Record<string,any>)=>{
  const c=createCanvas(160,128);const ctx=c.getContext('2d');
  applyShadow(ctx,{x:14,y:12,w:96,h:74} as any,shadow as any);
  return digest(Buffer.from(ctx.getImageData(0,0,160,128).data));
 };
 const common={color:'#f04375',offsetX:5,offsetY:6,opacity:1,blur:0};
 assert.equal(draw(common),draw({...common,borderRadius:0}),'Image shadow default no radius unchanged');
 assert.equal(draw({...common,borderRadius:14}),draw({...common,borderRadius:14,borderPosition:'all'}),'Image corner default unchanged');
 assert.equal(draw({...common,borderPosition:'top',roundedCorners:'right'}),draw({...common,roundedCorners:'right'}),'Image roundedCorners precedence remains consistent');
 const imageSource=(await api.createCanvas({width:64,height:48,colorBg:'#58b4e0'})).buffer;
 const base=(await api.createCanvas({width:160,height:128,transparentBase:true})).buffer;
 const withShadow={color:'#f04375',offsetX:8,offsetY:8,opacity:1,blur:0};
 const render=async(shadow:Record<string,any>)=>
  digest(await sharp(await api.createImage({source:imageSource,x:18,y:22,width:72,height:54,shadow} as any,base)).ensureAlpha().raw().toBuffer());
 assert.equal(await render(withShadow),await render({...withShadow,borderRadius:0}));
 assert.equal(await render({...withShadow,roundedCorners:'top'}),await render({...withShadow,roundedCorners:'top',borderPosition:'bottom'}));
 console.log('S20_IMAGE_DIRECT_AND_PUBLIC_RENDERER_DEFAULTS_PRESERVED=TRUE');
});



test('S20 excluded gradient-angle adapter: pinned linear/radial pattern angle remains unchanged',async()=>{
 const colors=[{stop:0,color:'#fc1b62'},{stop:0.5,color:'#15eb96'},{stop:1,color:'#396eff'}];
 for(const kind of ['linear','radial'] as const){
   for(const place of ['root','layer'] as const){
     const gradient=kind==='linear'
       ? {type:kind,colors,startX:12,startY:14,endX:131,endY:34}
       : {type:kind,colors,startX:31,startY:17,endX:105,endY:94,startRadius:0,endRadius:82};
     const cfg=(angle:number)=> {
       const pattern={type:'grid',size:18,spacing:13,gradient:{...gradient,angle}};
       return place==='root'?{colorBg:'#1847b5',patternBg:pattern}:{colorBg:'#1847b5',bgLayers:[{type:'presetPattern',pattern}]};
     };
     assert.equal(await canvasDigest(cfg(0)),await canvasDigest(cfg(110)),'S19 gradient angle must not be active in safe subset '+kind+' '+place);
   }
 }
 console.log('S20_EXCLUDED_GRADIENT_ANGLE_FAMILIES=4_UNCHANGED');
});