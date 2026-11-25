'use strict';
(() => {
// 旋轉水晶游標幾何來源：中空、V字凹尾，點擊尖端固定於3,2。
const A=[3,2],outer=[A,[28,13],[15,14.7],[11,25]],inner=[[6.2,6],[21.8,12.5],[13.2,12.9],[11.5,19.6]];
const corners=outer.length;
const center=[14,13.3],inset=(p,t)=>p.map((v,i)=>v+(center[i]-v)*t);
const loops=[outer.map(p=>[...p,0]),outer.map(p=>[...inset(p,.035),.85]),inner.map(p=>[...p,.85]),inner.map(p=>[...p,0]),outer.map(p=>[...inset(p,.035),-.85]),inner.map(p=>[...p,-.85])];
const points=loops.flat(),faces=[];
for(const [a,b] of [[0,1],[1,2],[2,3],[0,4],[4,5],[5,3]])for(let i=0;i<corners;i++)faces.push([a*corners+i,b*corners+i,b*corners+(i+1)%corners,a*corners+(i+1)%corners]);
const axis=[.696,.718],side=[-.718,.696];
function crystal(angle){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
    const ctx=canvas.getContext('2d'),s=Math.sin(angle),c=Math.cos(angle);
    const projected=points.map(([x,y,z])=>{
        const dx=x-A[0],dy=y-A[1],t=dx*axis[0]+dy*axis[1],r=dx*side[0]+dy*side[1];
        const u=r*c+z*s,depth=-r*s+z*c;
        return [A[0]+t*axis[0]+u*side[0],A[1]+t*axis[1]+u*side[1],depth];
    });
    const ordered=faces.map(ids=>{
        const p=ids.map(i=>projected[i]),u=p[1].map((v,i)=>v-p[0][i]),v=p[2].map((n,i)=>n-p[0][i]);
        const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal)||1;
        const facing=Math.abs(normal[2]/length),shine=Math.max(0,(-normal[0]+normal[1]*-.5+Math.abs(normal[2]))/length);
        return {p,facing,shine,depth:p.reduce((a,q)=>a+q[2],0)/p.length};
    }).sort((a,b)=>a.depth-b.depth);
    for(const {p,facing,shine,depth} of ordered){
        ctx.beginPath();ctx.moveTo(p[0][0],p[0][1]);for(const q of p.slice(1))ctx.lineTo(q[0],q[1]);ctx.closePath();
        const brightness=Math.min(1,.5+shine*.4);
        ctx.fillStyle=`rgba(${Math.round(145+brightness*105)},${Math.round(207+brightness*47)},255,${.36+facing*.46})`;ctx.fill();
        ctx.strokeStyle=depth>=0?'rgba(232,255,255,.85)':'rgba(83,170,197,.5)';ctx.lineWidth=.32;ctx.stroke();
    }
    return canvas;
}
window.createCrystalCursorFrames=()=>Array.from({length:96},(_,i)=>crystal(i/96*Math.PI*2));
})();
