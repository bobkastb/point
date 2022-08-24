// Модуль capture.ts содержит:
// Функции захвата видеопотока
// Видеопоток выделяется из стандартного потока вывода внешней программы (ffmpeg ).
// Внешний поток состоит из последовательных кадров, каждый кадр это данные в формате jpeg
// Функции управления внешней программой захвата(запуск, останов, перехват)
import { spawn, ChildProcessWithoutNullStreams, ChildProcess } from "child_process";
import child_process from "child_process";
import fs from "fs";
import { log, error } from "./log";
import path from "path";
import * as mutils from "./utils";
import * as sync from "./sync";
import { api_Error , iVideoCaptureState} from "./api_interfaces";
//import { parse } from "./shell";

const myDir = path.dirname(process.argv[1]);
const FILES = path.join(myDir, "videofiles");

//type 
interface cConfigSignalType {
    CmdLineOpts: string,
    Id: string, //зполняется при загрзке конфига
    ConstImageFN?: string
};
type iIOSettings = {
    CapSignalType?: string
    ChangeIO?: boolean
}
// { [key:string] : 
export interface StreamErrorsTypes {
    StreamAbnormalTermination?: string;
}
export interface Config {
    CaptureCmd: string;
    Shell?: string;
    RestartOnChangeSignal?: boolean;
    RestartOnUnexpectedShutdownMsec?: number; // время для перезапуска захвата видео, после падения
    SignalTypes: { [key: string]: cConfigSignalType },
    Input: string,
    StreamOutput: string;
    FileOutput: string;
    FilePath: string;
    PrintCaptureStderr: string | boolean;
    Errors: StreamErrorsTypes;
}

export enum CaptureState { //состояние записи видео в файл
    Nothing,    // пустое значение
    Running,    // идет запись в файл
    Paused,     // запись в файл приостановлена
    NotRunning  // нет записи в файл
}

export type Handler = (data: Buffer) => void;

const makeLocal = (p: string) => p.startsWith(".") ? path.join(myDir, p) : p;

export class Capture {
    private proc_: ChildProcessWithoutNullStreams | child_process.ChildProcess | null = null;
    private wait_procterminate: boolean = false
    private handler_: Handler;
    private cfg_: Config;
    private ferr_: number = -1;
    private proc_event = new mutils.Event(); // Promise<void> | null = null;
    //private proc_completed?:boolean;
    private isStreaming_: boolean = false; // чтение видео с устройства и трансляция
    private stateCapture: CaptureState = CaptureState.NotRunning;  //состояние записи видео в файл
    public stats = { count_start: 0, count_stop: 0, count_crash: 0, count_success_start: 0 }

    currCapSignalType: cConfigSignalType;


    public get State(): [boolean, CaptureState] { return [this.isStreaming_, this.stateCapture] }


    constructor(cfg: Config, handler: Handler) {
        this.handler_ = handler;
        cfg.FilePath = makeLocal(cfg.FilePath);
        cfg.CaptureCmd = makeLocal(cfg.CaptureCmd);
        if (!cfg.Errors) cfg.Errors = {};
        this.cfg_ = cfg;
        this.currCapSignalType = {} as cConfigSignalType;
        for (let i in cfg.SignalTypes) { cfg.SignalTypes[i].Id = i; };
        for (let i in cfg.SignalTypes) { this.currCapSignalType = cfg.SignalTypes[i]; break; };
    }

    //public set

