// Модуль visca.ts содержит:
// Функции работы с камерами поддерживающими протокол управления VISCA
import { ControlI, eCameraDataKeys, CamDataKeysPredefSets, rCamPosition,  eCgDP_key } from "./camera";
import {  ControlTypes, rCameraDeviceInfo } from "./device-types";
import { iPositionLimits , tDiagnosticMessages } from "./api_interfaces";
import { rCameraData , rCameraState , resCameraOperation , tTruncateValue , rImageTruncateData } from "./camera_interfaces";


import * as mcamera from "./camera";
import * as serial from "./serial";
import * as mutil from "./utils";
import { eErrorAction, minmax  } from "./utils"
import { Mutex } from "./sync";
import * as mlog from "./log";
import {isError} from "./gen_functions";
import crypto from "crypto";

//crypto.createHmac('md5', "1234").digest('hex')
//import { DH_NOT_SUITABLE_GENERATOR } from "constants";
//let LogEnabled:boolean=true;
//function log(...args: any[]) {   if (LogEnabled) mlog.log(...args);  }




type MovingDirection = {
    [key: string]: number[]
}

const movingDirection: MovingDirection = {
    UP: [0x03, 0x01],
    DOWN: [0x03, 0x02],
    LEFT: [0x01, 0x03],
    RIGHT: [0x02, 0x03],
    UPLEFT: [0x01, 0x01],
    UPRIGHT: [0x02, 0x01],
    DOWNLEFT: [0x01, 0x02],
    DOWNRIGHT: [0x02, 0x02],
    STOP: [0x03, 0x03]
};

export type ControlConfig = mcamera.CameraControlConfig;

//{   SerialPortFileName: string;    CameraDriveSpeed: number;    ReadAnswers: boolean;};
export type viscaErrorTypes = "TimeOut" | "Invalid answer length" | "Unknown device" | "Invalid Socket" | "Unknown Data" | "Unexpected answer"
    | 'Unknown Data' | "Syntax";


function viscaError(nm: viscaErrorTypes, txt: string): Error {
    let e = Error(`ViscaError[${nm}]:${txt}`); e.name = nm;
    switch (nm) {
        case "Invalid answer length":
            let sa = txt.split('<>')
            e.message = `Неожиданный размер ответа от устройства. Ожидается ${sa[0]}, а принято ${sa[1]} байт`;
            break;
        case 'Unknown Data':
            e.message = "Нераспознанный ответ камеры"
            break;
        case 'Syntax':
            e.message = "Устройство не поддерживает команду"
            break;

    }
    return e;
}

function Unsign2toSign(value: number): number {
    return value < 0x8000 ? value : value - 0x10000;
}

type eViscaOperationState = "send" | "pending" | "complete" | "error";
enum eViscaAck { ERROR, UNKNOWN, ACK, COMPLETION, DATA };
interface rViscaResult { data?: Buffer, opstate: eViscaOperationState, error?: Error, warning?: string, dummy?: boolean }
type rViscaAnsType = { device: number, socket?: number, type: eViscaAck, error?: Error, data?: Buffer }
type rViscaCmdType = { cntAns: number, device: number, socket?: number, ansp?: rViscaAnsType }
interface rViscaCameraOperation extends resCameraOperation {
    operation: rViscaResult
}
type rIfaceResult = {
    operation?: rViscaResult,
    error?: string
}
function printBuffer(ba: Buffer[]) {
    return ba.map((value) => value.toString("hex")).join(", ")
}

function parseViscaCommand(buf: Buffer): rViscaCmdType {
    if (buf[0] == 0x88) return { cntAns: 0, device: 0xFF };
    let device = buf[0] & 7;
    if (buf[1] == 1) return { cntAns: 2, device };
    if (buf[1] == 9) return { cntAns: 1, device };
    return { cntAns: 0, device };
}

function parseViscaAns(buf: Buffer | undefined, wdevice?: number, maxsocket = 2): rViscaAnsType {
    let lError = (who: viscaErrorTypes, msg: string = "") => { return viscaError(who, msg + " " + (buf ? printBuffer([buf]) : "")); }
    if (!buf) return { device: 0, type: eViscaAck.UNKNOWN, error: lError('TimeOut', "Не получен ответ устройства на команду") }
    let device = (buf[0] >> 4) & 7;
    if (wdevice && wdevice != device)
        return { device, type: eViscaAck.UNKNOWN, error: lError('Unknown device', "Ответ от незнакомого устройства") }
    let socket = buf[1] & 0x0F;
    let e_invalidLenght = (exp: number) => lError("Invalid answer length", `${exp}<>${buf.length}`)
    let e_invalidSocket = () => lError("Invalid Socket", `Ожидается от [1,${maxsocket}],принято от ${socket}`)
    switch (buf[1] & 0xF0) {
        case 0x60: // error len 3
            if (buf.length != 3)
                return { device, type: eViscaAck.UNKNOWN, error: e_invalidLenght(3) }
            let code = buf[2];
            const m = { 0x02: "Syntax", 0x03: "CmdBuffFull", 0x4: "Canceled", 0x5: "NoSocket", 0x41: "ConditionFault" }
            let eid = (m as any)[buf[2]];
            if (eid && code > 3 && (socket < 1 || socket > maxsocket))
                return { device, type: eViscaAck.UNKNOWN, error: e_invalidSocket() };
            if (!eid) eid = "Unknown Data";
            return { device, type: eViscaAck.ERROR, error: lError(eid as viscaErrorTypes, "Ошибка при обработке команды на камере") }
        case 0x40: //ack , len = 2
            if (buf.length != 2)
                return { device, type: eViscaAck.UNKNOWN, error: e_invalidLenght(2) }
            if (socket < 1 || socket > maxsocket)
                return { device, type: eViscaAck.UNKNOWN, error: e_invalidSocket() };
            return { device, type: eViscaAck.ACK, socket };
        case 0x50: //ack , len = 2
            if (buf[1] == 0x50) { // data
                return { device, data: buf, type: eViscaAck.DATA }
            } else { // 
                if (buf.length != 2)
                    return { device, type: eViscaAck.UNKNOWN, error: e_invalidLenght(2) }
                if (socket < 1 || socket > maxsocket)
                    return { device, type: eViscaAck.UNKNOWN, error: e_invalidSocket() }

                return { device, type: eViscaAck.COMPLETION, socket }
            }
        default:
            return { device, type: eViscaAck.UNKNOWN, error: lError('Unknown Data') }
    }
}

