'use strict';

/* 儀表與本地匯入模型皆由 Canvas 繪製，不依賴 Flash 或線上播放器。 */
class AngelVisual {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.vertices = [];
        this.region = 'torso';
        this.frames = 0;
        this.running = false;
        this.buildHuman();
        this.canvas.dataset.vertices = this.vertices.length;
        this.canvas.dataset.faces = this.faces.length;
        this.canvas.dataset.model = 'satomu-anime-girl-body';
        this.canvas.dataset.rings = '10';
        this.observer = new ResizeObserver(() => { if (this.running) this.resize(); });
        this.observer.observe(canvas.parentElement);
    }

    buildHuman() {
        Object.assign(this,window.createImportedMesh());
        this.vertices=window.poseAvatar(this.vertices,this.faces);
        this.bodyRadius=Math.max(...this.vertices.map(([x,,z])=>Math.hypot(x,z)))*1.08;
        // 只細分顯示線條；原模型輪廓和比例完全保留，長邊不再留下大片空白。
        this.wireDivisions=new Map(this.faces.map(face=>{
            const p=face.slice(0,3).map(i=>this.vertices[i]);
            const longest=Math.max(...p.map((a,i)=>Math.hypot(...a.map((v,j)=>v-p[(i+1)%3][j]))));
            return [face,Math.min(12,Math.max(1,Math.ceil(longest/.18)))];
        }));
    }

    humanLayout() {
        const w=this.width,h=this.height,mobile=matchMedia('(max-width:650px)').matches;
        const panel=document.querySelector('.angel-details');
        const bottom=mobile ? panel.getBoundingClientRect().top-this.canvas.getBoundingClientRect().top-18 : h;
        return {cx:w*(mobile ? .51 : .49),cy:mobile ? (85+bottom)/2 : h*.5,
            scale:Math.min(mobile ? Math.max(1,bottom-85)/7.8 : h*.105,w*.46/this.bodyRadius),halfWidth:this.bodyRadius};
    }

    resize() {
        const ratio = Math.min(devicePixelRatio || 1, 2);
        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight;
        this.canvas.width = Math.round(this.width*ratio);
        this.canvas.height = Math.round(this.height*ratio);
        this.ctx.setTransform(ratio,0,0,ratio,0,0);
    }

    start() {
        if (this.running || !this.ctx) return;
        this.running = true;
        this.last = 0;
        this.resize();
        const tick = time => {
            if (!this.running) return;
            if (!this.last || time-this.last >= 32) { this.draw(time/1000); this.last = time; }
            this.request = requestAnimationFrame(tick);
        };
        this.request = requestAnimationFrame(tick);
    }

    stop() { this.running = false; cancelAnimationFrame(this.request); }

    drawHuman(projected,time=0) {
        const ctx=this.ctx;
        const scanY=this.humanLayout().cy+Math.sin(time*.7)*this.humanLayout().scale*3.4;
        const glow=(base,bright)=>{
            const gradient=ctx.createLinearGradient(0,scanY-22,0,scanY+22);
            gradient.addColorStop(0,base);gradient.addColorStop(.5,bright);gradient.addColorStop(1,base);return gradient;
        };
        const normal=glow('#f4438eaa','#ffaadce8'),selected=glow('#ff96cce0','#ffe0f3');
        // 透視校正的邊插值，確保細網格會隨模型旋轉而非貼在螢幕上。
        const between=(p,q,t)=>{
            const a=(1-t)*(9-p[2]),b=t*(9-q[2]),depth=a+b;
            return [(p[0]*a+q[0]*b)/depth,(p[1]*a+q[1]*b)/depth];
        };
        const visible=this.faces.map(face=>{
            const [a,b,c]=face,p=projected[a],q=projected[b],r=projected[c];
            const area=(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
            return {face,area,depth:(p[2]+q[2]+r[2])/3};
        }).filter(item=>item.area<-.015).sort((a,b)=>a.depth-b.depth);
        // 可見面由後往前遮擋，避免背面三角線穿過正面。
        for(const {face} of visible) {
            const [a,b,c,part]=face,p=projected[a],q=projected[b],r=projected[c];
            ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.lineTo(r[0],r[1]);ctx.closePath();
            ctx.fillStyle='#230b1b';ctx.fill();
            const divisions=this.wireDivisions.get(face);
            for(let step=1;step<divisions;step++)for(const [a,b,c] of [[p,q,r],[q,r,p],[r,p,q]]) {
                const u=between(a,b,step/divisions),v=between(a,c,step/divisions);
                ctx.moveTo(u[0],u[1]);ctx.lineTo(v[0],v[1]);
            }
            ctx.strokeStyle=part===this.region ? selected : normal;
            ctx.lineWidth=part===this.region ? .55 : .4;ctx.stroke();
        }
    }

    rulerMetrics(radius,labelEvery=30) {
        const fontSize = Math.max(12,Math.min(23,radius*.042));
        const numbers = radius>=60 || labelEvery===90;
        const desiredLength = Math.min(radius*.16,Math.max(10,radius*.07));
        const labelSpace = numbers ? fontSize*1.2 : 2;
        const width = Math.min(radius*(labelEvery===90 ? .7 : .45),desiredLength*1.5+labelSpace+4);
        const majorLength = Math.max(2,Math.min(desiredLength,(width-labelSpace-4)/1.5));
        return {fontSize,majorLength,innerLength:majorLength*.5,innerRadius:radius-width,numbers};
    }

    rulerRadii(radius,count) {
        const radii=[];
        for(let i=0;i<count;i++) {
            radii.push(radius);
            radius=this.rulerMetrics(radius).innerRadius-2;
        }
        return radii;
    }

    ring(x, y, radius, rotation, divisions, opacity, front=false,labelEvery=30) {
        const ctx = this.ctx;
        const {fontSize,majorLength,innerLength,innerRadius,numbers}=this.rulerMetrics(radius,labelEvery);
        const majorEvery = divisions*labelEvery/360;
        this.rulerMaxFont = Math.max(this.rulerMaxFont,fontSize);
        ctx.save(); ctx.translate(x,y); ctx.rotate(rotation);
        if(front) {
            // 近側尺面遮住後方線條；不是只把兩組線框疊加提亮。
            ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);
            ctx.moveTo(innerRadius,0);ctx.arc(0,0,innerRadius,0,Math.PI*2);
            ctx.fillStyle='#031421ed';ctx.fill('evenodd');
            ctx.shadowColor='#62dfff';ctx.shadowBlur=2.5;
        }
        const weight=front ? 1.8 : 1;
        ctx.strokeStyle = front ? `rgba(91,218,255,${opacity})` : `rgba(29,168,237,${opacity})`;
        ctx.fillStyle = front ? '#d1faff' : `rgba(104,211,255,${Math.min(.82,opacity*2.8)})`;
        ctx.lineWidth = front ? 1.6 : 1;
        ctx.beginPath(); ctx.arc(0,0,radius,0,Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0,0,innerRadius,0,Math.PI*2); ctx.stroke();
        for (let i = 0; i < divisions; i++) {
            const angle = i/divisions*Math.PI*2;
            const major = i%majorEvery === 0;
            const fraction = major ? 1 : (i%5===0 ? .7 : .38);
            const length = majorLength*fraction;
            ctx.lineWidth = (major ? 1.3 : .7)*weight;
            ctx.beginPath(); ctx.moveTo(Math.cos(angle)*(radius-length),Math.sin(angle)*(radius-length));
            ctx.lineTo(Math.cos(angle)*radius,Math.sin(angle)*radius); ctx.stroke();
            ctx.beginPath();ctx.moveTo(Math.cos(angle)*innerRadius,Math.sin(angle)*innerRadius);
            ctx.lineTo(Math.cos(angle)*(innerRadius+innerLength*fraction),Math.sin(angle)*(innerRadius+innerLength*fraction));ctx.stroke();
            if (major && numbers) {
                const labelRadius=(radius-majorLength+innerRadius+innerLength)/2;
                ctx.save(); ctx.rotate(angle); ctx.translate(labelRadius,0); ctx.rotate(Math.PI/2);
                ctx.font = `${front ? '600 ' : ''}${fontSize}px Consolas`; ctx.textAlign = 'center';ctx.textBaseline='middle';
                ctx.fillText(String(Math.round(i/divisions*360)),0,0); ctx.restore();
            }
        }
        ctx.restore();
    }

    draw(time) {
        const ctx = this.ctx, w = this.width, h = this.height;
        if (!w || !h) return;
        this.updateHex(time);
        ctx.clearRect(0,0,w,h);
        ctx.strokeStyle = '#16445b22'; ctx.lineWidth = .5;
        ctx.beginPath();
        for (let x=0;x<w;x+=35) { ctx.moveTo(x,0);ctx.lineTo(x,h); }
        for (let y=0;y<h;y+=35) { ctx.moveTo(0,y);ctx.lineTo(w,y); }
        ctx.stroke();
        const large = Math.min(h*.78,w*.72), small = Math.min(h*.5,w*.46);
        this.rulerMaxFont = 0;
        // 每組同心尺視為同一個剛體；上方獨立的一組順時針旋轉。
        this.rulerRadii(large*.99,4).forEach((radius,i) => this.ring(w*.015,h*.38,radius,-time*.045,360,.28,false,[15,30,45,90][i]));
        this.rulerRadii(small*.98,3).forEach((radius,i) => this.ring(w*.98,h*.97,radius,-time*.05,360,.3,false,[30,45,90][i]));
        const topRadii=this.rulerRadii(small*.94,3);
        const topY=-Math.max(0,Math.min(h*.16,topRadii.at(-1)-24));
        topRadii.forEach((radius,i) => this.ring(w*.14,topY,radius,time*.065,360,.64,true,[30,45,90][i]));
        const {cx,cy,scale,halfWidth}=this.humanLayout(),angle=time*Math.PI*2/10;
        // 壓低人形背後儀表亮度，避免刻度數字穿過臉部與制服輪廓。
        const veil=ctx.createLinearGradient(cx-scale*1.3,0,cx+scale*1.3,0);
        veil.addColorStop(0,'#020c1800');veil.addColorStop(.3,'#020c18e6');
        veil.addColorStop(.7,'#020c18e6');veil.addColorStop(1,'#020c1800');
        ctx.fillStyle=veil;ctx.fillRect(cx-scale*1.3,cy-scale*3.7,scale*2.6,scale*7.1);
        const sine = Math.sin(angle), cosine = Math.cos(angle);
        const projected = this.vertices.map(([x,y,z]) => {
            const px=x*cosine+z*sine, depth=-x*sine+z*cosine, perspective=9/(9-depth);
            return [cx+px*scale*perspective,cy-y*scale*perspective,depth];
        });
        this.drawHuman(projected,time);
        const bx=cx-scale*halfWidth,by=cy-scale*3.7,bw=scale*halfWidth*2,bh=scale*7.1;
        ctx.strokeStyle='#71ddff66';ctx.lineWidth=1;
        for(const [x,y,sx,sy] of [[bx,by,1,1],[bx+bw,by,-1,1],[bx,by+bh,1,-1],[bx+bw,by+bh,-1,-1]]) {
            ctx.beginPath();ctx.moveTo(x,y+12*sy);ctx.lineTo(x,y);ctx.lineTo(x+12*sx,y);ctx.stroke();
        }
        ctx.fillStyle='#5bb7d08a';ctx.font='8px Consolas';
        ctx.fillText('STRUCTURE / 01',bx,by-8);
        ctx.fillText('X 0.00  /  Z 0.00',bx,by+bh+15);
        if (++this.frames%3===0) document.getElementById('rotationAngle').textContent=`${((angle*180/Math.PI)%360).toFixed(1).padStart(5,'0')}°`;
        this.canvas.dataset.frames=this.frames;
        this.canvas.dataset.rulerFont=this.rulerMaxFont.toFixed(1);
    }

    updateHex(time) {
        const output=document.getElementById('machineCode');
        if (!output) return;
        const changed=this.hexRegion!==this.region;
        if (!changed && time-this.hexTime<1) return;
        const word=()=>Math.floor(Math.random()*65536).toString(16).toUpperCase().padStart(4,'0');
        if (changed || !this.hexRows) this.hexRows=Array.from({length:4},()=>Array.from({length:3},word));
        else this.hexRows[Math.floor(Math.random()*4)][Math.floor(Math.random()*3)]=word();
        output.textContent=this.hexRows.map(row=>row.join(' ')).join('\n');
        this.hexRegion=this.region;
        this.hexTime=time;
    }
}
window.AngelVisual = AngelVisual;
