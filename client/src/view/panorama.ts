// Модуль panorama.tsx содержит:
// Функции управления панорамным снимком
import {iCameraData_PosExt } from "@gen_lib/camera_interfaces";

import * as model from "../model/camera";

function setResizeHandler(callback: ()=>void, timeout: number) {
    let timerID = undefined;
    window.addEventListener("resize", function() {
        if(timerID !== undefined) {
            clearTimeout(timerID);
            timerID = undefined;
        }
        timerID = setTimeout(function() {
            timerID = undefined;
            callback();
        }, timeout);
    });
}

const LINE_WIDTH = 0.03;
const LINE_LENGTH = 0.1;

export class PanEvents {
    private img = new Image();
    private imgsrc: string = "";
    private campos: iCameraData_PosExt | null = null;
    private drawCross: boolean = false;

    private canv: HTMLCanvasElement | null = null;
    private cwidth: number = 0;
    private cheight: number = 0;

    constructor() {
        setResizeHandler(() => this.doUpdate(), 400);
    }

    private setCanvas(canv: HTMLCanvasElement) {
        if (canv.width < this.cwidth) {
            canv.width = this.cwidth;
            canv.height = this.cheight;
        }
        
        if (!this.cwidth) {
            canv.width *= 5;
            canv.height *= 5;
            this.cwidth = canv.width;
            this.cheight = canv.height;
        }
        
        this.canv = canv;

        const ctx = canv.getContext('2d');
        ctx.clearRect(0, 0, canv.width, canv.height);    
        this.doDrawCross(canv);
    }

    private doDrawCross(canv: HTMLCanvasElement) {
        if (!this.drawCross || !this.campos.PanTiltPos_Pano) return;
        const brect = canv.getBoundingClientRect();
        const r = brect.height / brect.width;
        const ctx = canv.getContext('2d');
        let [px, py] = this.campos.PanTiltPos_Pano;
        if (py < 0) py = 0;
        if (py > 1) py = 1;
        py = 1.0 - py;
        if (px < 0) px = 0;
        if (px > 1) px = 1;
        ctx.fillStyle = "rgba(0,200,0,30)";
        let [xs, ys] = [(px-(LINE_LENGTH/2)*r)*canv.width, (py-(LINE_WIDTH/2))*canv.height];
        if (xs < 0) xs = 0;
        if (ys < 0) ys = 0;
        ctx.fillRect(xs, ys, LINE_LENGTH*r*canv.width, LINE_WIDTH*canv.height);
        [xs, ys] = [(px-(LINE_WIDTH/2)*r)*canv.width, (py-(LINE_LENGTH/2))*canv.height];
        if (xs < 0) xs = 0;
        if (ys < 0) ys = 0;
        ctx.fillRect(xs, ys, LINE_WIDTH*r*canv.width, LINE_LENGTH*canv.height);
    }

    public onCreate(isrc: string, cpos: iCameraData_PosExt, dCross: boolean) {   
        //console.log("PAN ONCREATE 1");
        this.imgsrc = isrc;
        this.campos = cpos;
        this.drawCross = dCross;

        return (c: HTMLCanvasElement) => {
            //console.log("PAN ONCREATE 2");
            this.setCanvas(c);
        }
    }

    public onUpdate(isrc: string, cpos: iCameraData_PosExt, dCross: boolean) {
        //console.log("PAN ONUPDATE 1");
        this.imgsrc = isrc;
        this.campos = cpos;
        this.drawCross = dCross;

        return (c: HTMLCanvasElement) => {
            //console.log("PAN ONUPDATE 2");

            this.setCanvas(c);
            this.doUpdate();
        }
    }

    public onDestroy() {
        this.canv = null;
    }

    private doUpdate () {
        if (!this.canv) return;
        const ctx = this.canv.getContext('2d');
        this.img.onload = () => {
            //console.log("PAN DRAW");
            ctx.drawImage(this.img, 0, 0, this.img.width, this.img.height,
                0, 0, this.canv.width, this.canv.height);
            this.doDrawCross(this.canv)
        }
        this.img.src = this.imgsrc;
    }
}
