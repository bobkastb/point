// Модуль serial.ts содержит:
// Функции для работы с последовательным портом

import fs from "fs";
import cnst from "constants";
import { promisify } from 'util';
import { wait } from "./sync";
import * as menv from "./environment";
import * as mdt from "./device-types";
import * as mutil from "./utils";
import * as mlog from "./log";


function log(...args: any[]) { }
const BUF_SIZE = 16;
async function fs_readSync(fd: number, buf: Buffer, bpos: number, len: number, flepos: number | null): Promise<number> {
    let code = fs.readSync(fd, buf, bpos, len, flepos)
    //let code=await new Promise<any>(r => { fs.read( fd, buf , bpos, len, flepos , (err,br)=>{ r(br); } ) });
    return code;
}

async function fs_writeSync(fd: number, buf: Buffer, bpos: number, len: number, flepos: number | null): Promise<number> {
    let code = fs.writeSync(fd, buf, bpos, len, flepos)
    //let code=await new Promise<any>(r => { fs.write( fd, buf , bpos, len, flepos , (err,br)=>{ r(br); } ) });
    return code;
}

export interface IPort {
    close(): Promise<any>;
    write(buf: Buffer): any;
    peekMessages(): Promise<Buffer[]>;
    waitMessages(timeout: number): Promise<Buffer[]>;
    waitMessage(timeout_ms: number): Promise<Buffer | undefined>;
    cb_OnReadMsg?: (buff: Buffer) => any;
    syspath: string;
}

export function testSerialOpen(pfn: string): string {
    try {
        //fs.O
        fs.closeSync(fs.openSync(pfn, cnst.O_RDWR | cnst.O_NOCTTY | cnst.O_NONBLOCK))
    } catch (e:any) {
        return e.code;
    }; return '';
}

export class Port {
    syspath: string;
    private fd_: number = -1;
    private fd_isopen: boolean = false;
    private rbuf_: Buffer;
    private state_: number = 0;
    private rpos_: number = 0;
    private timeout_: number;
    private delim_: number;
    private messages_: Buffer[] = [];
    private stop_ = false;
    private stopped_ = false;
    cb_OnReadMsg?: (buff: Buffer) => any;

    constructor(fpath: string, delim: number, timeout: number = 10) {
        this.syspath = fpath;
        this.rbuf_ = new Buffer(BUF_SIZE);
        this.timeout_ = timeout;
        this.delim_ = delim;
        this.ReopenFile();
        this.startReading();
    }

    private ReopenFile() {
        if (this.fd_isopen) fs.closeSync(this.fd_);
        this.fd_isopen = false;
        try {
            this.fd_ = fs.openSync(this.syspath, cnst.O_RDWR | cnst.O_NOCTTY | cnst.O_NONBLOCK);
            this.fd_isopen = true;
        } catch (e:any) {
            let m = "";
            switch (e.code) {
                case "ENOENT": m = "Файл не найден"; break
                case "EACCES": m = "Нет прав доступа"; break
                default: throw e;
            }
            throw Error(`Ошибка при открытии последовательного порта ${this.syspath} : ${m}  `)
        }

    }

    public write(buf: Buffer) {
        log("SERIAL WRITE MESSAGE:", buf.toString('utf8'));
        try {
            fs.writeSync(this.fd_, buf, 0, buf.length, null);
        } catch (e:any) {
            switch (e.code) {
                case "EIO": break
                default: throw e;
            }
            mlog.error(`Ошибка ввода/вывода. Порт будет открыт заново ${this.syspath}`);
            this.ReopenFile();
            fs.writeSync(this.fd_, buf, 0, buf.length, null);
        }

        //fs_writeSync(this.fd_, buf, 0, buf.length, null);
    }

    private split() {
        const msg = this.rbuf_.slice(0, this.rpos_);
        if (msg.length > 0) {
            log(`SERIAL ADD READ MESSAGE ${msg.length}:`, msg.toString('utf8'), "\n-->", msg);
            this.messages_.push(msg);
            if (this.cb_OnReadMsg) this.cb_OnReadMsg(msg);
        }
        this.rbuf_ = this.rbuf_.slice(this.rpos_ + 1);
        this.rpos_ = 0;
    }

    private async startReading() {
        while (!this.stop_) {
            if (this.state_ == 0) await wait(this.timeout_);
            else await wait();

            if (this.rpos_ == this.rbuf_.length) {
                this.rbuf_ = Buffer.concat([this.rbuf_, new Buffer(BUF_SIZE)]);
            }

            let wasError = false;
            try {

                //fs.read( this.fd_, this.rbuf_, this.rpos_,1, null , (err,br)=>{});
                //const n = (await fs_readSync(this.fd_, this.rbuf_, this.rpos_, 1, null));
                const n = fs.readSync(this.fd_, this.rbuf_, this.rpos_, 1, null);
                wasError = n < 1;

                if (!wasError) log(`SERIAL READ ${this.rpos_}:`, this.rbuf_.slice(this.rpos_, this.rpos_ + 1));
            }
            catch {
                wasError = true;
            }

            if (wasError) {
                this.state_ = 0;
            }
            else {
                this.state_ = 1;
                if (this.rbuf_[this.rpos_] == this.delim_) {
                    this.split();
                } else {
                    this.rpos_++;
                }
            }
        }
        this.stopped_ = true;
    }

    public pickupMessages(): Buffer[] {
        const result = this.messages_;
        this.messages_ = [];
        return result;
    }
    public async peekMessages(): Promise<Buffer[]> {
        if (!this.messages_.length) return [];
        return this.pickupMessages();
    }

    public async waitMessages(timeout_ms: number = 100): Promise<Buffer[]> {
        let deltaMS = 10;
        while ((!this.messages_.length) && timeout_ms > 0) {
            await wait(deltaMS); timeout_ms -= deltaMS;
        }
        return this.pickupMessages();
    }
    public async waitMessage(timeout_ms: number = 1000): Promise<Buffer | undefined> {
        let deltaMS = 10;
        while ((!this.messages_.length) && timeout_ms > 0) { await wait(deltaMS); timeout_ms -= deltaMS; }
        return this.messages_.shift();
        //let r=this.messages_[0];
        //this.messages_ = this.messages_.slice(1,this.messages_.length)
        //return r;
    }

    public hasMessages(): number {
        return this.messages_.length;
    }

    public async close() {
        this.stop_ = true;
        while (!this.stopped_) await wait(10);
        if (!this.fd_isopen) return;
        mlog.log("Close serial ", this.syspath);
        fs.closeSync(this.fd_);
        this.fd_isopen = false;
    }
} // class Port

export async function SetSerialPortParams(portSysPath: string, params?: string): Promise<any> {
    const env = menv.getEnv();
    let cmd = env["SerialPortSettingScript"]
    return await menv.Execute(`${cmd} '${portSysPath}' '${params}' `);
}
interface ISP_ParamsCfg {
    SerialPortFileName: string,
    ControlType: string
}
export async function SetSerialPortParamsByCfg(cfg: ISP_ParamsCfg): Promise<any> {
    return await SetSerialPortParams(cfg.SerialPortFileName, mdt.ControlTypes[cfg.ControlType].SerialPortSetting)
}