function prehandleViscaAns(buf: Buffer | undefined, pr: rViscaCmdType, expected: eViscaAck): rViscaAnsType {
    let r = parseViscaAns(buf, pr.device);
    if (!r.error && r.type != expected) r.error = viscaError('Unexpected answer', `Ожидается тип ответа:${eViscaAck[expected]} , но пришел ${eViscaAck[r.type]} `);
    if (!r.error) switch (expected) {
        case eViscaAck.ACK: pr.socket = r.socket; break;
        case eViscaAck.COMPLETION: if (pr.socket != r.socket)
            r.error = viscaError('Invalid Socket', `Ожидается ответ от сокета:${pr.socket} , но пришел ${r.socket}`);
    }
    return r;
}
function b2va(len: number, v: number): number[] {
    let res: number[] = []; v = Number(v);
    for (; len > 0; len--, v >>= 4) res.push(v & 0xF)
    return res.reverse()
}




export class Control implements ControlI {
    private port?: serial.IPort//serial.Port | null = null;
    private speed: number;
    private readAnswers: boolean = true;
    private mut: Mutex;
    private PendingMode: boolean = false;
    visca_device: number = 1; //1..7
    //speedRange: number[] = [1, 0x18];
    speedRange: [number,number] = [1, 0x18];
    lenPanPos: number = 4; //TODO need define! 

    activeProcess: { [key in eCgDP_key]?: number } = {}
    //activeProcess:{ [key:eCgDP_key]:number } ={}
    current_preset?: string;
    baseinfo: rCameraData = {};
    cfg: mcamera.CameraControlConfig;
    expected_hardid: string;
    DiagnosticMessages: tDiagnosticMessages = {};

    getCfg(): ControlConfig {
        return this.cfg;
    };
    constructor(cfg: ControlConfig) {
        this.cfg = cfg;
        this.mut = new Mutex();
        this.speed = cfg.CameraDriveSpeed;
        this.readAnswers = cfg.ReadAnswers != undefined ? cfg.ReadAnswers : this.readAnswers;

        //this.expected_hardid = crypto.createHmac('md5', this.cfg.ID ).digest('hex').slice(0,4)
        this.expected_hardid = crypto.createHash('md5').update(this.cfg.ID).digest('hex').slice(0, 4)

        //this.expected_hardid = md5(this.cfg.ID).slice(0,4);
        //console.log("md5(cfg.ID)=",md5(cfg.ID));
    }
    log(...args: any[]) { if (this.cfg.DebugOutput) mlog.log(...args); }
    getIds(): mcamera.SetOf_Id_Hard {
        return { id: this.cfg.ID, expected_hardid: this.expected_hardid, hardid: this.baseinfo.UserTagId }
    }
    onInitializeSucess(d: rCameraData) {
        let b = this.baseinfo;
        mlog.log(`Камера ${this.cfg.ID} управляема. идентификатор на камере:${b.UserTagId} макс.скорость:${b.MaxSpeed?.pan}. ${d.Version}`)
        this.DiagnosticMessages.InitError=undefined;
    }
    initerror(inf: any) {
        let se = mutil.getErrorMessage(inf);
        mlog.error("Ошибка при инициализации камеры:", inf);
        this.DiagnosticMessages.InitError = inf;
        if (this.port) this.port.close();
        this.port = undefined;
    }
    async async_initialize(): Promise<any> {
        if (!this.cfg.SerialPortFileName) return;
        this.DiagnosticMessages = {};
        if (!this.port) {
            try {
                await serial.SetSerialPortParamsByCfg(this.cfg)
                this.port = new serial.Port(this.cfg.SerialPortFileName, 0xFF);
                this.port.cb_OnReadMsg = this.onRead_fromSerial.bind(this);
            } catch (e) {
                this.initerror(mutil.getErrorMessage(e));
                this.port = undefined;
                return
            }
        }
        try {
            let cd = await this.getCameraData(["info"], { ea: eErrorAction.Throw }) //{ ea:eErrorAction.Continue} )
            if (cd.error) {
                this.initerror(cd.error)
            } else     
                this.onInitializeSucess(cd)
        } catch (e) {
            this.initerror(e)
            return
        };
    };

    async onRead_fromSerial(buf: Buffer) {
        //buf.entries()
        let pr = parseViscaAns(buf, this.visca_device)
        let tbuf = printBuffer([buf]);
        let err = (pr.error ? mutil.getErrorMessage(pr.error).replace(tbuf, '') : "");
        this.log(`visca.serial[${this.port?.syspath}].Read=${tbuf}`, (err ? err : ""))
    }

    async readViskaAns(timeout_ms: number, pr: rViscaCmdType, expected: eViscaAck): Promise<rViscaAnsType> {
        if (!this.port) throw "Internal"
        const b = await this.port.waitMessage(timeout_ms);
        return prehandleViscaAns(b, pr, expected)
        //let r = parseViscaAns( buf , pr.device );
    }