    private exec_cmd1(file: string | null) {
        const cfg = this.cfg_;
        /*
        let args = [...parse(this.currCapSignalType.CmdLineOpts),...parse(cfg.Input), ...parse(cfg.StreamOutput)];
        if (file) {
            args = [...args, ...parse(cfg.FileOutput), file];
        }

        const proc = spawn(cfg.CaptureCmd, args);
        log("CAPTURE PROCESS STARTED:", `[${proc.pid}] ${cfg.CaptureCmd} ${args.join(" ")}`);
        return proc
        */
    }
    /*
    onexecerror(err:Error| child_process.ExecException | null ) {
        if (err) {
            error(`Error at capture process:${err.message}`);
        }    
    }*/
    private exec_cmd(file: string | null) {
        const cfg = this.cfg_;

        let aargs = [cfg.CaptureCmd, this.currCapSignalType.CmdLineOpts, cfg.Input, cfg.StreamOutput];
        if (file) aargs = [...aargs, cfg.FileOutput, file];
        let cmd = aargs.join(' ').trim();
        let shell = cfg.Shell !== undefined ? cfg.Shell : true;

        //const proc = child_process.exec(cmd,(err)=>this.onexecerror(err as any));
        //const proc = child_process.spawn(cmd,[],{shell:true});
        const proc = child_process.spawn(cmd, [], { shell });
        //const proc = child_process.execFile(cmd,[],{shell:true});
        log("CAPTURE PROCESS STARTED:", `[${proc.pid}] =${cmd}=`);
        //proc.stdout?.setEncoding('')
        return proc
    }

    callhandler(data: Buffer) {
        if (!Buffer.isBuffer(data)) {
            throw Error(`Eror:Data is not a buffer!`)
            //process.exit(0);
        }
        this.handler_(data);
    }

    isCapProcessRun() { return this.proc_ != null }

    private SetStaticCaptureSrcFromFile(fn: string) {
        fn = makeLocal(fn);
        log("set static source from", fn);
        const buff = fs.readFileSync(fn);
        this.callhandler(buff);

    }

    private startCaptureProcess() { //( file: string | null) {
        this.stats.count_start++;
        if (this.proc_ != null) {
            error("ERROR: attempt to start process in running state! pid:", this.proc_.pid)
            return;
        }
        if (!(this.isStreaming_ || this.stateCapture != CaptureState.NotRunning)) { error("WANING: startCaptureProcess : no streaming, no capture ... ! ") }


        log("inputtype=", this.currCapSignalType);
        const cfg = this.cfg_;

        if (this.currCapSignalType.ConstImageFN) {
            this.SetStaticCaptureSrcFromFile(this.currCapSignalType.ConstImageFN);
            return;
        }
        this.reopen_ErrorStream()

        const file = this.stateCapture == CaptureState.Running ? this.addFile() : null;
        const proc = this.exec_cmd(file);
        this.proc_ = proc;


        const writeErrStderr = typeof cfg.PrintCaptureStderr === 'boolean';
        const self = this;
        if (!proc.stdout || !proc.stderr) throw Error('Undefined child process std stream!')
        this.stats.count_success_start++;

        this.reopen_ErrorStream(!writeErrStderr)
        //proc.stdout.setEncoding('binary')
        proc.stdout.on('data', (data) => this.callhandler(data));

        proc.stderr.on('data', function (data) {
            if (self.ferr_ >= 0) {
                fs.writeSync(self.ferr_, data);
            } else if (cfg.PrintCaptureStderr) {
                process.stderr.write(data);
            }
        });

        proc.on('error', err => error(`Error at capture process:${err.message}`));


        proc.on('close', () => {
            log('CAPTURE PROCESS CLOSED:', proc.pid);
            this.proc_event.signal(1)
            this.after_ProcessFinshed(proc, true)
        });

        //this.wait_ = new Promise<void>(r => { proc.on("exit", r); })
    }

    private streamError(errid: keyof StreamErrorsTypes) {
        //log("Error stream:",errid);
        error("Error stream:", errid);
        let fn = this.cfg_.Errors[errid];
        if (fn) {
            this.SetStaticCaptureSrcFromFile(fn);
        }

    }

