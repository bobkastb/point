// Модуль index.ts содержит:
// Основной код сервера Point
// Обработку HTTP запросов
// Запуск инициализации устройств 

//import * as testgen from "./lib/testgen";

import http from "http";
import url from "url";
import path from "path";
import net from "net";
//import os from "os";
import fs, { MakeDirectoryOptions } from "fs";
//import { exec } from "child_process";
import * as camera from "./lib/camera";
import * as VISCA from "./lib/visca";
import * as VISCALumensVCB30U from "./lib/visca-Lumens-VC-B30U";
import * as sw from "./lib/switch";
import * as Kramer300 from "./lib/kramer3000";
import * as UConference from "./lib/UConference";
import * as UPolycomRPG from "./lib/UPolycomRPG";

import { FileServer, Vars } from "./lib/static";
import { VideoServer } from "./lib/video";
import * as preset from "./lib/campresets";
import * as api_base from "./lib/api_base";
import { log, error } from "./lib/log";
import * as mserial from "./lib/serial";
import * as msched from "./lib/schedule-gen";
import * as ssched from "./lib/schedule-service";
import * as mutils from "./lib/utils";
import * as mgen from "./lib/device-types";
import * as menv from "./lib/environment";
import * as iapi from "./lib/api_interfaces";
import { device_id_type, NotifyComponent } from "./lib/device-types";
import { rSchedulerConfig , rSchedulerServiceState, rSchedulerApiResult , rSchedulerApiRequest} from "./lib/schedule_interface";

import { isApiError } from "./lib/api_base";
import { APIResult , rProgramOptions } from "./lib/api_interfaces";
import { scrypt } from "crypto";

//import { exit, openStdin } from "process";
//import { ifError } from "assert";

//const OPTIONS_FILE = path.join(menv.mainDir, "options.json");
//const DEF_SCHED_PARAMS_FILE = "scheduler.json";
const CONFIG_FILE = path.join(menv.mainDir, "config.json");



type APIHandler = (req: http.IncomingMessage, query: url.UrlWithParsedQuery) => Promise<APIResult>;
interface APITable { [key: string]: APIHandler; };

type CameraControlConfig = camera.CameraControlConfig;
type SwitchControlConfig = sw.SwitchControlConfig;

type CaptureDeviceConfig = {
    ControlType: string,
    DisplayName: string,
    Description?: string,
    //CaptureOnSwitch: sw.SwitchID,
    Pin_SwitchOut: sw.SwitchID,
    MediaserverAddress: string,
    VideoStream: string

}

/*
type rProgramOptions = {
    SaveVideoPath: string;
    Themes: string[];
    DefaultTheme: string;
    DefaultPage: string;
    ShowSideBar: boolean;
    PathSep: string;
}
*/

type ServerConfig = {
    //ServerHome: string;
    thisFilePath: string;
    TCPPortToListen: number;
    Debug?: { Redirect: string; }
    IgnoreErrorOnLoad: boolean;
    //MediaserverAddress: string;
    //VideoStream: string;
    //SwitchOutput: sw.SwitchID;
    StaticFilesRoot: string;
    InitScript?: string;
    FileSavedOptions: string;
    ControlTypes: mgen.mapControlTypes;
    CaptureDevice: CaptureDeviceConfig;
    Cameras: camera.CameraControlConfig[]; // camera.mapCameraControlConfig;
    Switch: SwitchControlConfig;
    Conference: UConference.rConferenceConfig;

    Options: rProgramOptions;
    Scheduler: rSchedulerConfig;
    ScheluderSettings: ssched.tScheluderSettings;

    APIPath_CaptureFiles: string;
    //ApiPath_LogFiles:string;
    //ApiPath_LogJsonFiles:string;
}




const validateOptions = (opt: rProgramOptions): boolean => {
    if (opt.Themes.indexOf(opt.DefaultTheme) < 0) return false;
    try {
        fs.readdirSync(opt.SaveVideoPath);
    }
    catch {
        return false;
    }
    return true;
}



type CameraAPI = camera.CameraAPI;
type SwitchAPI = sw.SwitchAPI;



class Server {
    httpserv?: http.Server;
    private camAPI: CameraAPI;
    private switchAPI: SwitchAPI;
    private tabAPI: APITable;
    private cfg: ServerConfig;
    private staticSrv: FileServer;
    //fileLogSrv: FileServer;
    private videoSrv: VideoServer;
    scheduleSrv: ssched.SchedulerService;
    capturestate: any = {};
    devices = new mgen.cDeviceStorage();
    diagnostic = { errorCount: 0, message: '', obj: {} as any, ignore: false }

    private vars(): Vars {
        return {
            "THEME": this.cfg.Options.DefaultTheme,
        }
    }
    async callMediaServer(_url: string):Promise<APIResult> {
        let u = api_base.formaturl(this.cfg.CaptureDevice.MediaserverAddress + '/' + _url);
        //url.format()
        log(" call mediaserver ", u)
        let answer = await api_base.MyApiCall(u);
        if (!_url.startsWith("/capture/state"))
            mgen.do_notify({ capture: 1 })
        return answer as APIResult;

    }
    //type pSend={};
    private send(retcode: number, res: http.ServerResponse, rec: { ctype?: string, msg?: string, encoding?: "utf8", error?: Error | string }): void {
        if (!rec.ctype) rec.ctype = "text/plain";
        let h: http.OutgoingHttpHeaders = typeof (rec.ctype) == "object" ? rec.ctype : { "Content-Type": String(rec.ctype) };
        if (!retcode) retcode = 200;
        let errcodes: any = {
            200: "", 404: "404 Not Found", 500: "500 Internal server Error",
            425: 'Too Early — сервер не готов принять риски обработки "ранней информации'
        }

        let data = (rec.msg ? rec.msg : "");
        if (retcode != 200) {
            let errstr = rec.error ? mutils.getErrorMessage(rec.error) : "";
            data = (rec.ctype == "text/plain")
                ? String(errcodes[retcode]) + ". " + (rec.msg ? rec.msg + ". " : "") + (errstr ? errstr + ". " : "")
                : data + errstr;
            error(data);
        }

        if (rec.encoding) h["Charset"] = "UTF-8"

        // if (res.socket ) log(" retunted socket is Close! ",res.socket);
        res.writeHead(retcode, h);
        if (rec.encoding) res.end(data, rec.encoding)
        else res.end(data)
    }

