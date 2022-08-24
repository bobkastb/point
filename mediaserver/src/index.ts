// Модуль index.ts содержит:
// Основной код сервера обработки захвата видеопотока
// Парсинг и обработка HTTP запросов к серверу
// Функции обработки запросов к видео(mjpeg) потоку
import http from "http";
import url, { Url } from "url";
import ws from "./ws/ws";
import path from "path";
import os from "os";
import fs from "fs";
import { log, error } from "./lib/log";
import * as capt from "./lib/capture";
import { wait, Mutex } from "./lib/sync";
import { Socket } from "net";
import { performance } from "perf_hooks";
import * as menv from "./lib/environment";
import * as utils from "./lib/utils";
import { APIResult, api_Error , api_Result } from "./lib/api_interfaces";
import {isError} from "./lib/gen_functions";


interface Config {
    HTTPPort: number;
    WebsocketPort: number;                //8032
    PrintStats: number;                   //0
    FPS: number;                          // 15
    RestrictBuffering: number;            //0.5
    Capture: capt.Config;
    SuspendStreaming: boolean;
}

const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

interface ImageInfo {
    ts: Date;
    data: Buffer;
    count: number;
}

interface Stats {
    wsBuffered: number;
    sendingDelay: number;
    streamStarted: boolean;
    timeToFirstImage: number;
    timeStarted: Date;
    lastImageSize: number;
}


type APIHandler = (req: http.IncomingMessage, query: url.UrlWithParsedQuery) => Promise<APIResult>;

interface APITable {
    [key: string]: APIHandler;
};

function ParseUrl(req_url?: string) {
    if (!req_url) return;
    let p = req_url.split("?")[1]; // r.url
    if (!p) return;
    let pr: any = {};
    try {
        pr = JSON.parse(p)
    } catch {
        const query = url.parse(req_url, true);
        let c = 0;
        for (let i in query.query) { pr[i] = decodeURIComponent(query.query[i] as string); c++; };
        if (!c) return;
    }
    return pr;
}
class HttpServer {
    private port_: number;
    private tabAPI: APITable;
    private srv_: Server;
    private http_: http.Server;
    private sockets_: Set<Socket>;

    toJSON() { return { tabapi: this.tabAPI } };

    captureStateResult(): APIResult{
         let r=api_Result(this.srv_.Capture.GetApiState());
         r.servertime = utils.getUnixTime();
         return r
    }

    constructor(port: number, srv: Server) {
        this.port_ = port;
        this.srv_ = srv;

        const mut = srv.Mut;

        const wrap = (api: APIHandler) => (req: http.IncomingMessage, query: url.UrlWithParsedQuery) => {
            mut.lock();
            try {
                return api(req, query);
            }
            finally {
                mut.unlock();
            }
        }

        this.tabAPI = {
            "/stop": wrap(async () => {
                await this.srv_.close()
                return { result: true }
            }),
            "/capture/start": wrap(async (r, q) => {
                const [ capt_st, state] = this.srv_.Capture.State;
                if (!capt_st) return api_Error("Захват изображения неактивен!");
                if (state === capt.CaptureState.Paused) {
                    await this.srv_.Capture.resumeWriteVideoFile();
                } else if (state !== capt.CaptureState.Running ) {
                    await this.srv_.Capture.startWriteVideoFile();
                } else {
                    return api_Error("Запись в файл уже идет!")
                }

                return this.captureStateResult();
            }),

            "/capture/pause": wrap(async (r, q) => {
                const [ capt_st, state] = this.srv_.Capture.State;
                if (!capt_st) return api_Error("Захват изображения неактивен!");
                if (state !== capt.CaptureState.Running ) return api_Error("Запись видеофайла не идет. Пауза не возможна!");
                
                await this.srv_.Capture.pauseWriteVideoFile();
                return this.captureStateResult();
            }),
            "/capture/stop": wrap(async (r, q) => {
                const file = "file" in q.query ? decodeURIComponent(q.query["file"] as string) : "";

                const [ capt_st, state] = this.srv_.Capture.State;
                if (!capt_st) return api_Error("Захват изображения неактивен!");
                if (!(state == capt.CaptureState.Running || state == capt.CaptureState.Paused )) 
                    return api_Error("Запись видеофайла не идет. Сохранение не возможно!");

                await this.srv_.Capture.stopWriteVideoFile(file);
                return this.captureStateResult();
            }),
            "/capture/state": async (r, q) => {
                return this.captureStateResult();
            },

            "/capture/snapshot": async (r, q) => {
                return { result: this.srv_.Snapshot(decodeURIComponent(q.query["file"] as string)) }
            },
            "/capture/signaltype": wrap(async (r, q) => {
                let pu = ParseUrl(r.url);
                return pu ? await this.srv_.Capture.SetInputSource(pu) : await this.srv_.Capture.GetInputSource();
            }),
            "/idebug": async (r, q) => {
                let cp = utils.anyCopy_Exc(undefined, this.srv_, { srv_: 0, http_: 0, Capture: 0, image_: 0, senders_: 0 })
                cp.Capture = utils.anyCopy_Exc(undefined, this.srv_.Capture, { handler_: 0, proc_: 0, cfg_: 0 })
                //return { result: JSON.stringify(cp, null, ' ') }
                return { result: cp }
            }
        }

        const sockets = new Set<Socket>();
        this.sockets_ = sockets;
        this.http_ = http.createServer(this.handle.bind(this));

        this.http_.on('connection', (socket) => {
            sockets.add(socket);
            socket.once('close', () => sockets.delete(socket));
        });
    }

