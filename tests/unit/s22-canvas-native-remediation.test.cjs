'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const sharp=require('sharp');
const {ApexPainter}=require('../../dist/cjs/index.cjs');
const painter=new ApexPainter({type:'buffer'});
const W=160,H=126;
const colors=[{stop:0,color:'#fa1459'},{stop:0.19,color:'#11ed9e'},{stop:0.56,color:'#2438eb'},{stop:1,color:'#ffc620'}];
const conic=startAngle=>({type:'conic',centerX:57,centerY:43,startAngle,colors});
const pattern=gradient=>({type:'dots',size:13,spacing:11,opacity:1,gradient});
const linear=angle=>({type:'linear',startX:3,startY:8,endX:25,endY:13,angle,colors});
const radial=repeat=>({type:'radial',startX:20,startY:20,endX:20,endY:20,startRadius:0,endRadius:15,repeat,colors});
const unpack=async config=>{
 const {buffer}=await painter.createCanvas({width:W,height:H,...config});
 return sharp(buffer).ensureAlpha().raw().toBuffer();
};
const count=(a,b)=>{assert.equal(a.length,b.length);let n=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])n++;return n};
const differs=async(a,b)=>count(await unpack(a),await unpack(b));
const same=async(a,b)=>assert.equal(await differs(a,b),0);
const fixture={
 root:angle=>({gradientBg:conic(angle)}),
 pattern:angle=>({colorBg:'#27314a',patternBg:pattern(conic(angle))}),
 layer:angle=>({colorBg:'#27314a',bgLayers:[{type:'presetPattern',pattern:pattern(conic(angle))}]}),
 shadow:angle=>({transparentBase:true,shadow:{blur:0,opacity:1,gradient:conic(angle)}}),
 stroke:angle=>({transparentBase:true,stroke:{width:19,gradient:conic(angle)}}),
};
for(const [name,get] of Object.entries(fixture)){
 test('S22 conic startAngle '+name+' has real native effect and zero default parity',async()=>{
  assert.ok(await differs(get(0),get(120))>100,name);
  await same(get(0),get(undefined));
  await same(get(0),get(360));
 });
}
test('S22 PatternGradient.angle rotates linear geometry in root and nested layer',async()=>{
 for(const wrap of [
  angle=>({colorBg:'#172438',patternBg:pattern(linear(angle))}),
  angle=>({colorBg:'#172438',bgLayers:[{type:'presetPattern',pattern:pattern(linear(angle))}]})
 ])assert.ok(await differs(wrap(0),wrap(91))>100);
});
test('S22 PatternGradient.angle works for radial and composes with conic startAngle',async()=>{
 const rad=angle=>({patternBg:pattern({type:'radial',startX:15,startY:5,endX:65,endY:50,startRadius:2,endRadius:50,angle,colors})});
 assert.ok(await differs(rad(0),rad(73))>100);
 const co=angle=>({patternBg:pattern({...conic(21),angle})});
 assert.ok(await differs(co(0),co(70))>100);
});
test('S22 shadow repeat works for linear and radial in discriminating short-period geometry',async()=>{
 const li=repeat=>({transparentBase:true,shadow:{blur:0,opacity:1,gradient:{type:'linear',startX:3,startY:7,endX:22,endY:12,repeat,colors}}});
 const ra=repeat=>({transparentBase:true,shadow:{blur:0,opacity:1,gradient:radial(repeat)}});
 assert.ok(await differs(li('no-repeat'),li('reflect'))>100);
 assert.ok(await differs(ra('no-repeat'),ra('repeat'))>100);
});
let imageSrc;
async function source(){
 if(imageSrc)return imageSrc;
 const pixels=Buffer.alloc(96*72*4);
 for(let y=0;y<72;y++)for(let x=0;x<96;x++){
  const i=(y*96+x)*4,v=((x>>3)+(y>>3))%2;pixels[i]=v?240:12;pixels[i+1]=v?10:235;pixels[i+2]=v?30:210;pixels[i+3]=255;
 }
 const png=await sharp(pixels,{raw:{width:96,height:72,channels:4}}).png().toBuffer();
 imageSrc='data:image/png;base64,'+png.toString('base64');return imageSrc;
}
test('S22 customBg gaussianBlur.radius changes native RGBA and coexists with intensity-only compatibility',async()=>{
 const src=await source();
 const c=radius=>({customBg:{source:src,filters:[{type:'gaussianBlur',radius}]}});
 assert.ok(await differs(c(0),c(4))>100);
 assert.ok(await differs(c(1),c(8))>100);
 await same(c(4),{customBg:{source:src,filters:[{type:'gaussianBlur',intensity:4}]}});
});
test('S22 customBg radius fails closed for wrong discriminant, conflict, or invalid value',async()=>{
 const src=await source();
 for(const bad of [
  {type:'grayscale',radius:2},{type:'gaussianBlur',radius:-2},
  {type:'gaussianBlur',radius:0.1},{type:'gaussianBlur',radius:2,intensity:1},
  {type:'gaussianBlur',radius:Infinity}
 ]){
  await assert.rejects(async()=>painter.createCanvas({width:W,height:H,customBg:{source:src,filters:[bad]}}));
 }
});