    private async viscaCmd(buf: Buffer | number[], ea: eErrorAction = eErrorAction.Throw): Promise<rViscaResult> {
        if (!this.port) return { opstate: "complete", dummy: true };
        //if (buf is Buffer) 
        if (Array.isArray(buf)) buf = Buffer.from(buf);
        let res: rViscaResult = { opstate: "send" };
        let onError = (va: rViscaAnsType) => {
            res.error = va.error;
            if (ea == eErrorAction.Throw) throw va.error;
        }
        await this.mut.lock();
        try {
            //let pbuff= this.port.peekMessages(); log();
            let pm = await this.port.peekMessages();
            let pmData = printBuffer(pm);
            if (pmData) this.log(`visca.serial[${this.port?.syspath}].Unexpected(${pmData})`);
            if (buf[0] != 0x88) buf[0] = 0x80 + this.visca_device;
            let pI = parseViscaCommand(buf);
            this.log(`visca.serial[${this.port?.syspath}].Write(${printBuffer([buf])}) pI=${JSON.stringify(pI)}`)

            //let its_Cmd =  buf[1]


            this.port.write(buf);
            let waitcntAns = pI.cntAns;
            if (this.PendingMode && pI.cntAns == 2) waitcntAns = 1;

            if (this.readAnswers) {
                switch (pI.cntAns) {
                    case 1: {
                        res.opstate = "complete";
                        let va = await this.readViskaAns(3 * 1000, pI, eViscaAck.DATA);
                        if (va.error) { onError(va); return res; }
                        res.data = va.data;
                        break;
                    }
                    case 2: {
                        //z0 4y FF
                        //let st= waitcntAns>1 ? waitcntAns-2
                        let va = await this.readViskaAns(1000, pI, eViscaAck.ACK);
                        if (va.error) { onError(va); return res; }
                        va = await this.readViskaAns(this.PendingMode ? 100 : 5 * 1000, pI, eViscaAck.COMPLETION);
                        if (va.data) res.data = va.data;
                        if ((va.error?.name == "TimeOut") && (this.PendingMode)) {
                            res.opstate = "pending";
                        } else if (va.error) { onError(va); return res; }
                        else res.opstate = "complete";
                    } break;
                    default: res.opstate = "error"; break;
                };
            } else
                res.opstate = "complete";
            return res;
        } finally {
            this.mut.unlock();
        }
    }


    public async close() {
        if (this.port) await this.port.close();
    }

    refCameraDeviceInfo?: rCameraDeviceInfo;
    getCameraDeviceInfo(): rCameraDeviceInfo | undefined {
        if (!this.refCameraDeviceInfo)
            this.refCameraDeviceInfo = ControlTypes[this.cfg.ControlType]?.CameraDeviceSetting
        return this.refCameraDeviceInfo;
    }
    //ControlTypes[ this.cfg.ControlType ]?.CameraDeviceSetting?.Optics
    ParamPerDegree(nm: keyof iPositionLimits | 0 | 1): number {
        nm = nm == 0 ? "x" : nm == 1 ? "y" : nm;
        let pl = this.getCameraDeviceInfo()?.Optics?.PosLimits;
        if (!pl) throw "Internal (ParamPerDegree)"
        return (pl.Param[nm][1] - pl.Param[nm][0]) / (pl.Degree[nm][1] - pl.Degree[nm][0])
    };
    getAngleShift(nm: keyof iPositionLimits, zoom: number, pfrom: number, pto: number): number[] { // param, degree
        let opts = this.getCameraDeviceInfo()?.Optics;
        let vangle = opts?.ViewingAngle; let lims = opts?.PosLimits;
        if (!lims || !vangle) throw Error("Not possible calc angle shift!");
        let C = 2 * Math.tan(((vangle[nm] / zoom) / 2) * Math.PI / 180)
        let beta = (Math.atan(C * pto) - Math.atan(C * pfrom)) * 180 / Math.PI;
        beta = -beta;
        let parPerDegree = this.ParamPerDegree(nm);

        this.log(`C=${C} beta=${beta} vangle=${vangle[nm]}`)
        return [parPerDegree * beta, beta]
    }
    posParam2Degree(pp: number[]): number[] {
        return pp.map((value, index) => value / this.ParamPerDegree(index as (0 | 1)))
    }
    zoom_p2v(p: number): number {
        let limits = this.getCameraDeviceInfo()?.Optics?.ZoomLimits;
        let poly = limits?.Param2SizeApproximation?.Polynom
        if (!poly || !limits) return 1;
        if (p >= limits.Param[1]) return limits.TheSize[1];
        let x = 1, v = 0; // x= p^n
        if (p < 100) return 1
        for (let k of poly) { v += x * k; x *= p; }
        return v;
    }

    private PanoramaConstParams_?: mcamera.rPanoramLocation;
    getPanoramaConstParams(): mcamera.rPanoramLocation | undefined {
        if (this.PanoramaConstParams_) return this.PanoramaConstParams_;
        let di = ControlTypes[this.cfg.ControlType]?.CameraDeviceSetting?.Optics;
        if (!di?.PosLimits || !di?.ViewingAngle) return;
        this.PanoramaConstParams_ = mcamera.calcPanoPositions(di);
        return this.PanoramaConstParams_;
    }

    PosParam2Global(posparam: number[]): number[] | undefined {
        let pc = this.getPanoramaConstParams();
        return pc ? mcamera.Pano_Param2GPos(pc, posparam) : undefined;
    }
    