    public async close() {
        const self = this;
        this.sockets_.forEach((socket => {
            socket.destroy();
            self.sockets_.delete(socket);
        }))

        await new Promise(r => this.http_.close(r));
    }

    private send(res: http.ServerResponse, data: string, ctype: string): void {
        res.writeHead(200, { "Content-Type": ctype });
        res.end(data);
    }

    private async serveMJPEG(req: http.IncomingMessage, res: http.ServerResponse) {
        const start = performance.now();

        const writeHead = (boundary: string) => res.writeHead(200, {
            'Cache-Control': 'no-store, no-cache, must-revalidate, pre-check=0, post-check=0, max-age=0',
            'Connection': 'close',
            'Content-Type': 'multipart/x-mixed-replace;boundary=' + boundary,
            'Pragma': 'no-cache',
        });

        const imgHead = (img: Buffer, ts: number) => ({
            'X-Timestamp': ts,
            'Content-Length': img.length,
            'Content-Type': 'image/jpeg',
        });

        let closed = false;
        res.addListener('close', () => {
            closed = true;
        });

        try {
            const boundary = "--boundarydonotcross";
            writeHead(boundary);
            while (!closed) {
                const img = this.srv_.Image;
                if (img === null) {
                    await wait(200);
                    continue;
                }
                const ihead: { [k: string]: any } = imgHead(img.data, img.ts.getTime());
                res.write(boundary + "\n");
                /*const hd = Object.entries(ihead).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n";
                res.write(hd);*/
                for (const h in ihead) {
                    res.write(Buffer.from(`${h}: ${ihead[h]}\n`));
                }
                //res.writeHead(200, ihead);
                res.write("\n");
                res.write(img.data);
                const elapsed = performance.now() - start;
                await wait(1000.0 / this.srv_.Config.FPS)
            }
        } catch (e) {
            error(e)
            await wait(200);
        }
    }

    private serve2MJPEG(req: http.IncomingMessage, res: http.ServerResponse) {
        const start = performance.now();

        const writeHead = (boundary: string) => res.writeHead(200, {
            'Cache-Control': 'no-store, no-cache, must-revalidate, pre-check=0, post-check=0, max-age=0',
            'Connection': 'close',
            'Content-Type': 'multipart/x-mixed-replace;boundary=' + boundary,
            'Pragma': 'no-cache',
        });

        const imgHead = (img: Buffer, ts: number) => ({
            'X-Timestamp': ts,
            'Content-Length': img.length,
            'Content-Type': 'image/jpeg',
        });

        const boundary = "--boundarydonotcross";
        try {
            writeHead(boundary);
        } catch (e) {
            error(e)
        }

        let sender = this.srv_.addSender((img: ImageInfo) => {
            try {
                const ihead: { [k: string]: any } = imgHead(img.data, img.ts.getTime());
                res.write(boundary + "\n");
                for (const h in ihead) {
                    res.write(Buffer.from(`${h}: ${ihead[h]}\n`));
                }
                res.write("\n");
                res.write(img.data);
            } catch (e) {
                error(e)
            }

        });

        res.addListener('close', () => {
            this.srv_.removeSender(sender);
        });

    }