    private async getVideoStream(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        return { result: this.cfg.CaptureDevice.VideoStream };
    }

    private async setActiveCamera(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        const id = (query.query["id"] as string).trim();
        let cam = this.camAPI.getCameraSettings(id);
        if (!cam) return { error: `Invalid camera id:${id} ` };
        if (!cam.Pin_SwitchIn) return { error: `Камера ${id} не подключена к коммутатору` }
        return { result: await this.switchAPI.switch?.connect(cam.Pin_SwitchIn, [this.cfg.CaptureDevice.Pin_SwitchOut]) };
    }
    TestSignalIsActive(pinin: string): boolean {
        //let w=await this.WhoCapturedNow( );
        let r = this.switchAPI.switch?.Display2Signal(Number(this.cfg.CaptureDevice.Pin_SwitchOut))
        return Boolean(r) && (r == Number(pinin))  // w && (w==pinin)
    }
    async WhoCapturedNow(): Promise<device_id_type | undefined> {
        let sws = await this.switchAPI.getState()
        let pin_in: any = sws?.Video[Number(this.cfg.CaptureDevice.Pin_SwitchOut)];
        return pin_in ? String(pin_in) : undefined;
    }
    VideoCaptureForDevice(device_id: device_id_type): Promise<APIResult> {
        throw Error("Internal //TODO:")
    }

    //getListCameras_i( )
    private async getCamerasList(...ids: string[]): Promise<camera.ExtCameraInfo[]> {
        const result = await this.camAPI.getCamerasList(...ids);
        let pin_in = await this.WhoCapturedNow();
        if (pin_in) {
            for (let cr of result) {
                if (String(pin_in) == cr.Pin_SwitchIn) { cr.ActiveCapture = true; break; }
            }
        }
        return result
    }
    private async getListCameras(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        //"/cmd/cam/cameras": this.camAPI.cameras.bind(this.camAPI),
        return { result: await this.getCamerasList(), opt_readable: true }
    }
    private async getCameraState(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let st = await this.camAPI.getState(query.query["id"] as string);
        let pin_in = await this.WhoCapturedNow();
        st.ActiveCapture = (pin_in && st.Pin_SwitchIn == pin_in) ? true : undefined;
        return { result: st, opt_readable: true }
        //getCameraState
    }

    async start_capturetask(to: ssched.cTaskOperation): Promise<ssched.cTaskOperation> {
        //let res={ file:file ,msg:"", err:"" }
        //if (to.cameraId) throw Error("On start_capturetask : Signal source not defined!")
        if (!to.source) { to.error = "Start capture task:Undefined camera id!"; return to; }
        let cam = this.camAPI.getCameraObj(to.source.cameraId);
        if (!cam) { to.error = "Start capture task:Invalid camera id=" + to.source.cameraId; return to; }
        let bmsg = `Connect camera ${cam.cfg.Pin_SwitchIn} to capdev ${this.cfg.CaptureDevice.Pin_SwitchOut}.`;
        to.msg = "Try " + bmsg;
        let fase = "Switch.connet";
        try {
            let swr: any = await this.switchAPI.switch?.connect(cam.cfg.Pin_SwitchIn, [this.cfg.CaptureDevice.Pin_SwitchOut]);
            to.msg = bmsg; //+ swr.answers;
            let prsId = to.source.Camera_PresetID
            if (prsId) {
                fase = `Get Camera current preset.`;
                let lpres = await cam.control.presetGet()
                //log("Get Camera current preset" , lpres);
                if (lpres.state?.current_preset) {
                    to.source.oldPresetID = lpres.state.current_preset
                    to.msg += ` Save last preset - ${lpres.state.current_preset}.`
                }

                fase = `Camera preset ${prsId}`;
                let r = await this.camAPI.setPresetI(to.source.cameraId, prsId);
                if (r.error) throw Error(r.error)
                else to.msg += ` Set preset ${prsId}.`
            }

            fase = "Capture start";
            //check swr
            let answer = await this.callMediaServer("/capture/start");
            if (isApiError(answer)) { to.error = "From mediaserver: " + answer.error; }
            else to.msg += `Capture start at ${mutils.getUnixTime()}.`;
        } catch (e) {
            to.error = `On ${fase} : ${mutils.getErrorMessage(e)} `;
        }
        return to;
    };
    async stop_capturetask(to: ssched.cTaskOperation, fr: Promise<ssched.cTaskOperation>): Promise<ssched.cTaskOperation> {
        let errors = []; let msgs = [];
        try {
            let faze = "On stop capture";
            let t = await fr;
            let r = await this.f_stopCapture(t.file as string);
            if (r.error) errors.push(r.error);
            else to.file = t.file;
            //log("stop_capturetask.source operation = ",t)
            if (t.source?.oldPresetID) {
                to.source = t.source;
                faze = "On restore camera position";
                let xr = await this.camAPI.setPresetI(t.source.cameraId, t.source.oldPresetID);
                if (xr.error) errors.push(r.error)
                else msgs.push(`Restore camera position to ${t.source.oldPresetID} preset`);
            }

        } catch (e) {
            errors.push(mutils.getErrorMessage(e));
        }
        if (msgs.length) to.msg = msgs.join(". ");
        if (errors.length) to.error = errors.join(". ");
        return to;
    };