    async setGlobalPosition(query: rCamPosition): Promise<resCameraOperation> {
        let dInf = ControlTypes[this.cfg.ControlType]?.CameraDeviceSetting?.Optics;
        if (!dInf || !dInf.ViewingAngle || !dInf.PosLimits?.Degree || !dInf.PosLimits?.Param || !dInf.ZoomLimits) throw Error("Неизвестен угол обзора камеры")
        if (!query.posTo || query.posFrom || query.zoomwheel) throw Error("Internal: invalid parametrs for 'setGlobalPosition'")
        if (query.posTo[0] < 0 || query.posTo[0] > 1 || query.posTo[1] < 0 || query.posTo[1] > 1)
            throw Error("Internal: invalid position for 'setGlobalPosition'")
        let res: resCameraOperation = {};

        let clocs = this.getPanoramaConstParams();
        if (!clocs) throw Error("Глобальное позиционирование не поддерживается!")
        let pp = mcamera.calclAbsPosInPano(clocs, query.posTo);
        let delta =
        {
            x: - this.getAngleShift('x', 1, 0, pp.rel_shift[0])[0]
            , y: - this.getAngleShift('y', 1, 0, pp.rel_shift[1])[0]
        }
        let clcpos = [Math.round(pp.center[0] + delta.x), Math.round(pp.center[1] + delta.y)]
        let newpos = [
            minmax(clcpos[0], clocs.plp.x[0], clocs.plp.x[1]),
            minmax(clcpos[1], clocs.plp.y[0], clocs.plp.y[1])]
        let truncate:[tTruncateValue, tTruncateValue] = [trunctag(clcpos[0], newpos[0]), trunctag(clcpos[1], newpos[1])]
        if (truncate[0] || truncate[1])
            res.truncate = { PanTiltPos: truncate }
        //if (Object.keys(d_truncate).length) res.truncate = d_truncate;
        console.log(`setGlobalPosition: `, { clocs, pp, delta, newpos, truncate })

        //let d:rCameraData={PanTiltPos:newpos , ZoomPos:dInf.ZoomLimits.Param[0] }
        let d: rCameraData = { PanTiltPos: newpos }
        await this.setCameraData(d);
        res.state = this.getStateSync()
        return res;
    };

    async setPosition(q: rCamPosition): Promise<resCameraOperation> {
        const msgOPref = `Camera ${this.cfg.ID}.setPosition(${JSON.stringify(q)}):`;
        let res: resCameraOperation = {};
        let opts = this.getCameraDeviceInfo()?.Optics;
        const xyk: (keyof iPositionLimits)[] = ["x", "y"]
        function shiftloc(sh: number[], ...points: number[][]) { for (let p of points) for (let i in p) p[i] += sh[i] }
        let cdata = res.prevData = await this.getCameraData(["ZoomPos", "PanTiltPos"]);
        if (!cdata.ZoomPos || !cdata.PanTiltPos) throw cdata.error
        let d_truncate: rImageTruncateData = {};
        let do_direction = async (q: rCamPosition) => {
            //if (q.posTo[0]<-0.5 || q.posTo[0]>0.5 || query.posTo[1]<0 || query.posTo[1]>1) 
            if (!q.posFrom || !q.posTo) throw Error("internal (setPosition)");
            let limits = opts?.PosLimits?.Param; if (!limits) throw Error("Camera parametrs not defined (Limits Pan-Tilt)");
            let d: typeof cdata = { PanTiltPos: cdata.PanTiltPos }
            if (!d.PanTiltPos) throw Error(d.error);
            let zoom_value = this.zoom_p2v(Number(cdata.ZoomPos));

            let msg = ["", ""];
            let truncate:[tTruncateValue, tTruncateValue] = [0, 0]
            for (let i = 0; i < 2; i++) {
                let va = this.getAngleShift(xyk[i], zoom_value, q.posFrom[i], q.posTo[i]);
                let v = va[0] + d.PanTiltPos[i];
                let l = limits[xyk[i]];
                let nv = minmax(v, l[0], l[1]);
                d.PanTiltPos[i] = nv;
                truncate[i] = trunctag(v, nv);
                msg[i] = `${xyk[i]}: ${q.posFrom[i]}->${q.posTo[i]} : P=${nv}-${va[0]} D+=${va[1]} T=${truncate[i]} zoom=${zoom_value}`
            }
            if (truncate[0] || truncate[1])
                d_truncate.PanTiltPos = truncate;
            this.log(msgOPref, "\n", msg.join("\n"));
            res.postData = await this.setCameraData(d);
            //res.shiftpos= { settoXY:d.PanTiltPos ,  truncate:trsign?truncate:undefined }
            //cdata.PanTiltPos = this.posParam2Degree( d.PanTiltPos );
            //CurrPosXY:this.posParam2Degree(d.PanTiltPos)
            //if (trsign) res.
        }
        let do_zoom = async (zoomwheel: number) => {
            const zoomlimits = [12, 16384];
            const zoom_par_scale = 120;
            let d: typeof cdata = { ZoomPos: cdata.ZoomPos }
            if (!d.ZoomPos) d.ZoomPos = zoomlimits[0];
            let oldz = d.ZoomPos;
            let pre_v = d.ZoomPos + Math.floor((zoomwheel / zoom_par_scale) * (zoomlimits[1] - zoomlimits[0]));
            d.ZoomPos = minmax(pre_v, zoomlimits[0], zoomlimits[1]);
            let trunc = trunctag(pre_v, d.ZoomPos)
            if (trunc) d_truncate.ZoomPos = trunc;
            this.log(`${msgOPref} delta: ${d.ZoomPos - oldz} abs:${d.ZoomPos}`);
            if (d.ZoomPos != oldz)
                await this.setCameraData(d);
            cdata.ZoomPos = d.ZoomPos;
        }
        //---------------------
        let cntops = 0;
        if (q.posFrom) { await do_direction(q); cntops++ }
        if (q.zoomwheel) { await do_zoom(q.zoomwheel); cntops++ }
        if (!cntops) res.error = "Nothing to do!";
        if (Object.keys(d_truncate).length) res.truncate = d_truncate;
        res.state = this.getStateSync()
        return res;
    };

