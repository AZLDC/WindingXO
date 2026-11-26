import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const context=vm.createContext({window:{}});
for(const file of ['assets/models/avatar-mesh.js','assets/models/avatar-pose.js'])
    vm.runInContext(readFileSync(file,'utf8'),context);
const original=context.window.createImportedMesh(),before=JSON.stringify(original);
const posed=context.window.poseAvatar(original.vertices,original.faces);
const protectedInner=JSON.parse(readFileSync('tests/fixtures/avatar-inner-shoulder.json','utf8'));
for(const [i,...expected] of protectedInner.vertices)
    assert.ok(Math.hypot(...expected.map((v,j)=>v-posed[i][j]))<1e-10,'已確認的原始腋下隆起必須保持原座標');
assert.equal(JSON.stringify(original),before,'原模型不可被修改');
assert.equal(posed.length,original.vertices.length);
const hands=posed.filter((_,i)=>Math.abs(original.vertices[i][0])>2.85);
const adjustable=new Set(protectedInner.adjustable.map(row=>row[0]));
const unchangedHash=createHash('sha256').update(JSON.stringify(posed.map((p,i)=>adjustable.has(i)?null:p))).digest('hex');
assert.equal(unchangedHash,protectedInner.unmodifiedHash,'20:01基準之外緣以外8142個頂點必須完全不變');
let changed=0;
for(const [i,...baseline] of protectedInner.adjustable){
    const movement=Math.hypot(...baseline.map((v,j)=>v-posed[i][j]));
    assert.ok(movement<=.020000001,'肩頭外緣位移不得超過0.02模型單位');
    if(movement>1e-10)changed++;
}
assert.ok(changed>0,'只修正肩頭外緣突起');
assert.ok(hands.every(([x,y,z])=>Math.abs(x)>.59&&Math.abs(x)<.98&&y<.1&&z<.5),'放鬆的雙手與大腿保留間距');
assert.ok(Math.max(...posed.map(p=>Math.abs(p[0])))<1,'肩臂仍保持纖細');
original.vertices.forEach((p,i)=>{
    if(p[1]<0||p[1]>2.55)assert.deepEqual(posed[i],p,'頭腿比例不可改變');
    assert.ok(posed[i].every(Number.isFinite));
});
// 鏡射輸入需產生鏡射姿勢，避免左右肩與雙手不對稱。
const mirrored=context.window.poseAvatar(original.vertices.map(([x,y,z])=>[-x,y,z]),original.faces);
posed.forEach(([x,y,z],i)=>assert.ok(Math.hypot(x+mirrored[i][0],y-mirrored[i][1],z-mirrored[i][2])<1e-8));
for(const [a,b,c] of original.faces){
    const p=posed[a],q=posed[b],r=posed[c];
    const u=q.map((v,i)=>v-p[i]),v=r.map((v,i)=>v-p[i]);
    assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-10,'面不可塌陷');
}
console.log('PASS: hands down beside thighs, slender shoulders/arms, symmetry, protected head/legs, intact faces');