    fPanoramaPath?: mgen.iFilePath;
    GetPanoramaPath(Id?: string): mgen.iFilePath {
        if (!this.fPanoramaPath) {
            this.fPanoramaPath = {
                fspath: path.join(this.cfg.StaticFilesRoot, "programdata"),
                apipath: "/programdata"
            }
        }
        if (!Id) return this.fPanoramaPath;
        let fnm = `Panorama_Camera_${Id}.jpg`
        return {
            fspath: path.join(this.fPanoramaPath.fspath, fnm),
            apipath: path.join(this.fPanoramaPath.apipath, fnm),
        }
    };

    MakeDataFilePath(fn: string): string {
        const p = path.resolve(this.cfg.Options.SaveVideoPath);
        return path.join(p, fn);
    }

    makecapture_filename_fortask(fn: string): string {
        return this.MakeDataFilePath(fn + ".mp4");
    }
    PinIn2ControlType(PinIn: number | string): [mgen.tControlType, mgen.cDeviceInfo | undefined] {
        let di = this.switchAPI.SignalPin2Device(PinIn);
        if (!di) return ["default", di];
        return [di.getControlType(), di];
    }
    async cb_UpdateSwitchState(swtch: SwitchAPI): Promise<number> {
        //TODO:
        let state = await this.switchAPI.getState("cash")
        if (!state) return 0;

        let notifyforCamera = (di?: mgen.cDeviceInfo) => {
            let l = this.camAPI.getCameraObj(di?.info.ID)
            if (!l) return;
            let cl: any = {}; cl[l.cfg.ID] = 1;
            //[ l.cfg.ID ].map()
            mgen.do_notify({ camera: cl })
        }
        let capPin = this.cfg.CaptureDevice.Pin_SwitchOut;
        let newPin = state.Video[Number(capPin)];
        let oldSig = this.capturestate.PinToCapture;
        //log(`swstate:: signal:${oldSig}=>${newPin} cappin: ${capPin} `);
        //if ( oldSig == newPin ) return 0;
        this.capturestate.PinToCapture = newPin;
        let [oldtp, oldDev] = this.PinIn2ControlType(oldSig);
        let [newtp, newDev] = this.PinIn2ControlType(newPin);
        notifyforCamera(oldDev); notifyforCamera(newDev);
        // log(`DBG.cb_UpdateSwitchState::change Capiture(${capPin}) Source ${oldSig} => ${newPin} Type ${newtp==oldtp?"not":""} changed (${newtp})`);
        // if (( oldSig == newPin ) || (oldSig && (newtp==oldtp))) return 0;
        if (oldSig == newPin) return 0; // дергаем переключатель всегда при смене источника
        let tpCap = this.cfg.ControlTypes[newtp].CapSignalType;
        if (!tpCap) { error("Unknown control type:", newtp); tpCap = "default" }
        let turl = `/capture/signaltype?CapSignalType=${tpCap}`;
        const answer = await this.callMediaServer(turl)
        if (isApiError(answer)) {
            error(`On change Capiture Signal Type from ${oldtp} to ${newtp}: ${answer.error}`)
            return -1;
        }
        log(`change Capiture Signal Type from ${oldtp} => ${newtp} (${tpCap})`);
        return 1;
    }

    private async f_stopCapture(file: string): Promise<APIResult> {
        let fullfn = !file ? "" : path.isAbsolute(file) ? file : this.makecapture_filename_fortask(file);
        let stopURL = "/capture/stop?file=" + (fullfn ? encodeURIComponent(fullfn) : "@");
        log("STOPPING URL:", stopURL);
        const answer = await this.callMediaServer(stopURL)
        mgen.do_notify({ capturefiles: 1, capture: 1 })
        //answer.result
        if (answer.error) {
            error("On stop capture:", answer.error);
        } else {
            
            //answer.result
            (answer as any).ffile = fullfn ? fullfn : undefined;
        }
        return answer;


    }
    private async getCaptureState_f(): Promise<APIResult> {
        return await this.callMediaServer("/capture/state");
    }
    private getCaptureFiles_f(): APIResult {
        const files = fs.readdirSync(this.cfg.Options.SaveVideoPath)
            .filter(s => s.endsWith(".mp4"))
            .map(s => s.slice(0, s.length - ".mp4".length));
        return { result: files };
    }

    private async stopMediaServer(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        return await this.callMediaServer("/stop");
    }
    private enrichment_VideoCaptureState( query: url.UrlWithParsedQuery , vr:APIResult ):APIResult{
        //let vr:APIResult = vrp instanceof Promise<APIResult> : await vrp ? 
        if (vr.error) return vr;
        let res= vr.result as iapi.iVideoCaptureState;
        let fr = this.getCaptureFiles_f();
        res.videofiles = fr.result;
        return vr;
    } 
    private async stopWriteVideoFile(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        //Command: /cmd/capture/stop
        let [q, e] = mutils.HttpParamsToParams(query, { file: "" }, 'On api stopCapture')
        //if (e) log("errors:",e.join(','),"q:",q);
        return this.enrichment_VideoCaptureState( query , await this.f_stopCapture(q.file));
    }

    private async stateWriteVideoFile(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        //Command: /cmd/capture/state
        return this.enrichment_VideoCaptureState( query ,await this.getCaptureState_f() );
    }
    private async startWriteVideoFile(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        return this.enrichment_VideoCaptureState( query ,await this.callMediaServer("/capture/start") );
    }

    private async pauseWriteVideoFile(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        return this.enrichment_VideoCaptureState( query , await this.callMediaServer("/capture/pause") );
    }


    private async getCaptureFiles(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        return this.getCaptureFiles_f();
    }