    private async inquiry(d: number[]): Promise<Buffer | Error> {
        const result = await this.viscaCmd(d, eErrorAction.Break);
        return result.error ? result.error : result.data ? result.data : new Buffer("");
    }
    getinq_VArr(result: Buffer, start: number, lens: number[]): number[] {
        let res: number[] = [];
        let sti = start;
        for (let len of lens) {
            let v = 0;
            for (let i = 0; i < len; i++)  if (result[i + sti] & 0xF0) throw Error(`Visca(:Invalid data at answer pos ${i + sti}`);
            for (let i = 0; i < len; i++) { v = v << 4 | (result[i + sti] & 0xF); }
            res.push(v)
            sti += len;
        }
        return res;
    }


    public async setCameraData(data: rCameraData, ea: eErrorAction = eErrorAction.Throw): Promise<rCameraData> {
        if (!this.port) return { error: "port not defined!" }
        //SET
        //AbsolutePosition 8x 01 06 02 VV WW 0Y 0Y 0Y 0Y 0Y  0Z 0Z 0Z 0Z FF |  VV  WW -speed (1-x18) Y - PAn , Z- Tilt
        // Focus Direct 8x 01 04 48 0p 0q 0r 0s FF |  pqrs: Focus Position 
        // ZOOM Direct 8x 01 04 47 0p 0q 0r 0s FF | pqrs:Zoom Position Note 1
        let result: rCameraData = {}; let resNCond: any = {}
        mcamera.rtCheck_Keys_rCameraData(Object.keys(data), true, eErrorAction.Throw);
        let errs: any[] = [];
        let self = this;
        let docmd = async (k: keyof rCameraData, c: number[]) => {
            let r = await self.viscaCmd(c, eErrorAction.Break);
            if (r.error) {
                r.error.message = `On setCameraData(${k}=${data[k]}). ` + r.error.message;
                errs.push(r.error.message);
                if (ea == eErrorAction.Throw) throw r.error;
            } else (result as any)[k] = data[k];
            return r;
        }
        async function set_full(k: keyof rCameraData, pre: number[], dta: number[], cond = true) {
            let v = data[k]; if (v == undefined) return;
            if (!cond) { resNCond[k] = 1; return; }
            if (typeof v != "number" && typeof v != "boolean") throw "Internal seti"
            return await docmd(k, [0x81, ...pre, ...dta, 0xFF]);
        }
        async function setb(k: keyof rCameraData, fb: number) {
            await set_full(k, [0x01, 0x04, fb], [data[k] ? 0x02 : 0x03], true);
        }
        async function seta(k: keyof rCameraData, pre: number[], cond = true) {
            await set_full(k, pre, [Number(data[k])], cond);
        }
        async function seti(k: keyof rCameraData, fb: number, len = 4, cond = true) {
            await set_full(k, [0x01, 0x04, fb, ...[0, 0, 0, 0].slice(0, 4 - len)], b2va(len, Number(data[k])), cond);
        }

        try {

            await setb("FocusAuto", 0x38)    // 0x81,0x01,0x04,fb,data[k]?0x02:0x03,0xFF
            await seti("ZoomPos", 0x47, 4) // [0x81,0x01,0x04,fb,...[0,0,0,0].slice(0,4-len),...b2va(len,v),0xFF]);
            await seti("FocusPos", 0x48, 4, !data.FocusAuto) // [0x81,0x01,0x04,fb,...[0,0,0,0].slice(0,4-len),...b2va(len,v),0xFF]);
            if (data.PanTiltPos != undefined) {
                let sppedop = data.Speed_OP ? data.Speed_OP : [0x18, 0x18];
                await docmd("PanTiltPos", [0x81, 0x01, 0x06, 0x02, sppedop[0], sppedop[1],
                    ...b2va(this.lenPanPos, data.PanTiltPos[0]),
                    ...b2va(4, data.PanTiltPos[1]), 0xFF]);
            }
            //if (GainPos in data)
            if (data.UserTagId == "") data.UserTagId = this.expected_hardid
            //await set_full( "UserTagId" , [0x01,0x04,0x22] , b2va(4,parseInt(String(data.UserTagId), 16)) , true ); }
            if (data.UserTagId != undefined)
                await docmd("UserTagId", [0x81, 0x01, 0x04, 0x22, ...b2va(4, parseInt(data.UserTagId, 16)), 0xFF]);

            await seta("WBMode", [0x01, 0x04, 0x35]);
            await seti("RGain", 0x43, 2); // [0x81,0x01,0x04,fb,...[0,0,0,0].slice(0,4-len),...b2va(len,v),0xFF]);
            await seti("BGain", 0x44, 2); // [0x81,0x01,0x04,fb,...[0,0,0,0].slice(0,4-len),...b2va(len,v),0xFF]);
            await setb("SlowShutterAuto", 0x5A)    // 0x81,0x01,0x04,fb,data[k]?0x02:0x03,0xFF
            await seti("ShutterPos", 0x4A, 2, !data.SlowShutterAuto); // [0x81,0x01,0x04,fb,...[0,0,0,0].slice(0,4-len),...b2va(len,v),0xFF]);
            await seti("IrisPos", 0x4B, 2);
            await seti("GainPos", 0x4C, 2);
            await seti("BrightPos", 0x4D, 2);
            await setb("ExposureCompensOn", 0x3E)    // 0x81,0x01,0x04,fb,data[k]?0x02:0x03,0xFF
            await seti("ExposureCompensPos", 0x4E, 2, data.ExposureCompensOn);
            await setb("BackLigthOn", 0x33)    // 0x81,0x01,0x04,fb,data[k]?0x02:0x03,0xFF
            await seti("ApertureGain", 0x42, 1);
            //"RGain","BGain","WBMode","ApertureGain","ExposureMode","BackLigthOn","ExposureCompensOn","SlowShutterAuto","ShutterPos","IrisPos","GainPos","BrightPos","ExposureCompensPos"

            let ignf = Object.keys(data).filter(value => !(value in result || value in resNCond || mcamera.KeysAll_iCameraDataExt.has(value)));
            if (ignf.length) {
                result.warning = `Camera ${this.cfg.ID} <setCameraData> ignored next fields: ${ignf}`;
                mlog.warning(result.warning);
            }
            if (errs.length) data.error = errs.join('. ');
        } finally {
            this.updateCashCameraData(data)
        }
        return data;
    };
    public async getCameraData(who: eCgDP_key[], opt: mcamera.options_gcd = { ea: eErrorAction.Throw }): Promise<rCameraData> {
        if (!this.port) return { error: "port not defined!" }
        //CAM_ZoomPosInq 8x 09 04 47 FF  => y0 50 0p 0q 0r 0s FF pqr: Zoom Position 
        //CAM_FocusPosInq 8x 09 04 48 FF  => y0 50 0p 0q 0r 0s FF pqr: Focus Position 
        //PanTilt_Position 8x 09 06 12 FF => y0 50 0p 0q 0r 0s 0t 0u 0v 0w 0x FF pqrst: Pan Position uvwx: Tilt Position
        //console.log("WHO=",who);
        let errPrefix = `Camera ${this.cfg.ID}.getCameraData `;
        //let whos=new Set<mcamera.eCgDP_key>();
        let we: eCgDP_key[] = []; let invkeys = [];
        for (let n of who) {
            if (mcamera.KeysAll_iCameraData.has(n)) we.push(n);
            else if (n in CamDataKeysPredefSets) {
                let a = (CamDataKeysPredefSets as any)[n];
                if (!a) { invkeys.push(n); continue }
                we.push(...a);
            } else invkeys.push(n);
        }
        who = we;
        let errs: string[] = [];
        let pusherrB = (nm: string, err: any) => {
            errs.push(`${nm}::${mutil.getErrorMessage(err)}`)
            if (opt.ea != eErrorAction.Throw) return
            if (isError(err)) {
                err.message += `, при попытке получить данные(${nm})`;
                throw err;
            }
            throw Error(`${errs.join('. ')} on ${errPrefix}`)
        }
        let pusherr = (nm: eCameraDataKeys, err: any) => { pusherrB(nm, err) }

        if (invkeys.length) pusherrB('', Error(`Invalid query parametrs ${invkeys}`));
        let whos = new Set<mcamera.eCgDP_key>(who);
        let res: rCameraData = {};
        let hascombine = (...nms: eCameraDataKeys[]) => {
            if (nms.filter(v => whos.has(v)).length > 0)
                nms.forEach(v => whos.add(v));
        }

        //console.log(`Query to camera ${this.cfg.ID}`,who.join(', '));
        //--------
        let f_BigQ = async () => {
            if (opt.nobigQ) return;
            if (mutil.set_has(CamDataKeysPredefSets.LensControlSystem, whos)) {
                let buf = await this.inquiry([0x81, 0x09, 0x7E, 0x7E, 0x00, 0xFF]); // lens system control inquiry 00
                if (isError(buf)) { pusherrB('BigQ LensControlSystem', buf); return; }
                if (buf.length < 15) { pusherrB('BigQ LensControlSystem', viscaError(`Invalid answer length`, '')); return }
                res.ZoomPos = this.getinq_VArr(buf, 2, [4])[0];
                res.FocusPos = this.getinq_VArr(buf, 8, [4])[0];
                res.DZoomMode = buf[13] >> 5;
                res.DZoomOn = (buf[13] & 2) != 0;
                res.AFMode = (buf[13] >> 3) & 3;
                res.FocusAuto = (buf[13] & 1) != 0;
                res.Executing_Memrecall = (buf[14] & 4) != 0;
                res.Executing_Focus = (buf[14] & 2) != 0;
                res.Executing_Zoom = (buf[14] & 1) != 0;
            }
            if (mutil.set_has(CamDataKeysPredefSets.CameraControlSystem, whos)) {
                let buf = await this.inquiry([0x81, 0x09, 0x7E, 0x7E, 0x01, 0xFF]); // lens system control inquiry 00
                if (isError(buf)) { pusherrB('BigQ CameraControlSystem', buf); return; }
                if (buf.length < 15) { pusherrB('BigQ CameraControlSystem', viscaError(`Invalid answer length`, '')); return }

                res.RGain = this.getinq_VArr(buf, 2, [2])[0];
                res.BGain = this.getinq_VArr(buf, 4, [2])[0];
                res.WBMode = buf[6] & 0xF;  // & 7 
                res.ApertureGain = buf[7] & 0x7;  // & 7 
                res.ExposureMode = [(buf[8] & 0x1F), (buf[9] & 8) << 8];
                res.BackLigthOn = (buf[9] & 4) != 0;
                res.ExposureCompensOn = (buf[9] & 2) != 0;
                res.SlowShutterAuto = (buf[9] & 1) != 0;
                res.ShutterPos = buf[10] & 0x1F;
                res.IrisPos = buf[11];// & 0x1F; 
                res.GainPos = buf[12];// & 0x0F)!=0; 
                res.BrightPos = buf[13];// & 0x1F)!=0; 
                res.ExposureCompensPos = buf[14];// & 0x1F)!=0; 
            }
        }
        //--------
        let cbuffer: Buffer = Buffer.from([]);
        let ftest = (nm: eCameraDataKeys) => whos.has(nm) && !(nm in res);
        let cmdhandle = async (nm: eCameraDataKeys, inq: number[], tp: 1 | 4 | "bool", format?: '0X' | 'XX') => {
            if (!ftest(nm)) return;
            //if (!(nm in res) && (cond || (cond==undefined && whos.has(nm))))  return; 
            let cbuffer = await this.inquiry([0x81, 0x09, 0x04, ...inq, 0xFF]) as Buffer;
            if (isError(cbuffer)) { pusherr(nm, cbuffer); return; }
            let len = tp == "bool" ? 1 : tp;
            if (len + 2 != cbuffer.length) { pusherr(nm, viscaError('Invalid answer length', `${len + 2}<>${cbuffer.length}`)); return };
            let v = this.getinq_VArr(cbuffer, 2, [len])[0];
            (res as any)[nm] = tp == "bool" ? v == 2 : v;
        }
        let inq_handle = async (nm: eCameraDataKeys, inq: number[], lens: number[]): Promise<boolean> => {
            if (!ftest(nm)) return false;
            inq = (inq.length == 1) ? [0x09, 0x04].concat(inq) : inq;
            cbuffer = await this.inquiry([0x81, ...inq, 0xFF]) as Buffer;
            if (isError(cbuffer)) { pusherr(nm, cbuffer); return false; }
            if (lens.includes(cbuffer.length)) return true;
            pusherr(nm, viscaError('Invalid answer length', ` ${lens}<>${cbuffer.length}`));
            return false;
        }
        hascombine("FocusPos", "FocusAuto");
        try {

            //f_BigQ();
            await cmdhandle("ZoomPos", [0x47], 4);
            await cmdhandle("FocusPos", [0x48], 4);
            await cmdhandle("FocusAuto", [0x38], "bool");
            //    await this.viscaCmdIface([0x81, 0x09, 0x04, 0x3F, 0xFF])
            // CurrentPreset   ([0x81, 0x01, 0x04, 0x3F, 0x02, p, 0xFF]
            //await cmdhandle("CurrentPreset", [0x3F], 1 );
            if (await inq_handle("CurrentPreset", [0x09, 0x04, 0x3f], [3]))
                res.CurrentPreset = cbuffer[2]


            if (await inq_handle("PanTiltPos", [0x09, 0x06, 0x12], [5 + 4 + 2, 4 + 4 + 2]))
                res.PanTiltPos = this.getinq_VArr(cbuffer, 2, [(cbuffer.length == 5 + 4 + 2 ? 5 : 4), 4]) //TODO:5,4!!
                    .map(value => Unsign2toSign(value)); //TODO!!!

            if (await inq_handle("UserTagId", [0x09, 0x04, 0x22], [6]))
                res.UserTagId = this.getinq_VArr(cbuffer, 2, [4])[0].toString(16);
            if (await inq_handle("MaxSpeed", [0x09, 0x06, 0x11], [4])) {
                //TODO:!! res.MaxSpeed={pan: b[2],tilt: b[3]}; // Так в доке. на самом деле - не так
                let v = (cbuffer[2] << 4) | cbuffer[3]; res.MaxSpeed = { pan: v, tilt: v };
            }
            if (await inq_handle("Version", [0x09, 0x00, 0x02], [9])) {
                let b = cbuffer;
                res.Version = `Model:${((b[3] << 16) + (b[4] << 8) + b[5]).toString(16)} ROM:${((b[6] << 8) + b[7]).toString(16)} Sock:${b[8]}`;
            }
            await cmdhandle("AEMode", [0x39], 1);
            await cmdhandle("BackLigthOn", [0x33], "bool");
            await cmdhandle("WBMode", [0x35], 1);
            await cmdhandle("ApertureGain", [0x42], 4);
            await cmdhandle("RGain", [0x43], 4); //int4
            await cmdhandle("BGain", [0x44], 4); //int4
            await cmdhandle("SlowShutterAuto", [0x5a], "bool"); //bool
            await cmdhandle("ShutterPos", [0x4A], 4); //int4
            await cmdhandle("IrisPos", [0x4B], 4); //int4
            await cmdhandle("GainPos", [0x4C], 4); //int4
            await cmdhandle("BrightPos", [0x4D], 4);
            await cmdhandle("ExposureCompensOn", [0x3e], "bool"); //bool
            await cmdhandle("ExposureCompensPos", [0x4E], 4);

            await cmdhandle("AFMode", [0x57], 1);
            await cmdhandle("DZoomOn", [0x06], "bool");
            await cmdhandle("DZoomMode", [0x36], 1);  // is array

            //for (let n in res) if ( !whos.has(n as mcamera.eCgDP_key) ) delete res[n as keyof typeof res];   
            //if (errs.length)  throw Error(`${errPrefix}: ${ errs.join('. ')}`); 
        } finally {
            this.updateCashCameraData(res);
        }
        if (errs.length) res.error = `${errPrefix}: ${errs.join('. ')}`;
        if (res.error && opt.ea == eErrorAction.Throw) throw Error(res.error)
        return res;
    }

