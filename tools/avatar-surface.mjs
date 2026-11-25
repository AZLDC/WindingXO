// 保留來源比例的局部曲面修整；只供離線轉檔，瀏覽器不載入。
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function limited(origin,target,limit){
    const t=Math.min(1,limit/(distance(origin,target)||1));
    return origin.map((v,i)=>v+(target[i]-v)*t);
}
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};

export function refineSurface(input){
    const vertices=[],lookup=new Map();
    const remap=input.vertices.map(p=>{
        const key=p.map(v=>v.toFixed(5)).join(',');
        if(!lookup.has(key)){lookup.set(key,vertices.length);vertices.push([...p]);}
        return lookup.get(key);
    });
    let points=vertices,faces=input.faces.map(([a,b,c,...tags])=>[remap[a],remap[b],remap[c],...tags]);
    // 共用邊細分兩次，UV接縫先焊接，避免原本的大三角邊仍形成折痕。
    for(let pass=0;pass<2;pass++){
        const neighbors=points.map(()=>new Set()),edges=new Map();
        for(const [a,b,c] of faces)for(const [i,j,k] of [[a,b,c],[b,c,a],[c,a,b]]){
            neighbors[i].add(j);neighbors[j].add(i);
            const key=[Math.min(i,j),Math.max(i,j)].join(',');
            if(!edges.has(key))edges.set(key,{a:i,b:j,opposite:[]});
            edges.get(key).opposite.push(k);
        }
        const next=points.map((p,i)=>{
            // 前半臉既有頂點不移動；其餘平滑位移每輪最多0.018模型單位。
            if((p[1]>2.5&&p[2]>-.28)||p[1]>3.5)return [...p];
            const ns=[...neighbors[i]],beta=ns.length===3?3/16:3/(8*ns.length);
            const target=p.map((v,j)=>(1-ns.length*beta)*v+beta*ns.reduce((sum,n)=>sum+points[n][j],0));
            return limited(p,target,.018);
        });
        for(const edge of edges.values()){
            const {a,b,opposite}=edge,mid=points[a].map((v,j)=>(v+points[b][j])/2);
            const target=opposite.length===2?mid.map((v,j)=>v*.75+(points[opposite[0]][j]+points[opposite[1]][j])*.125):mid;
            edge.index=next.length;
            next.push(mid[1]>2.5&&mid[2]>-.28?mid:limited(mid,target,.025));
        }
        const midpoint=(a,b)=>edges.get([Math.min(a,b),Math.max(a,b)].join(',')).index;
        faces=faces.flatMap(([a,b,c,...tags])=>{
            const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
            return [[a,ab,ca,...tags],[ab,b,bc,...tags],[ca,bc,c,...tags],[ab,bc,ca,...tags]];
        });
        points=next;
    }
    let rounded=0;
    for(const p of points){
        const [x,y,z]=p;
        if(y<=2.58||z>=-.28)continue;
        // 後腦原有的平板補成左右對稱橢圓弧；向外補圓，不挖掉原頭型。
        const rx=.41*Math.sqrt(Math.max(.18,1-((y-3.02)/.66)**2));
        const rz=.43*Math.sqrt(Math.max(0,1-((y-3.02)/.57)**2));
        const target=-.19-rz*Math.sqrt(Math.max(0,1-(x/rx)**2));
        const blend=smooth((-z-.28)/.16)*smooth((y-2.58)/.1)*smooth((3.56-y)/.06);
        const depth=Math.min(z,z+(target-z)*blend);
        if(depth<z-1e-8){p[2]=depth;rounded++;}
    }
    const originalBodyMaxDisplacement=Math.max(...vertices.map((p,i)=>p[1]<=2.5?distance(p,points[i]):0));
    const originalFaceMaxDisplacement=Math.max(...vertices.map((p,i)=>p[1]>2.5&&p[2]>-.28?distance(p,points[i]):0));
    return {vertices:points,faces,adjustments:{subdivisionPasses:2,roundedBackVertices:rounded,bodySmoothingLimitPerPass:.018,originalBodyMaxDisplacement,originalFaceMaxDisplacement}};
}