    private async pollingtest(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let [q, e] = mutils.testInvalidStrParamsFromAny(query.query, { sessionid: "", reset: "" }, "pollingtest:");
        if (!q.sessionid) throw Error("Undefined param sessionid!")
        // cmd/capture/state
        // cmd/camera/state
        // cmd/switch/state
        // cmd/schedule/state
        let socket = (req as any).ResSocket as net.Socket;
        let [nc, status] = mgen.notify_Controller.getownrec(q.sessionid);
        nc.remoteAddress = String(socket.remoteAddress);
        let makeresult = async (ninf: mgen.NotifyComponent) => {
            return {
                changesin: Object.keys(ninf),
                switch: (!ninf.switch) ? undefined : (await this.switchAPI.getState("cash")),
                schedule: (!ninf.schedule) ? undefined : this.scheduleSrv.getState(false),
                capture: (!ninf.capture) ? undefined : (await this.getCaptureState_f()).result,
                capturefiles: (!ninf.capturefiles) ? undefined : this.getCaptureFiles_f().result,
                camera: (!ninf.camera) ? undefined : await this.getCamerasList(...Object.keys(ninf.camera)),
            }
        }
        if (!status && !q.reset) {
            socket.on("close", () => { //log("notifivation socket is closed", nc.ownerID ); 
                nc.on_AnyEvent("closesocket");
            })
            if (nc.countuse) { error("repeat entry to polling notify for:", nc.ownerInfo()) }
            let [s, ninf] = await nc.Wait()
            socket.on("close", () => { })
            if (s == "change") {
                if (!ninf) return { error: "Invalid state change" };
                log("finish pending polling notify for:", nc.ownerInfo())
                //return { result:"data "+ Object.keys( ninf ).join(',') }

                let result = await makeresult(ninf)
                return { result }
            } else {
                //return { error:`Abnormal termination pollingtest (${nc.ownerID}):${s}` }
                return {};
            }
        }
        let ninf: mgen.NotifyComponent = {
            switch: 1, schedule: 1, capturefiles: 1, capture: 1,
            camera: mgen.Array2NotifyArray(... this.camAPI.getAllCameraIds())
        }
        log("reset polling notify for:", nc.ownerInfo())
        let result = await makeresult(ninf)
        return { result }
    }