    updateCashCameraData(newval: rCameraData) {
        mutil.typedCopy(this.baseinfo, newval);
        let bi = this.baseinfo;
        if (newval.PanTiltPos) {
            bi.PanTiltPos_h = this.posParam2Degree(newval.PanTiltPos);
            let p = this.PosParam2Global(newval.PanTiltPos);
            if (p) bi.PanTiltPos_Pano = p;
        }

        if (newval.ZoomPos) bi.ZoomPos_h = this.zoom_p2v(newval.ZoomPos);
        if (this.baseinfo.CurrentPreset != undefined) this.current_preset = String(this.baseinfo.CurrentPreset);
        if (!bi.error) bi.error = undefined;

    }



    public async getState(noupdate?: boolean): Promise<rCameraState> {
        if (!noupdate) {
            let getlist: eCameraDataKeys[] = [];
            let chlist: eCameraDataKeys[] = ["PanTiltPos", "ZoomPos", "CurrentPreset"];
            for (let nm of chlist)
                if (this.baseinfo[nm] == undefined || this.activeProcess[nm]) getlist.push(nm)
            if (getlist.length)
                await this.getCameraData(getlist);
        }
        return this.getStateSync();
    };

    public getStateSync(): rCameraState {
        let r: rCameraState = {
            ID: this.cfg.ID, Name: this.cfg.DisplayName,
            Controlled: this.port ? true : false,
            Pin_SwitchIn: this.cfg.Pin_SwitchIn,
            speedRange: this.speedRange,
            speed: this.speed,
            port: this.cfg.SerialPortFileName,
            readAnswers: this.readAnswers,
            current_preset: this.current_preset,
            DiagnosticMessages: mcamera.getDiagnosticMessages(this),
            camdata: this.baseinfo,
            PanoramaApiPath: this.cfg.PanoramaFile?.apipath,
        }
        let x: any = r;
        for (let n in r) if (!x[n]) delete x[n];
        return r;
    };

