// Модуль static.ts содержит:
// Функции файл-сервера для запросов файлов от клиентской части

import fs from "fs";
import path from "path";

interface MimeTable {
    [key: string]: string;
}

const mimeTypes: MimeTable = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.svg': 'application/image/svg+xml',
    '.mpd': 'application/dash+xml',
    '.m4s': 'video/iso.segment',
    '.m3u8': 'application/x-mpegurl',
    '.ts': 'video/mp2t',
    '.log':'text/plain',
    '.txt':'text/plain',
};

export interface Vars {
    [key: string]: string;
}

export class FileServer {
    private root: string;
    private vars: Vars = {};

    constructor(fileRoot: string = "./static") {
        this.root = fileRoot;
    }

    public setVars(vars: Vars) {
        this.vars = vars;
    }

    public get(p: string): [Buffer | null, string, Error | null] {
        if (p[p.length - 1] === "/") {
            p += "index.html";
        }
        p = path.join(this.root, p);
        const ext = path.extname(p).toLowerCase();

        let mime = mimeTypes[ext];
        if (typeof mime === 'undefined') {
            mime = 'application/octet-stream';
        }
        try {
            let data = fs.readFileSync(p);
            if (mime == "text/html") {
                let dstring = data.toString("utf8");
                for (let k in this.vars) {
                    dstring = dstring.split(`#{${k}}`).join(this.vars[k]);
                }
                data = Buffer.from(dstring);
            }
            return [data, mime, null];
        }
        catch (e:any) {
            return [null, "", Error(e)];
        }
    }
}