    async do_notify(nc: NotifyComponent) {
        //log(`DBG.do_notify:`,nc.switch);
        if (nc.switch) {
            this.cb_UpdateSwitchState(this.switchAPI)
            // remove duplicate cb_UpdateSwitchState
            //TODO:  cb_UpdateSwitchState
        }
    }
    private async statuspolling(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {

        let res: APIResult = { servertime: mutils.getUnixTime(), result: {} };
        let reqlist = ["capture/state", "capture/files", "switch/state", "schedule"];
        if ("calls" in query.query)
            reqlist = decodeURIComponent(query.query["calls"] as string).split(',');
        delete query.query.calls;
        for (let value of reqlist) {
            let nmid = value.replace('/', '_');
            let f = this.tabAPI["/cmd/" + value.trim()]; if (!f) return { error: `Undefined functional:${value}` };
            let r = await f(req, query);
            if (r.error) {
                res.error += r.error;
                if (!res.errordiff) res.errordiff = {};
                res.errordiff[nmid] = r.error;
            }
            res.result[nmid] = r.result;
        }
        res.opt_readable = true;
        return res;
    };

    private async configH(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        return { result: this.cfg, opt_readable: true, servertime: mutils.getUnixTime() };
        //return { result: res };
    }

    private async configUpdateH(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let [q, e] = mutils.HttpParamsToParams(query, { path: "", value: "" });
        if (e.length) return { error: "unsupported HttpQuery params:" + String(e) };
        let obj = q.path ? mutils.getObjPropertyByPath(this.cfg, q.path, true) : this.cfg;
        let vj = JSON.parse(q.value);
        mutils.AnyCopyTo(obj, vj);
        return {};
    }

    
    private async reloadMediaServer(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let opts={ echo:1 , raise:1 }
        let r= await menv.Execute("sudo systemctl restart point-media" , opts );
        return { opt_readable: true, servertime: mutils.getUnixTime(), result:"OK" }
    }
    private async reloadServer(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let opts={ echo:1 , raise:1 }
        let r= menv.Execute("sudo systemctl restart point-main" , opts );
        return { opt_readable: true, servertime: mutils.getUnixTime(), result:"OK" }
    }

    private async idebugH(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let res = this;
        if ("value" in query.query) {
            const path = decodeURIComponent(query.query["value"] as string);
            let apath = path.split('/');
            for (let v of apath) {
                let rl = res as msched.DictionarySA;
                res = rl[v];
                if (!res) return { error: "invalid path! :" + path };
            }
        }
        return { opt_readable: true, servertime: mutils.getUnixTime(), result: res };
    }
    
    private async scheduleHandler(cmd: string, newcfg: rSchedulerApiRequest): Promise<APIResult> {
        interface scopeResult { nCfg?:boolean ; SchedulerState?: rSchedulerServiceState  }
        let scresult:scopeResult = { nCfg:true }
        //let result: ssched.cSchedulerApiResult = { SchedulerCfg: ({} as any)   };
        let errors = ""; let awaitRes: any;

        if (newcfg.IdList) {
            let r = this.scheduleSrv.test_taskIds(newcfg.IdList);
            if (r.error) errors = `Invalid task ID ${r.error}`;
            if (!r.ids) return { error: errors };
            newcfg.IdList = r.ids;
        }

        if (cmd == "set") {
            let SchedulerCfg = newcfg.SchedulerCfg as rSchedulerConfig
            if ( !SchedulerCfg ) return  { error: "invalid scheduler data!: missing SchedulerCfg field"  };
            let er = msched.validate_SchedulerConfig(SchedulerCfg);
            if (er) return { error: "invalid scheduler data!:" + er };
            await this.scheduleSrv.set_Full(SchedulerCfg );

        } else if (cmd == "update") {
            let SchedulerCfgUpd = newcfg.SchedulerCfg; 
            if ( !SchedulerCfgUpd ) return  { error: "invalid scheduler data!: missing SchedulerCfg field"  };
            //let er = msched.validate_SchedulerConfig_Update(newcfg.SchedulerCfg)
            let er = msched.validate_SchedulerConfig(SchedulerCfgUpd as rSchedulerConfig, "update" )
            if (er) return { error: "invalid scheduler data!:" + er };

            let idl = [];
            if (SchedulerCfgUpd.Entries) for (let e of SchedulerCfgUpd.Entries) {
                this.scheduleSrv.update_SchedEntry(e, true);
                idl.push(e.Id);
            }
            await this.scheduleSrv.update_Control(SchedulerCfgUpd);
            scresult.SchedulerState = this.scheduleSrv.getState(true, idl.length > 0 ? idl : undefined)

        } else if (cmd == "delete") {
            if (!newcfg.IdList) return { error: "Required json param 'IdList'!" };
            awaitRes = await this.scheduleSrv.delete_task(newcfg.IdList);
        } else if (cmd == "start") {
            if (newcfg.IdList) {
                if (!this.scheduleSrv.AllowedMultipleOperations && newcfg.IdList.length > 1)
                    return { error: "Multiple start tasks not allowed!" };
                awaitRes = await this.scheduleSrv.StartExecute(newcfg.IdList, ssched.eTOInitiator.Manual);
            } else
                awaitRes = await this.scheduleSrv.RunService(true);
            scresult = {};
        } else if (cmd == "stop") {
            if (newcfg.IdList)
                awaitRes = await this.scheduleSrv.StopExecute(newcfg.IdList, ssched.eTOInitiator.Manual);
            else
                awaitRes = await this.scheduleSrv.RunService(false);
            scresult = {};
        } else if (cmd == "state") {
            scresult = { SchedulerState: this.scheduleSrv.getState(true, newcfg.IdList) };
        } else if (cmd=="get") {
        } else  
            return { error: "invalid scheduler request cmd=" + cmd };    
        //else return { error: "invalid scheduler command:"+ cmd };             
        this.cfg.Scheduler = this.scheduleSrv.Config();
        this.scheduleSrv.updateDB();
        //return { result: this.cfg.Scheduler }
        //console.log("awaitRes:",awaitRes);
        let intres = ssched.IntegrateMsgTaskOperation(awaitRes);
        if (intres.error) { errors += intres.error }

        if (!scresult.SchedulerState ) scresult.SchedulerState=this.scheduleSrv.getState(false);
        let result: rSchedulerApiResult = { SchedulerState:scresult.SchedulerState };
        if (scresult.nCfg ) result.SchedulerCfg = this.cfg.Scheduler;


        let ret: APIResult = { servertime: mutils.getUnixTime(), result: result, opt_readable: true };
        if (errors) ret.error = errors;
        return ret;

    }
    private async scheduleH(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        //"/cmd/schedule/"
        if (!req.url) return {};
        let p = req.url.split("?")[0];
        p = p.replace('/cmd/schedule', '');
        let cmd = p.replace('/', '').trim();
        function testqparams(q: any, tm: any = {}): string {
            for (let i in q) if (!(i in tm)) return i; return "";
        }
        let elst = testqparams(query.query, { value: 0, ids: 0 }); if (elst) return { error: "invalid parametr: " + elst };
        //console.log( "url>" , req.url.split("?")[1] );
        const opts = "value" in query.query ? decodeURIComponent(query.query["value"] as string) : "";
        const q_idlist = "ids" in query.query ? decodeURIComponent(query.query["ids"] as string) : "";
        let newcfg: rSchedulerApiRequest = "value" in query.query ? JSON.parse(opts) : {};
        //console.log( `q_idlist -${q_idlist}- newcfg , -${newcfg.IdList}-`, q_idlist?1:0, newcfg.IdList?1:0 );
        if (!newcfg.IdList && q_idlist) newcfg.IdList = q_idlist.split(',');
        //console.log( `q_idlist -${q_idlist}- newcfg , -${newcfg.IdList}-`, q_idlist?1:0, newcfg.IdList?1:0 );
        if (!cmd) cmd = ("value" in query.query) ? "set" : "get";
        return await this.scheduleHandler(cmd, newcfg);

    }

    private async options(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        if ("value" in query.query) {
            const opts = decodeURIComponent(query.query["value"] as string);
            const opt = JSON.parse(opts) as rProgramOptions;
            //console.log("input options=",opt,opts)
            if (!validateOptions(opt)) {
                return { error: "invalid options" };
            }
            const opath = this.cfg.FileSavedOptions;
            this.cfg.Options = opt;
            this.staticSrv.setVars(this.vars());

            let copt: rProgramOptions = mutils.TrivialCloneObject(this.cfg.Options);
            let newvp = path.relative(menv.mainDir, copt.SaveVideoPath);
            if (!path.isAbsolute(newvp) && !newvp.startsWith(".."))
                copt.SaveVideoPath = "${ServerHome}/" + newvp;
            fs.writeFileSync(opath, JSON.stringify(copt, null, ' '), { encoding: "utf8" });
            console.log("Save options")
            return { result: true }
        }
        return { result: this.cfg.Options }
    }

    private async folders(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let start = decodeURIComponent(query.query["start"] as string);
        if (!start) start = "/";
        let res = fs.readdirSync(start).filter(name => fs.statSync(path.join(start, name)).isDirectory());
        //console.log(`read folders -${start}=${res}`);
        return { result: res }
    }



    private async handleStatic(filesrv: FileServer, startremove: string, req: http.IncomingMessage, res: http.ServerResponse) {
        const query = url.parse(req.url as string, true);
        let path = query.path as string;
        if (startremove) path = path.replace(startremove, "");
        //log("HEADERS: ", req.headers);
        const [resp, typ, err] = filesrv.get(path);
        if (err === null) {
            //this.send( 200 , res , resp , "text/plain" );          
            res.writeHead(200, { "Content-Type": typ, "Content-Length": resp?.length });
            res.end(resp, "utf8");  //TODO!
        } else
            this.send(404, res, { error: path });
    }

    private async handleVideo(req: http.IncomingMessage, res: http.ServerResponse) {
        try {
            if (this.videoSrv.serve(req, res)) return;
            this.send(404, res, { error: req.url });
        } catch (e:any) {
            this.send(500, res, { error: e });
        }

    }


    private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
        const p = req.url ? req.url.split("?")[0] : "";
        let self = this;

        if (this.diagnostic.errorCount && !this.diagnostic.ignore) {
            //this.send( 425 , res , { error: JSON.stringify( this.diagnostic.message) ,encoding:'utf8' } );    
            this.send(425, res, { ctype: "application/json", error: JSON.stringify(this.diagnostic.obj, null, '    '), encoding: 'utf8' });
            return;
        }
        async function HandleStaticFiles(apipath: string, dirpath: string) {
            //if (!p.startsWith(apipath)) return false;
            let fsrv = new FileServer(dirpath);
            return self.handleStatic(fsrv, apipath, req, res);
        }
        if (req.url) {
            if (this.cfg.Debug?.Redirect) {
                let d = this.cfg.Debug;
                if (p.startsWith('/cmd/') || p.startsWith('/programdata/')) {
                    log(`Redirect ...  ${d.Redirect}${req.url}`)

                    api_base.redirect(req.url, d.Redirect, res);
                    return
                }
            }
            const query = url.parse(req.url, true);

            let req_text = `ЗАПРОС: ${req.url} from: ${req.socket.remoteAddress} `;
            log(req_text);
            const f = this.tabAPI[p];
            if (typeof f !== 'undefined') {
                try {
                    mgen.lock_NotyifyChange(1);
                    (req as any).ResSocket = res.socket
                    const result = await f(req, query);
                    let readable = result.opt_readable;
                    delete result.opt_readable;
                    //mutils.DeleteFieldFromObj( result, ["opt_readable"] );
                    let sertext = readable ? JSON.stringify(result, null, ' ') : JSON.stringify(result);
                    this.send(0, res, { msg: sertext, ctype: "application/json" });
                    if (result.error) error(result.error, req_text);
                } catch (e) {
                    //Object.is()
                    //if ("message" in e){
                    let msg = mutils.getErrorMessage(e);
                    error(msg, req_text);
                    this.send(0, res, { msg: JSON.stringify({ error: msg }), ctype: "application/json" });
                } finally {
                    mgen.lock_NotyifyChange(-1);
                }
                return;
            } else if (p.startsWith("/video/")) {
                this.handleVideo(req, res);
                return;
            } else {
                let env = menv.getEnv(); let shs = this.cfg.ScheluderSettings;
                try {
                    let pathes = [
                        { a: this.cfg.APIPath_CaptureFiles, d: this.cfg.Options.SaveVideoPath },
                        { a: shs.ApiPath_LogFiles, d: shs.JournalPath },
                        { a: shs.ApiPath_LogJsonFiles, d: shs.JournalPath }]
                    //console.log("find in ",pathes);    
                    if (p.startsWith(pathes[0].a)) {
                        await HandleStaticFiles(pathes[0].a, pathes[0].d)
                    } else if (p.startsWith(pathes[1].a)) {
                        await HandleStaticFiles(pathes[1].a, pathes[1].d)
                    } else if (p.startsWith(pathes[2].a)) {
                        await HandleStaticFiles(pathes[2].a, pathes[2].d)
                    } else {
                        await this.handleStatic(this.staticSrv, "", req, res);
                    }
                } catch (e:any) {

                    this.send(500, res, { error: e });
                }
                return;
            }
        }
        this.send(404, res, {});

    }
    async testAllComports() {
        //for (let arg of process.argv ) 
        let list = mutils.FindFieldsByName(this.cfg, 'SerialPortFileName').filter(value => Boolean(value.v));
        //if (menv.isWindows) return;
        let errcnt = 0;
        let errsall: any = {};
        let testopen = (pfn: string): string => { return mserial.testSerialOpen(pfn) }
        for (let cp of list) {
            let errc = testopen(cp.v);
            if (!errc) continue;
            if (errc == 'EACCES') {
                let ec = await menv.Execute(`${menv.mainDir}/bin/SetAccessTo.sh ${cp.v}`);
                if (!ec) errc = testopen(cp.v); // repeat! 
                if (!errc) continue;
            }
            errcnt++;
            let m = `port ${cp.v} in config path ${cp.p}`
            if (!errsall[errc]) errsall[errc] = []
            errsall[errc].push(m);
        }
        if (!errcnt) { return }
        let errinf: any = {
            'ENOENT': 'Необнаружены последовательные порты',
            'EACCES': 'Нет прав доступа к последовательным портам',
            'ANY': 'Ошибка работы с последовательными портами'
        }
        let msg = ''; let errobj: any = {};
        errobj["Ошибка"] = "Программа не может работать, ошибка настроек!";
        for (let k in errsall) {
            let knm = errinf[k] ? errinf[k] : `${errinf['ANY']}(${k})`;
            msg += '******  ' + (knm) + '\n ';
            msg += errsall[k].join('  \n')
            errobj[knm] = errsall[k];
        }
        this.diagnostic.errorCount = errcnt;
        this.diagnostic.message = msg;
        this.diagnostic.obj = errobj;
        this.diagnostic.ignore = ("-ignerr" in menv.getprocessArgs()) || this.cfg.IgnoreErrorOnLoad;


        // this.cfg
        log('Com port Errors!', this.diagnostic.message)
    }