    private count_wait_restart: number = 0;
    private async RestoreCaptureProcess(sig?: boolean | string) {
        if (sig != undefined) {
            let to = this.cfg_.RestartOnUnexpectedShutdownMsec;
            if (!to) return;
            this.count_wait_restart++;
            setTimeout(this.RestoreCaptureProcess.bind(this), to);
            return
        }
        this.count_wait_restart = 0;
        this.startCaptureProcess();
    }
    private after_ProcessFinshed(proc: any, fromproc: boolean = false) {
        if (this.proc_ != proc) return;
        this.proc_ = null;
        this.reopen_ErrorStream()
        if (!this.wait_procterminate && fromproc) {
            this.streamError("StreamAbnormalTermination")
            this.stats.count_crash++;
            this.RestoreCaptureProcess("crash");

        }
    }
    private async stopCaptureProcess() {
        if (!this.proc_) {
            return;
        }
        this.wait_procterminate = true
        let proc = this.proc_;
        log('stopCaptureProcess.prefinish:', proc.pid);
        //this.proc_.kill("SIGTERM");
        proc.kill("SIGTERM");
        //await this.wait_;
        let resTO = -1; let wres: any = resTO;
        while (wres == resTO) {
            wres = await sync.promseTimeOut(1000, resTO, this.proc_event.wait())
            if (wres == resTO) {
                proc.kill("SIGKILL");
                log('stopCaptureProcess.finish:ERROR: process killed!:', proc.pid);
            }
        }
        log('stopCaptureProcess.finish:', proc.pid);
        this.stats.count_stop++;
        //await Promise.any( this.proc_event.wait() , mutils.wait(2*1000)  )
        //
        this.after_ProcessFinshed(proc);
        this.wait_procterminate = false
    }

    restart_actions: any = []
    rcp_lock: sync.Mutex = new sync.Mutex()
    private async RestartCaptureProcess(action: () => void) {
        this.restart_actions.push(action);
        let cnt_actions = 0;
        await this.rcp_lock.lock()
        try {
            if (!this.restart_actions.length)
                return
            await this.stopCaptureProcess();
            cnt_actions = this.restart_actions;
            for (let queAct of this.restart_actions)
                queAct();
            this.restart_actions = []
            this.startCaptureProcess();
        } finally {
            this.rcp_lock.unlock();
        }
        return cnt_actions
    }

    private reopen_ErrorStream(doopen?: boolean) {
        if (this.ferr_ >= 0) fs.closeSync(this.ferr_)
        this.ferr_ = -1;
        if (doopen)
            this.ferr_ = fs.openSync(this.cfg_.PrintCaptureStderr as string, "w+");

    }

