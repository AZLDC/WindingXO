'use strict';

// 用系統舊字型在12px點陣格繪製，不下載或打包字型。
document.addEventListener('DOMContentLoaded',async()=>{
    const canvas=document.getElementById('shutdownText'),heading=document.querySelector('h1');
    const main=document.querySelector('main');
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx){main.classList.add('text-fallback');return;}
    function draw(){
        const font='bold 12px "MS Gothic","ＭＳ ゴシック","MS UI Gothic","MingLiU",monospace';
        ctx.font=font;
        const scale=Math.max(1,Math.min(3,Math.floor((innerWidth-48)/(ctx.measureText(heading.textContent).width+4))));
        const limit=Math.max(12,Math.floor((innerWidth-48)/scale)-4);
        const lines=[''];
        for(const char of heading.textContent){
            if(ctx.measureText(lines.at(-1)+char).width>limit&&lines.at(-1))lines.push('');
            lines[lines.length-1]+=char;
        }
        canvas.width=Math.ceil(Math.max(...lines.map(line=>ctx.measureText(line).width)))+4;
        canvas.height=lines.length*16+4;
        ctx.font=font;ctx.textBaseline='top';ctx.textAlign='center';ctx.fillStyle='#c0c0c0';
        lines.forEach((line,i)=>ctx.fillText(line,canvas.width/2,2+i*16));
        // 去除字緣半透明抗鋸齒，放大時保留方形像素，不出現平滑光暈。
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
        for(let i=0;i<pixels.data.length;i+=4){
            pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=192;
            pixels.data[i+3]=pixels.data[i+3]>=96?255:0;
        }
        ctx.putImageData(pixels,0,0);
        canvas.style.width=`${canvas.width*scale}px`;canvas.style.height=`${canvas.height*scale}px`;
        canvas.hidden=false;main.classList.add('pixel-ready');
    }
    // 第一幀維持全黑，字型、像素及CSS尺寸準備完成才揭露文字。
    await document.fonts.ready;
    draw();window.addEventListener('resize',draw);
});