    public listen() {
        let srv = http.createServer(this.handle.bind(this))
        srv.listen(this.cfg.TCPPortToListen);
        log(`сервер запущен PID=${process.pid}, порт ${this.cfg.TCPPortToListen}, путь к статическим файлам '${this.cfg.StaticFilesRoot}'...`);
    }
    async close() {
        await this.scheduleSrv.RunService(false);
        //TODO: scheduler STOP
        log(`Cервер остановлен!`);
        process.exit(0);
    }
    //constructor(cfg: ServerConfig , cfact: camera.ControlFactory, sfact: sw.ControlFactory) {
    _dbg_notify_Controller: any;
    ConferenceAPI?: UConference.ConferenceAPI;
    constructor(cfg: ServerConfig) {
        this.cfg = cfg;
        this._dbg_notify_Controller = mgen.notify_Controller;
        mgen.SetControltypes(cfg.ControlTypes);
        this.camAPI = new camera.CameraAPI(cfg.Cameras, this);
        this.switchAPI = new sw.SwitchAPI(cfg.Switch);
        this.staticSrv = new FileServer(cfg.StaticFilesRoot);
        this.staticSrv.setVars(this.vars());
        this.videoSrv = new VideoServer(() => cfg.Options.SaveVideoPath);
        this.scheduleSrv = new ssched.SchedulerService(this.cfg.ScheluderSettings, this);
        this.cfg.Scheduler = this.scheduleSrv.Config();
        //this.ConferenceAPI = new UConference.ConferenceAPI( factory_Conference.make(cfg.Conference.ID, cfg.Conference) ) ; 


        const self = this;
        this.tabAPI = {
            "/cmd/config/update": this.configUpdateH.bind(this),
            "/cmd/config": this.configH.bind(this),
            "/cmd/idebug": this.idebugH.bind(this),
            "/cmd/reload/server": this.reloadServer.bind(this),
            "/cmd/reload/media": this.reloadMediaServer.bind(this),
            "/cmd/schedule": this.scheduleH.bind(this),
            "/cmd/options": this.options.bind(this),
            "/cmd/folders": this.folders.bind(this),
            "/cmd/videostream": this.getVideoStream.bind(this),
            "/cmd/cam/activate": this.setActiveCamera.bind(this),
            "/cmd/cam/cameras": this.getListCameras.bind(this),
            "/cmd/cam/state": this.getCameraState.bind(this),
            "/cmd/cam/makepanorama": this.camAPI.MakePanoramaE.bind(this.camAPI),
            "/cmd/cam/on": this.camAPI.turnOn.bind(this.camAPI),
            "/cmd/cam/off": this.camAPI.turnOff.bind(this.camAPI),
            "/cmd/cam/zoomStart": this.camAPI.zoomStart.bind(this.camAPI),
            "/cmd/cam/zoomStop": this.camAPI.zoomStop.bind(this.camAPI),
            "/cmd/cam/driveStart": this.camAPI.driveStart.bind(this.camAPI),
            "/cmd/cam/driveStop": this.camAPI.driveStop.bind(this.camAPI),
            "/cmd/cam/setSpeed": this.camAPI.setSpeed.bind(this.camAPI),
            "/cmd/cam/preset/get": this.camAPI.getPresets.bind(this.camAPI),
            "/cmd/cam/preset/add": this.camAPI.addPreset.bind(this.camAPI),
            "/cmd/cam/preset/remove": this.camAPI.removePreset.bind(this.camAPI),
            "/cmd/cam/preset/set": this.camAPI.setPreset.bind(this.camAPI),
            "/cmd/cam/setposition": this.camAPI.setPosition.bind(this.camAPI),
            "/cmd/cam/savehardinfo": this.camAPI.savehardinfo.bind(this.camAPI),
            "/cmd/cam/setglobalposition": this.camAPI.setCameraGlobalPosition.bind(this.camAPI),
            "/cmd/cam/getdata": this.camAPI.getCamData.bind(this.camAPI), // id:string , values:string[] ==> {result:data}
            "/cmd/cam/setdata": this.camAPI.setCamData.bind(this.camAPI), // iddata:string
            "/cmd/switch/command": this.switchAPI.command.bind(this.switchAPI),
            "/cmd/switch/connect": this.switchAPI.connect.bind(this.switchAPI),
            "/cmd/switch/state": this.switchAPI.reqGetState.bind(this.switchAPI),
            "/cmd/switch/afv": this.switchAPI.afv.bind(this.switchAPI),
            "/cmd/switch/names": this.switchAPI.reqGetNamesIOPins.bind(this.switchAPI),
            "/cmd/switch/preset/get": this.switchAPI.getPresets.bind(this.switchAPI),
            "/cmd/switch/preset/add": this.switchAPI.addPreset.bind(this.switchAPI),
            "/cmd/switch/preset/remove": this.switchAPI.removePreset.bind(this.switchAPI),
            "/cmd/switch/preset/set": this.switchAPI.setPreset.bind(this.switchAPI),
            "/cmd/capture/start": this.startWriteVideoFile.bind(this),
            "/cmd/capture/pause": this.pauseWriteVideoFile.bind(this),
            "/cmd/capture/stop": this.stopWriteVideoFile.bind(this),
            "/cmd/capture/state": this.stateWriteVideoFile.bind(this),
            "/cmd/capture/files": this.getCaptureFiles.bind(this),
            "/cmd/statuspolling": this.statuspolling.bind(this),
            "/cmd/pollingstate": this.pollingtest.bind(this),
            "/cmd/video/session/start": async () => ({ result: self.videoSrv.newSession() }),
            "/cmd/video/session/end": async (r, q) => {
                const id = q.query["session"] as string;
                self.videoSrv.endSession(id);
                return { result: true };
            },
        }
        //this.tabAPI
        for (let cmd of msched.eCommandList)
            this.tabAPI["/cmd/schedule/" + cmd] = this.scheduleH.bind(this);

        this.init_switch_table(this.switchAPI);
    }