    private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
        if (req.url) {
            const query = url.parse(req.url, true);
            const p = req.url.split("?")[0];
            const f = this.tabAPI[p];
            if (typeof f == 'undefined') {
                if (p === "/stream/mjpeg") {
                    this.serveMJPEG(req, res);
                    return;
                } else if (p === "/stream2/mjpeg") {
                    this.serve2MJPEG(req, res);
                    return;
                } else {
                    error("Неизвестный вызов", req.url);
                }
            } else {
                try {
                    log("HTTP ЗАПРОС:", req.url);
                    const result = await f(req, query);
                    this.send(res, JSON.stringify(result), "application/json");
                    if (result.error) error(result.error)
                    return;
                }
                catch (e) {
                    if (isError(e)) {
                        error(e);
                        this.send(res, JSON.stringify({ error: e.message }), "application/json");
                    }
                }
            }
        }

        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
    }

    public listen() {
        this.http_.listen(this.port_);
        log(`HTTP сервер запущен, порт ${this.port_}...`);
    }
}

type Sender = (img: ImageInfo) => void;

class Server {
    private srv_: ws.Server;
    private cfg_: Config;
    readonly Capture: capt.Capture;
    private image_: ImageInfo | null = null;
    private stats_: Stats;
    private count_: number = 0;
    private suspended_: boolean = true;
    private stopped_: number = 0;
    private http_: HttpServer;
    private lastSender_: number = 0;
    private senders_: { [id: string]: Sender } = {};

    readonly Mut: Mutex;

    get Image() { return this.image_ }
    get Config() { return this.cfg_ }

    constructor(cfg: Config) {
        this.cfg_ = cfg;
        this.srv_ = new ws.Server({ port: cfg.WebsocketPort });
        this.srv_.on("connection", this.connection.bind(this));
        this.Mut = new Mutex();

        this.Capture = new capt.Capture(cfg.Capture, this.splitter());

        this.stats_ = {
            wsBuffered: 0,
            sendingDelay: 0,
            streamStarted: false,
            timeToFirstImage: 0,
            timeStarted: new Date(),
            lastImageSize: 0,
        }

        const self = this;
        if (cfg.PrintStats) setInterval(() => self.printStats(), 1000);

        this.http_ = new HttpServer(cfg.HTTPPort, this);

        process.on("SIGTERM", this.close.bind(this));
        process.on("SIGINT", this.close.bind(this));

    }


    async close() {
        try {
            log("!! ОСТАНОВКА СЕРВИСА...");
            this.stopped_++;
            if (this.stopped_ > 1) {
                process.kill(process.pid, "SIGKILL");
                return;
            }
            await new Promise<void>(r => this.srv_.close(() => {
                log("!! ЗАКРЫТ СЕРВЕР WEBSOCKET");
                r();
            }));
            await this.http_.close();
            log("!! ОСТАНОВЛЕН Http сервер");
            await this.Capture.close();
            log("!! ОСТАНОВЛЕН ЗАХВАТ ВИДЕО");
        } catch (e) {
            error(e)
        }
    }


    private async checkConnectionCount() {
        if (this.cfg_.SuspendStreaming) {
            this.Mut.lock();
            try {
                const [streaming, capturing] = this.Capture.State;
                const needSuspend = this.count_ == 0 &&
                    capturing != capt.CaptureState.Running && streaming;
                if (needSuspend) {
                    log(`ПАУЗА СТРИМА`)
                    await this.Capture.stopStreamimg();
                    this.suspended_ = true;
                } else if (this.count_ > 0 && this.suspended_) {
                    log("ВОЗОБНОВЛЕНИЕ СТРИМА")
                    this.Capture.startStreaming();
                    this.suspended_ = false;
                }
            }
            finally {
                this.Mut.unlock();
            }
        }
    }

    private stats(img: Buffer) {
        if (!this.stats_.streamStarted) {
            this.stats_.streamStarted = true;
            const now = new Date();
            this.stats_.timeToFirstImage = now.getTime() - this.stats_.timeStarted.getTime();
            log("ПЕРВЫЙ КАДР:", now);
            log("ВРЕМЯ ДО ПЕРВОГО КАДРА:", this.stats_.timeToFirstImage);
        }
        this.stats_.lastImageSize = img.length;
    }

    private printStats() {
        log();
        log("ВРЕМЯ ДО ПЕРВОГО КАДРА:", this.stats_.timeToFirstImage);
        log("РАЗМЕР ПОСЛЕДНЕГО КАДРА:", this.stats_.lastImageSize);
        log("ЗАДЕРЖКА ОТПРАВКИ КАДРА:", this.stats_.sendingDelay);
        log("РАЗМЕР БУФЕРА WEBSOCKET:", this.stats_.wsBuffered);
        log("ПРИБЛ. КОЛИЧЕСТВО БУФЕРИЗОВАНЫХ КАДРОВ:", this.stats_.wsBuffered / this.stats_.lastImageSize);
    }