    private async getCameraDataIface(who: eCgDP_key[], opt: mcamera.options_gcd = { ea: eErrorAction.Throw }): Promise<rViscaCameraOperation> {
        let cd = await this.getCameraData(who, opt)
        let r: rViscaCameraOperation = {
            operation: { opstate: cd.error ? "error" : "complete" },
            state: await this.getState(),
            error: cd.error ? mutil.getErrorMessage(cd.error) : undefined
        };
        return r;
    }
    private async viscaCmdIface(buf: Buffer | number[]): Promise<rViscaCameraOperation> {
        let op = await this.viscaCmd(buf)
        let r: rViscaCameraOperation = {
            operation: op,
            state: await this.getState(),
            error: op.error ? mutil.getErrorMessage(op.error) : undefined
        };
        return r;
    }

    public async turnOn(): Promise<resCameraOperation> {
        this.activeProcess = {}
        return await this.viscaCmdIface([0x81, 0x01, 0x04, 0x00, 0x02, 0xFF]);
    }

    public async turnOff(): Promise<resCameraOperation> {
        this.activeProcess = {} // TODO:
        return await this.viscaCmdIface([0x81, 0x01, 0x04, 0x00, 0x03, 0xFF]);
    }

    public async zoomStart(tele: boolean): Promise<resCameraOperation> {
        this.activeProcess.ZoomPos = 1;
        const b = tele ? 0x02 : 0x03;

        delete this.baseinfo.ZoomPos;
        return await this.viscaCmdIface([0x81, 0x01, 0x04, 0x07, b, 0xFF]);
    }

