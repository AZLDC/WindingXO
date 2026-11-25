// 此轉換器只處理本專案使用的靜態三角網格；拒絕未支援的動畫／骨架以免悄悄改壞比例。
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {refineSurface} from './avatar-surface.mjs';

const source=process.argv[2];
if(!source)throw new Error('Usage: node tools/convert-avatar.mjs source.glb');
const bytes=await readFile(source);
if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Invalid GLB 2');
let doc,bin;
for(let offset=12;offset<bytes.length;){
    const size=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4),chunk=bytes.subarray(offset+8,offset+8+size);
    if(type===0x4e4f534a)doc=JSON.parse(chunk.toString('utf8'));
    if(type===0x004e4942)bin=chunk;
    offset+=8+size;
}
if(!doc||!bin||doc.skins?.length||doc.animations?.length)throw new Error('Expected static embedded geometry');
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const multiply=(a,b)=>Array.from({length:16},(_,i)=>{const row=i%4,col=Math.floor(i/4);return [0,1,2,3].reduce((n,k)=>n+a[k*4+row]*b[col*4+k],0);});
function accessor(index){
    const a=doc.accessors[index],v=doc.bufferViews[a.bufferView];
    const formats={5126:['readFloatLE',4],5125:['readUInt32LE',4],5123:['readUInt16LE',2],5121:['readUInt8',1]};
    const [method,size]=formats[a.componentType]||[],width={SCALAR:1,VEC3:3}[a.type];
    if(!method||!width||a.sparse||v.buffer!==0)throw new Error('Unsupported accessor');
    const start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||width*size;
    return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,j)=>bin[method](start+i*stride+j*size)));
}
const vertices=[],triangles=[];
function visit(index,parent){
    const node=doc.nodes[index];
    if(node.translation||node.rotation||node.scale)throw new Error('This source adapter expects baked matrix transforms');
    const world=multiply(parent,node.matrix||identity);
    if(node.mesh!==undefined)for(const primitive of doc.meshes[node.mesh].primitives){
        if((primitive.mode??4)!==4||primitive.targets)throw new Error('Expected triangle primitive');
        const base=vertices.length;
        for(const p of accessor(primitive.attributes.POSITION))vertices.push([0,1,2].map(row=>world[row]*p[0]+world[4+row]*p[1]+world[8+row]*p[2]+world[12+row]));
        const indices=accessor(primitive.indices).flat();
        for(let i=0;i<indices.length;i+=3)triangles.push(indices.slice(i,i+3).map(n=>n+base));
    }
    for(const child of node.children||[])visit(child,world);
}
for(const node of doc.scenes[doc.scene||0].nodes)visit(node,identity);
const min=[0,1,2].map(i=>Math.min(...vertices.map(p=>p[i]))),max=[0,1,2].map(i=>Math.max(...vertices.map(p=>p[i])));
const scale=6.8/(max[1]-min[1]);
for(const p of vertices){p[0]=(p[0]-(min[0]+max[0])/2)*scale;p[1]=(p[1]-min[1])*scale-3.25;p[2]=(p[2]-(min[2]+max[2])/2)*scale;}
// 分區只附加標籤，不移動或改造任何頂點。
const faces=triangles.map(ids=>{
    const points=ids.map(i=>vertices[i]),y=points.reduce((n,p)=>n+p[1],0)/3,x=Math.abs(points.reduce((n,p)=>n+p[0],0)/3);
    const part=y>2.5?'head':y<-.5?'legs':x>.85?'arms':'torso';
    return [...ids,part,'skin'];
});
const refined=refineSurface({vertices,faces});
// 6位小數誤差小於百萬分之一模型單位，避免把原GLB數十KB放大成冗長浮點文字。
refined.vertices=refined.vertices.map(p=>p.map(v=>Number(v.toFixed(6))));
const provenance={...doc.asset.extras,sha256:createHash('sha256').update(bytes).digest('hex'),sourceVertices:vertices.length,sourceTriangles:faces.length,changes:'Scene transforms baked; uniformly scaled and centered; UV seams welded; two bounded surface subdivision passes; back of head rounded horizontally. Arms remain in the source T-pose.'};
const data=JSON.stringify({...refined,provenance});
await writeFile(resolve('assets/models/avatar-mesh.js'),`'use strict';\n// Converted from the user-supplied GLB. Attribution and license: avatar-license.json.\nwindow.createImportedMesh = () => (${data});\n`);
await writeFile(resolve('assets/models/avatar-license.json'),JSON.stringify(provenance,null,2)+'\n');
console.log(JSON.stringify({vertices:refined.vertices.length,triangles:refined.faces.length,adjustments:refined.adjustments,sourceBounds:{min,max},parts:[...new Set(faces.map(f=>f[3]))],bytes:data.length}));
