// Модуль video.ts содержит:
// Функции для воспроизведения на клиентской части ранее записанных видеофайлов

import crypto from "crypto";
import http from "http";
import url from "url";
import path from "path";
import fs from "fs";
import { log, error } from "./log";

const CHUNK = Math.ceil(1024 * 1024 * 0.2);
//const CHUNK = 1024 * 64;
//const CHUNK = 1024 * 1024 * 512;

class Session {
    private vpath_: ()=>string;

    constructor(vpath: ()=>string) {
        this.vpath_ = vpath;
    }

    serve(file: string, req: http.IncomingMessage, res: http.ServerResponse): boolean {
        log("SERVE FILE:", file);
        
        try {
            const p = path.join(this.vpath_(), file + ".mp4");
            const stat = fs.statSync(p);
            const fileSize = stat.size;
            const range = req.headers.range;
            if (range) {
                const qchunk = range.split("=")[1];
                log("VIDEO: QUERY CHUNK", qchunk);
                const [s, e] = qchunk.split("-");
                const start = +s;
                let end = start + CHUNK - 1;
                if (e) end = +e;
                if (end >= fileSize) {
                    end = fileSize - 1;
                }
                log("VIDEO: SERVE CHUNK", start, end);
                const chunkSize = (end-start)+1;
                const file = fs.createReadStream(p, {start, end});
                const head = {
                    'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges':  'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type':   'video/mp4',
                    'Status':         '206 Partial Content',
                    'Content-Transfer-Encoding': 'binary',
                }
                res.writeHead(206, head);
                file.on("open", () => { file.pipe(res) });
                return true;
            }
            log("VIDEO: SERVE WHOLE FILE");
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
            }
            res.writeHead(200, head)
            fs.createReadStream(p).pipe(res)    
        } catch(e) {
            log("VIDEO ERROR:", e);
        }
        return true;
    }
}

interface SessionTable {
    [key: string]: Session;
}

export class VideoServer {
    private sess_: SessionTable = {};
    private vpath_: ()=>string;

    constructor(vpath: ()=>string) {
        this.vpath_ = vpath;
    }

    private genHash(): string {
        var now = (new Date()).valueOf().toString();
        var random = Math.random().toString();
        return crypto.createHash('sha1').update(now + random).digest('hex');
    }

    public newSession(): string {
        let result = this.genHash();
        while (result in this.sess_) {
            result = this.genHash();
        }
        this.sess_[result] = new Session(this.vpath_);
        return result;
    }

    public endSession(sn: string) {
        if (sn in this.sess_) delete this.sess_[sn];
    }
    
    public serve(req: http.IncomingMessage, res: http.ServerResponse): boolean {
        if (req.url) {
            const file = decodeURIComponent( path.basename(req.url.split("?")[0]) );
            const query = url.parse(req.url, true);
            const sn = query.query["session"] as string;
            //log(`.serve: file=${file} session=${sn}`);
            if (!(sn in this.sess_)) return false;
            const sess = this.sess_[sn];
            return sess.serve(file, req, res);
        }
        return false;
    }
}