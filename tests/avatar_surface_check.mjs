// 幾何檢查不開瀏覽器，也不修改使用者提供的GLB。
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const context=vm.createContext({window:{}});
vm.runInContext(await readFile('assets/models/avatar-mesh.js','utf8'),context);
const mesh=context.window.createImportedMesh();
assert.equal(mesh.provenance.sourceTriangles,1022);
assert.equal(mesh.faces.length,1022*16,'two real subdivision passes');
assert.equal(mesh.adjustments.originalFaceMaxDisplacement,0,'front-face control points must remain unchanged');
assert(mesh.adjustments.originalBodyMaxDisplacement<=.03600001,'body smoothing must stay within the two-pass limit');
assert(mesh.adjustments.roundedBackVertices>100,'back plate needs actual shape repair');
assert.equal(Math.max(...mesh.vertices.map(p=>p[1])),3.55,'crown height must remain unchanged');
const middle=mesh.vertices.filter(([x,y,z])=>Math.abs(x)<.05&&y>2.95&&y<3.15&&z<-.3);
assert(middle.length>=3&&Math.min(...middle.map(p=>p[2]))<-.58,'rear skull must bow outward beyond the old flat plate');
for(const p of mesh.vertices.filter(([x,y,z])=>y>2.6&&z<-.5)) {
    assert(mesh.vertices.some(q=>Math.hypot(p[0]+q[0],p[1]-q[1],p[2]-q[2])<.00001),'rounded skull must remain left/right symmetric');
}
const edges=new Map();
for(const face of mesh.faces){
    assert(face.slice(0,3).every(i=>Number.isInteger(i)&&i>=0&&i<mesh.vertices.length));
    const [a,b,c]=face;
    for(const [i,j] of [[a,b],[b,c],[c,a]]){
        const key=[Math.min(i,j),Math.max(i,j)].join(',');edges.set(key,(edges.get(key)||0)+1);
    }
}
assert([...edges.values()].every(n=>n===1||n===2),'subdivision must not create overlapping non-manifold edges');
assert.equal([...edges.values()].filter(n=>n===1).length,24,'only the original six open edges, each split into four');
console.log('PASS: rounded rear skull, symmetric shape, protected front face/body, real subdivision and shared edges');