    private files(): string[] {
        const txt = fs.readFileSync(FILES, { encoding: "utf8" });
        return txt
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.length != 0);
    }

    private fname(num: number): string {
        const ext = path.extname(this.cfg_.FilePath);
        const p = this.cfg_.FilePath.slice(0, this.cfg_.FilePath.length - ext.length);
        return `${p}.part${num}${ext}`
    }

    private removeFile(num: number) {
        const file = this.fname(num + 1);
        if (!fs.existsSync(file)) { error("Error:File not exists", file); return }
        fs.unlinkSync(file);
    }

    private addFile(): string {
        const files = this.files();
        log("ADD FILE TO", files, files.length);
        const num = files.length + 1;
        const file = this.fname(num);
        files.push(`file '${file}'`);
        log("AFTER ADD", files);
        fs.writeFileSync(FILES, files.join("\n"), { encoding: "utf8" });
        return file;
    }

    private resetFiles() {
        if (fs.existsSync(FILES)) {
            const files = this.files();
            for (let i = 0; i < files.length; i++) {
                this.removeFile(i);
            }
        }
        fs.writeFileSync(FILES, "");
    }


    public async startStreaming() {
        //if (this.isStreaming_ ) return
        this.isStreaming_ = true;
        this.startCaptureProcess();
    }

    public async stopStreamimg() {
        this.isStreaming_ = false;
        await this.stopCaptureProcess();
    }
    public async GetInputSource(): Promise<any> {
        return { result: { currCapSignalType: this.currCapSignalType, cfg_InputTypes: this.cfg_.SignalTypes, state: this.State } }
    }
    private count_ChangeInputSourceCalls: number = 0
    public async SetInputSource(devinfo: iIOSettings): Promise<any> {
        if (!devinfo.CapSignalType) { return { error: "Invalid parametrs! Need 'CapSignalType' " } }
        let newtp = this.cfg_.SignalTypes[String(devinfo.CapSignalType)];
        if (!newtp) return { error: `Invalid CapSignalType: ${devinfo.CapSignalType} ` };
        let change = (newtp.Id != this.currCapSignalType.Id) || this.count_ChangeInputSourceCalls == 0 || devinfo.ChangeIO; //в первый вызов надо щелкнуть

        let allowrestart = this.cfg_.RestartOnChangeSignal
        //let do_restart = (allowrestart !== false && (change || allowrestart)) || !this.isCapProcessRun();
        //allowrestart = allowrestart==undefined ? true : allowrestart;
        let do_restart = (allowrestart==undefined || (change && allowrestart)) || !this.isCapProcessRun();
        log(" SetInputSource: ", devinfo, change ? "changed" : "no change", do_restart ? "restart!" : "no restart");
        if (do_restart) { // TODO: || true временная затычка
            await this.RestartCaptureProcess(() => { this.currCapSignalType = newtp })
        }
        this.count_ChangeInputSourceCalls += change ? 1 : 0;
        return { result: { change, currCapSignalType: this.currCapSignalType, state: this.State, restart: do_restart } }
    }

    public GetApiState():iVideoCaptureState{
        const pause = this.stateCapture == CaptureState.Paused;
        const binstate=this.stateCapture == CaptureState.Running ? "run" : 
            this.stateCapture == CaptureState.Paused ? "pause" : "stop";
        return { activeSourceCapture:true, 
            videosignaltype: this.currCapSignalType
            ,filewritestate:{
                process : pause || (this.stateCapture == CaptureState.Running) 
                ,pause: pause
                ,binstate: binstate
            } };

    } 
    public async startWriteVideoFile() {
        //if (this.stateCapture == CaptureState.Running ) return;
        log("START CAPTURE");
        await this.RestartCaptureProcess(() => {
            this.resetFiles();
            this.stateCapture = CaptureState.Running;
        })
    }

    public async pauseWriteVideoFile() {
        if (this.stateCapture != CaptureState.Running)
            return;
        log("PAUSE CAPTURE");
        await this.RestartCaptureProcess(() => { this.stateCapture = CaptureState.Paused; })
    }

    public async resumeWriteVideoFile() {
        if (this.stateCapture != CaptureState.Paused)
            return;
        log("RESUME CAPTURE");
        await this.RestartCaptureProcess(() => { this.stateCapture = CaptureState.Running; })
    }

    public async stopWriteVideoFile(resultPath: string) {
        if (this.stateCapture == CaptureState.NotRunning )
            return;
        log("STOP CAPTURE:", resultPath);
        await this.RestartCaptureProcess(() => { this.stateCapture = CaptureState.NotRunning; })
        if (fs.existsSync(resultPath)){
            log(`file deleted: ${resultPath} `);
            fs.unlinkSync(resultPath );
            log(`file owerwrite`);
        }
        if (resultPath != "@" && resultPath != "") {
            const proc = spawn(this.cfg_.CaptureCmd,
                ["-f", "concat", "-safe", "0", "-i",
                    FILES, "-c", "copy", resultPath]);
            await new Promise(r => proc.on("exit", r));
        }
        this.resetFiles();
    }

    public async close() {
        await this.stopCaptureProcess();
        this.resetFiles();
        this.isStreaming_ = false;
        this.stateCapture = CaptureState.NotRunning;
    }
}