    init_switch_table(swa: sw.SwitchAPI) {
        this.camAPI.registerDevices(this.devices);
        let cd = this.cfg.CaptureDevice; cd.ControlType = `CaptureDevice`;
        this.devices.addnewdevice(new mgen.cDeviceInfo('O', cd.ControlType, cd, null));
        this.switchAPI.registerDefaultDevice(this.devices);
        this.switchAPI.parse_pin2device('I', this.devices);
        this.switchAPI.parse_pin2device('O', this.devices);
        // this.cfg.Switch.InputDevices ,  this.switchAPI.SignalDeviceMap , I|O , 'defaultIN' , Pin_SwitchIn|Out , a_in
        // out: switchAPI.map , names 
    }

    async async_initialize(): Promise<any> {

        await Promise.all([
            this.switchAPI.switch?.async_initialize(),
            this.camAPI.async_initialize(),
            //this.ConferenceAPI.obj.async_initialize(), 
        ]);
        await this.scheduleSrv.update_RunService();
    };

} // end server

function readOptions(file: string): rProgramOptions {
    const optData = fs.readFileSync(file, "utf8");
    const opt = JSON.parse(optData) as rProgramOptions;
    opt.PathSep = path.sep;
    opt.SaveVideoPath = menv.EnvStrExpand(opt.SaveVideoPath);
    if (!fs.existsSync(opt.SaveVideoPath)) {

        let newpath = path.resolve(menv.getEnv().ServerHome + "/data");
        error(`readOptions::Dir not exists - opt.SaveVideoPath = ${opt.SaveVideoPath} , replace to ${newpath}`);
        opt.SaveVideoPath = newpath;
    }
    //if (!fs.existsSync(opt.SaveVideoPath)) throw Error(`Dir not exists - opt.SaveVideoPath = ${opt.SaveVideoPath}`);

    return opt;
}