    public async zoomStop(): Promise<resCameraOperation> {
        delete this.activeProcess.ZoomPos
        delete this.baseinfo.ZoomPos;
        return await this.viscaCmdIface([0x81, 0x01, 0x04, 0x07, 0, 0xFF]);
    }

    public async drive(dir: string, _speed?: string): Promise<resCameraOperation> {
        const d = movingDirection[dir];
        if (typeof d === 'undefined') {
            throw new Error(`неправильное направление движения камеры '${dir}'`);
        }
        let speed = _speed ? Number(_speed) : this.speed;
        if (speed < this.speedRange[0] || speed > this.speedRange[1])
            throw new Error(`неправильная скорость движения камеры '${speed}'`);
        this.activeProcess.PanTiltPos = dir == "STOP" ? undefined : 1;
        delete this.baseinfo.PanTiltPos;
        return await this.viscaCmdIface([0x81, 0x01, 0x06, 0x01, speed, speed, ...d, 0xFF]);
    }

    public async driveStop(): Promise<resCameraOperation> {
        return await this.drive("STOP");
    }

    public setSpeed(val: number): rCameraState {
        // this.getPosition(["FocusPos"]);
        if (val < this.speedRange[0] || val > this.speedRange[1]) {
            throw new Error(`неправильная скорость движения камеры '${val}'`);
        }
        this.speed = val;
        return this.getStateSync();
    }

    public async presetHardSave(p: number): Promise<resCameraOperation> {
        if (isNaN(p) || p < 0 || p > 0x7F) throw Error(`Visca.Invalid memory reference ${p}`);
        let r = await this.viscaCmdIface([0x81, 0x01, 0x04, 0x3F, 0x01, p, 0xFF]);
        if (r.error) return r;
        this.current_preset = String(p);
        this.baseinfo.CurrentPreset = p;
        if (r.state) r.state.current_preset = this.current_preset;
        return r;
    }


    public async presetRecall(p: number): Promise<resCameraOperation> {
        mutil.DeleteFieldFromObj(this.baseinfo, "PanTiltPos", "ZoomPos"); //TODO:!
        let r = await this.viscaCmdIface([0x81, 0x01, 0x04, 0x3F, 0x02, p, 0xFF]);
        if (r.error) return r;
        this.current_preset = String(p);
        this.baseinfo.CurrentPreset = p;
        if (r.state) r.state.current_preset = this.current_preset
        return r
    }


    public async presetGet(): Promise<resCameraOperation> {
        try {
            let r = await this.getCameraDataIface(["CurrentPreset"])
            return r;
        } catch (e) {
            let msg = mutil.getErrorMessage(e);
            mlog.error(msg);
            return { error: msg }
        }
        //8x 09 04 3F FF y0 50 pp F
    }
}

function trunctag(calcV:number, newV:number):tTruncateValue{
    return newV > calcV ? -1 : newV < calcV ? 1 :0
}

