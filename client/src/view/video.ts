// Модуль video.tsx содержит:
// Функции воспроизведения видеопотока по протоколу вебсокет
// Неиспользуются ( сервер определяет другой способ воспроизведения )
import * as model from "../model/video";

const GAP = 10;
const TEXT_HEIGHT = 20;

interface VideoSource {
    setVideoCallback(cb: (ev: MessageEvent) => void);
}

export class Stream {

    private textTab: model.TextTable = {};
    private canv: HTMLCanvasElement | null = null;
    private cwidth = 0;
    private cheight = 0;
    private img: HTMLImageElement = new Image();
    private src: VideoSource = null;

    constructor(private name: string) {}

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
        this.drawTextTable(canv);

        const img = this.img;

        if (this.src !== null) {
            this.src.setVideoCallback((event) => {
                if (!this.canv) return;
                const canv = this.canv;
                const ctx = canv.getContext('2d');
                const blob = new Blob([event.data], {type: "image/jpeg"});
                const url = URL.createObjectURL(blob);
                img.src = url;
                img.onload = () => {
                    //console.log(`VIDEO DRAW "${this.name}"`, img.width, img.height, canv.width, canv.height);
                    ctx.drawImage(img, 0, 0, img.width, img.height,
                        0, 0, canv.width, canv.height);
                        this.drawTextTable(canv);
    
                    URL.revokeObjectURL(url);    
                };
            });
        }
    }

    private drawText([posx, posy]: [model.TextPosX, model.TextPosY], canv: HTMLCanvasElement) {
        const p = `${posx}_${posy}`;
        if (!this.textTab[p]) return;

        const [text, color] = this.textTab[p];
        const ctx = canv.getContext('2d');
        const width = canv.width;
        const height = canv.height;

        ctx.font = `${TEXT_HEIGHT}px Arial`;
        ctx.fillStyle = color;
        const tsz = ctx.measureText(text);
        let x = GAP;
        switch (posx) {
        case "left":
            x = GAP;
            break;
        case "center":
            x = (width / 2) - (tsz.width / 2);
            break;
        case "right":
            x = width - GAP - tsz.width;
            break;
        }
        let y = GAP + TEXT_HEIGHT;
        switch (posy) {
        case "top":
            y = GAP + TEXT_HEIGHT;
            break;
        case "center":
            y = (height / 2) - (TEXT_HEIGHT / 2);
            break;
        case "bottom":
            y = height - GAP - TEXT_HEIGHT;
            break;
        }
        ctx.fillText(text, x, y);
    }

    private drawTextTable(canv: HTMLCanvasElement) {
        for (const x of ["left", "center", "right"] as model.TextPosX[]) {
            for (const y of ["top", "center", "bottom"] as model.TextPosY[]) {
                this.drawText([x, y], canv);
            }
        }
    }

    public setTable(tab: model.TextTable): string {
        this.textTab = tab;
        return "";
    }

    public onCreate(src: VideoSource) {
        this.src = src;
        //console.log(`VIDEO ONCREATE 1 "${this.name}"`);
        return (canv) => this.setCanvas(canv);
    }

    public onUpdate(src: VideoSource) {
        this.src = src;
        //console.log(`VIDEO ONUPDATE 2 "${this.name}"`);
        return (canv) => this.setCanvas(canv);
    }

    public onDestroy() {
        //console.log(`VIDEO ONDESTROY 2 "${this.name}"`);
    }
}