//let re = /\$\{(\w+)\}/g;
//let e= s.replace(re, (v,v1)=>{  return pp[v1] ? pp[v1]:"" }  );


function readConfig(): ServerConfig {
    const cfg: ServerConfig = menv.openconfig_file(CONFIG_FILE, true);
    log(`Load config from`, cfg.thisFilePath)

    //cfg.ServerHome =  menv.getEnv().ServerHome ;
    if (!cfg.StaticFilesRoot) throw Error(`Undefined StaticFilesRoot!(in config=${CONFIG_FILE})`); //cfg.StaticFilesRoot = path.join(menv.mainDir , "static")
    if (!cfg.FileSavedOptions) throw Error(`Undefined "FileSavedOptions"!(in config=${CONFIG_FILE})`)

    //cfg.Switch.    

    if (cfg.ScheluderSettings) {
        if (!cfg.ScheluderSettings.ApiPath_LogFiles) throw Error(`Undefined ScheluderSettings.ApiPath_LogFiles!(in config=${CONFIG_FILE})`)
        if (!cfg.ScheluderSettings.ApiPath_LogJsonFiles) throw Error(`Undefined ScheluderSettings.ApiPath_LogFiles!(in config=${CONFIG_FILE})`)
        if (!cfg.ScheluderSettings.ParamsFile) throw Error(`Undefined ScheluderSettings.ParamsFile!(in config=${CONFIG_FILE})`)
        //if (cfg.ApiPath_LogJsonFiles ) cfg.ScheluderSettings.ApiPath_LogJsonFiles=cfg.ApiPath_LogJsonFiles;
        if (cfg.ScheluderSettings.JournalPath)
            if (!fs.existsSync(cfg.ScheluderSettings.JournalPath)) fs.mkdirSync(cfg.ScheluderSettings.JournalPath);
    }

    cfg.Options = readOptions(cfg.FileSavedOptions);



    return cfg;
}

let factory_Conference = new mgen.ControlFactory<UConference.IConference, UConference.rConferenceConfig>()

async function main() {
    //const opt = readOptions();
    const cfg = readConfig();
    //log("environment:" , menv.getEnv())
    //const sfact = sw.Switch_Factory;    sfact.register("Kramer3000", Kramer300.Control);
    camera.Camera_Factory.register("VISCA", VISCA.Control);
    camera.Camera_Factory.register("VISCA-Lumens-VC-B30U", VISCALumensVCB30U.Control);
    sw.Switch_Factory.register("Kramer3000", Kramer300.Control);
    factory_Conference.register("PolycomRPG", UPolycomRPG.Control)

    if (cfg.InitScript) {
        await menv.Execute(cfg.InitScript)
    }
    let srv = new Server(cfg);
    //await srv.testAllComports();
    await srv.async_initialize();
    mgen.setServerCB(srv);


    process.on("SIGTERM", srv.close.bind(srv));
    process.on("SIGINT", srv.close.bind(srv));
    srv.listen();
}

async function super_main() {

    try {
        main();
    } catch (e) {
        error("Error:", mutils.getErrorMessage(e));
        process.exit(1)
    }
}

//testgen.Dotest1();
//console.log( camera.CamDataKeysPredefSets.all ); process.exit(1)
//let buf = new Buffer([1]);console.log( Array.isArray(buf)) ;process.exit(1)

super_main();