    public addSender(sender: Sender): number {
        const id = this.lastSender_++;
        this.senders_[id] = sender;
        return id;
    }

    public removeSender(senderID: number) {
        delete this.senders_[senderID];
    }

    private splitter(): (buf: Buffer) => void {
        let buf = Buffer.alloc(0);
        let imageStart = -1;
        let imageEnd = -1;

        const self = this;
        let count = 0;

        return async (data) => {
            //await wait(100)
            buf = Buffer.concat([buf, data]);
            while (!self.stopped_) {
                if (imageStart < 0) {
                    imageStart = buf.indexOf(SOI);
                    if (imageStart < 0) {
                        break;
                    }
                }

                imageEnd = buf.indexOf(EOI, imageStart + SOI.length);

                if (imageEnd >= imageStart) {
                    const img = buf.slice(imageStart, imageEnd + EOI.length);
                    self.stats(img);
                    buf = buf.slice(imageEnd + EOI.length);
                    imageStart = imageEnd = -1;
                    self.image_ = { data: img, ts: new Date(), count };
                    for (const id in self.senders_) {
                        self.senders_[id](self.image_);
                    }
                    count++;
                    await wait()
                } else {
                    break;
                }
            }
        }
    }

    Snapshot(filename: string) {
        let image = this.image_;
        if (!image) throw Error("Snapshot impossible, capture not active ")
        fs.writeFileSync(filename, image.data);

    }
    private async connection(ws: ws) {
        this.count_++;
        await this.checkConnectionCount();
        log("ОТКРЫТИЕ СОЕДИНЕНИЯ");
        let prevCount = -1;
        try {
            while (ws.readyState == 1 && !this.stopped_) {
                const started = performance.now();
                if (this.image_ !== null) {
                    const img = this.image_;
                    const wsBuffered = ws.bufferedAmount;
                    this.stats_.wsBuffered = wsBuffered
                    if (this.cfg_.RestrictBuffering &&
                        wsBuffered < img.data.length * this.cfg_.FPS * this.cfg_.RestrictBuffering) {
                        this.stats_.sendingDelay = new Date().getTime() - img.ts.getTime();
                        //if (prevCount >= 0 && img.count - prevCount > 1) {
                        //    console.log("COUNTERS MISMATCH:", prevCount, img.count);
                        //}
                        if (img.count != prevCount) {
                            ws.send(img.data);
                            //fs.appendFileSync("imgstats.json", JSON.stringify({ts: img.ts, count: img.count, tn: Date.now()})+"\n");
                            prevCount = img.count;
                        } else {
                            await wait(1);
                            continue;
                        }
                    }
                    const elapsed = performance.now() - started;
                    await wait((1000.0 / this.cfg_.FPS) - elapsed)
                } else {
                    await wait(200)
                }
            }
        }
        finally {
            log("ЗАКРЫТИЕ СОЕДИНЕНИЯ");
            this.count_--;
            setImmediate(this.checkConnectionCount.bind(this));
            ws.close();
        }
    }
    async startserver() {
        this.http_.listen();
        if (!this.cfg_.SuspendStreaming) {
            this.Capture.startStreaming();
        }
    }

}

const myDir = path.dirname(process.argv[1]);

function findcfgfile(fn: string): string | undefined {
    const fullfn = [`localhost.${os.hostname}/${fn}`, fn]
        .map(v => path.join(myDir, v))
        .filter(v => fs.existsSync(v))
    return fullfn.length ? fullfn[0] : undefined

}
function mkdir(dirnm: string) {
    if (!fs.existsSync(dirnm)) fs.mkdirSync(dirnm);
}
function __loadconfig() {
    //fs.existsSync( )
    const fn = findcfgfile("config.json");
    if (!fn) throw Error('Unable load config file')
    log("Load config from ", fn)
    const cfgs = fs.readFileSync(fn, { encoding: "utf8" });
    const cfg = JSON.parse(cfgs)
    return cfg;
}

function loadconfig() {
    const cfg: Config = menv.openconfig_file("config.json", true);
    return cfg;
}


async function main() {
    mkdir(path.join(myDir, "logs"))
    let srv = new Server(loadconfig());
    await srv.startserver()
}

//console.log( JSON.stringify( loadconfig() ) );
main();