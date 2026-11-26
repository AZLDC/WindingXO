'use strict';

// 顯示姿勢以原T字素體為基準；不改寫來源網格或四部位標籤。
window.poseAvatar = (vertices,faces) => {
    const smooth = t => { t=Math.max(0,Math.min(1,t)); return t*t*(3-2*t); };
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const center = x => {
        const s=x-.65, reach=Math.max(0,Math.min(1,s/2.45));
        // 肘腕略離身體，前臂微向前，避免雙手貼緊大腿呈現僵直感。
        return [.51+.23*smooth(reach)+.04*Math.sin(Math.PI*reach),
            2.10-.97*s,-.10+.12*smooth(s/1.3)+.16*smooth((s-1.3)/1.15)];
    };
    let posed=vertices.map(([x,y,z]) => {
        const ax=Math.abs(x), side=Math.sign(x);
        if(y<0||y>2.55)return [x,y,z];
        const shoulder=smooth((y-1.55)/.4)*smooth((2.55-y)/.2);
        const narrowed=x*(1-.15*shoulder);
        const weight=smooth((ax-.46)/.42)*smooth((y-1.65)/.28);
        if(!weight)return [narrowed,y,z];
        const c=center(ax), d=center(ax+.001).map((v,i)=>(v-c[i])/.001);
        const length=Math.hypot(...d), t=d.map(v=>v/length);
        const n=[-t[1],t[0],0], nl=Math.hypot(...n);
        n.forEach((v,i)=>n[i]=v/nl);
        const b=[-t[2]*n[1],t[2]*n[0],t[0]*n[1]-t[1]*n[0]];
        // 球面插值旋轉而非混合兩個頂點位置，避免肩腋的截面被擠扁。
        const qw=Math.sqrt(1+t[0]+n[1]+b[2])/2, turn=Math.acos(qw);
        const factor=Math.sin(weight*turn)/Math.sin(turn)/(4*qw);
        const q=[n[2]-b[1],b[0]-t[2],t[1]-n[0]].map(v=>v*factor);
        const s=ax-.65, thickness=1-.10*weight;
        const v=[s,(y-2.10)*thickness,(z+.12)*thickness];
        const uv=cross(q,v),uuv=cross(q,uv);
        const rotated=v.map((value,i)=>value+2*(Math.cos(weight*turn)*uv[i]+uuv[i]));
        const pivot=[.65-.14*weight,2.10,-.12+.02*weight];
        const origin=[.51,2.10,-.10];
        const target=rotated.map((value,i)=>pivot[i]+value+weight*(c[i]-origin[i]-t[i]*s));
        target[0]-=ax*.15*shoulder*(1-weight);
        return [side*target[0],target[1],target[2]];
    });
    const reference=posed;
    // 只整理肩關節周圍的曲面，胸前、頭部及手肘以下保持原姿勢。
    const weights=vertices.map(([x,y])=>smooth((Math.abs(x)-.32)/.22)*
        smooth((1.4-Math.abs(x))/.4)*smooth((y-1.65)/.25)*smooth((2.55-y)/.22));
    const neighbors=vertices.map(()=>new Set());
    for(const [a,b,c] of faces)for(const [i,j] of [[a,b],[b,c],[c,a]]){
        neighbors[i].add(j);neighbors[j].add(i);
    }
    for(let pass=0;pass<14;pass++)posed=posed.map((p,i)=>{
        if(!weights[i]||!neighbors[i].size)return p;
        const ns=[...neighbors[i]];
        return p.map((v,j)=>v+.45*weights[i]*(ns.reduce((sum,n)=>sum+posed[n][j],0)/ns.length-v));
    });
    // 保留修順後的肩線高度及截面中心，只補回接合處被平滑吃掉的內外／前後厚度。
    const joint=vertices.flatMap(([x,y],i)=>Math.abs(x)>.45&&Math.abs(x)<1.5&&y>1.65&&y<2.55?[i]:[]);
    const rounded=posed;
    posed=posed.map((p,i)=>{
        const [x,y]=vertices[i],ax=Math.abs(x);
        const weight=smooth((ax-.52)/.12)*smooth((1.4-ax)/.3);
        if(!weight||y<=1.65||y>=2.55)return p;
        const ring=joint.filter(j=>Math.sign(vertices[j][0])===Math.sign(x)&&Math.abs(Math.abs(vertices[j][0])-ax)<.06);
        if(ring.length<4)return p;
        const result=[...p];
        for(const axis of [0,2]){
            const mean=mesh=>ring.reduce((sum,j)=>sum+mesh[j][axis],0)/ring.length;
            const before=mean(reference),after=mean(rounded);
            const spread=(mesh,center)=>Math.sqrt(ring.reduce((sum,j)=>sum+(mesh[j][axis]-center)**2,0)/ring.length);
            const scale=Math.max(1,Math.min(2.5,spread(reference,before)/(spread(rounded,after)||1)));
            result[axis]=after+(p[axis]-after)*(1+(scale-1)*weight);
        }
        return result;
    });
    // 只修肩頭上方外半側突起；其餘頂點保持原姿勢。
    const contour=posed;
    const outer=vertices.map(([x,y],i)=>weights[i]*smooth((y-2.15)/.10)*smooth((Math.abs(contour[i][0])-.55)/.07));
    for(let pass=0;pass<4;pass++)posed=posed.map((p,i)=>{
        if(!outer[i]||!neighbors[i].size)return p;
        const ns=[...neighbors[i]];
        const target=p.map((v,j)=>v+.35*outer[i]*(ns.reduce((sum,n)=>sum+posed[n][j],0)/ns.length-v));
        const offset=target.map((v,j)=>v-contour[i][j]),limit=Math.min(1,.02/(Math.hypot(...offset)||1));
        return contour[i].map((v,j)=>v+offset[j]*limit);
    });
    return posed;
};
