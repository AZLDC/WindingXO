'use strict';

// 用系統舊字型在12px點陣格繪製，不下載或打包字型。
document.addEventListener('DOMContentLoaded',async()=>{
    const canvas=document.getElementById('shutdownText');
    const message=document.getElementById('shutdownMessage'),aside=document.getElementById('shutdownAside');
    const main=document.querySelector('main');
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx){main.classList.add('text-fallback');return;}
    function draw(){
        const font=size=>`bold ${size}px "MS Gothic","ＭＳ ゴシック","MS UI Gothic","MingLiU",monospace`;
        const measure=(text,size=12)=>{ctx.font=font(size);return ctx.measureText(text).width;};
        const noteWidth=measure(aside.textContent,8),gap=3;
        const scale=Math.max(1,Math.min(3,Math.floor((innerWidth-48)/(measure(message.textContent)+gap+noteWidth+4))));
        const limit=Math.max(12,Math.floor((innerWidth-48)/scale)-4);
        const lines=[{text:'',note:false}];
        for(const char of message.textContent){
            if(measure(lines.at(-1).text+char)>limit&&lines.at(-1).text)lines.push({text:'',note:false});
            lines.at(-1).text+=char;
        }
        if(measure(lines.at(-1).text)+gap+noteWidth>limit)lines.push({text:'',note:false});
        lines.at(-1).note=true;
        const widths=lines.map(line=>measure(line.text)+(line.note?(line.text?gap:0)+noteWidth:0));
        canvas.width=Math.ceil(Math.max(...widths))+4;
        canvas.height=lines.length*16+4;
        ctx.textBaseline='top';ctx.textAlign='left';ctx.fillStyle='#c0c0c0';
        lines.forEach((line,i)=>{
            const x=(canvas.width-widths[i])/2;
            ctx.font=font(12);ctx.fillText(line.text,x,2+i*16);
            if(line.note){
                const offset=measure(line.text)+(line.text?gap:0);
                ctx.font=font(8);ctx.fillText(aside.textContent,x+offset,6+i*16);
            }
        });
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
