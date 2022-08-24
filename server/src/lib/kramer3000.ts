// Модуль kramer3000.ts содержит:
// Функции для управления коммутатором с протоколом Kramer-3000 по последовательному порту
import * as sw from "./switch";
import * as serial from "./serial";
import * as mlog from "./log";
//import {log} from "./log";
//import { Mutex,wait } from "./sync";
import * as sync from "./sync";
import {isError} from "./gen_functions";
import fs from "fs";
import path from "path";
import { getEnv } from "./environment"
import * as mutils from "./utils";
import { t_display_pin, t_signal_pin } from "./switch";
import {  tDiagnosticMessages , rSwitchState , iSwCnctTable } from "./api_interfaces";
import {  getDiagnosticMessagesO } from "./device-types";
import * as mgen from "./device-types";


const PRESETS_FILENAME = "switch-presets.json"

let LogEnabled: boolean = true;
function log(...args: any[]) { if (LogEnabled) mlog.log(...args); }
//let log:(...args: any[]);//=(...args: any[])=>{}; // =>{};
//type ControlConfig = {   SerialPortFileName: string,}

//type iSwCnctTable = { [key in number]: number };

//type tConnectState = sw.tConnectState;
//type State = rSwitchState;

interface Preset {
    ID: number;
    Name: string;
    State: rSwitchState;
}

interface PresetsList {
    [id: number]: Preset;
}

const NUM_OUTPUTS = 8;
const REPEAT_QUERY = 10;


interface t_switchstate {
    mapsignal?: number[];
    mapdisplay?: number[];
    aud_connects?: number[];
    vid_connects?: number[];
    device_model?: string;
    protocol_version?: string;
}
let zero_t_switchstate: t_switchstate = { mapsignal: [], mapdisplay: [], aud_connects: [], vid_connects: [], device_model: "", protocol_version: "" }
function cmp_array<T>(l: T[], r: T[]): boolean {
    if (l.length != r.length) return false;
    for (let i = 0; i < r.length; i++)
        if (l[i] != r[i]) return false;
    return true;
}

function cmp_switchstate(l: t_switchstate, r: t_switchstate): boolean {
    let n: keyof t_switchstate;
    for (n in zero_t_switchstate) {
        let [lv, rv] = [l[n], r[n]]
        if (Boolean(lv) != Boolean(rv)) return false;
        if (!Boolean(lv)) continue;
        if (Array.isArray(zero_t_switchstate[n])) {
            if (!cmp_array<any>(lv as any, rv as any)) return false;
        } else if (lv != rv) return false;
    }
    return true;
}
interface t_parseans {
    full: string;
    data?: string; error?: string; cmd?: string;
    s: t_switchstate;
    handled_full?: boolean;
}
function assign_ss(st: t_switchstate, r: t_parseans): [t_switchstate, number] {
    let st_a: any = st; let src = r.s;
    let changes = 0;
    if (!src) return [st, 0];
    for (let n in zero_t_switchstate) {
        if (!(n in src)) continue;
        let v = (src as any)[n];
        if (Array.isArray(v)) {
            let da: number[] = (n in st) ? st_a[n] : [];
            let sa: number[] = (src as any)[n];
            for (let i in sa) if (sa[i] != null && da[i] != sa[i]) { da[i] = sa[i]; changes++; }
            st_a[n] = da;
        } else if (st_a[n] != v) {
            st_a[n] = v; changes++;
        }
    }
    return [st, changes];
}
function parseanswer(answ: string): t_parseans {
    //let re=/^~(\d+)@(\w+) +(ERR(\d+)|(.+))/;
    let re = /^~(\d+)@([\w-]+) +(ERR(\d+)|(.+))/;
    let sm = answ.match(re);
    if (!sm || !sm[5]) return { full: answ, error: "invalid answer", s: {} }; //TODO: THROW
    return { full: answ, data: sm[5].trim(), cmd: sm[2], s: {} }
}

function parse_set(pans: t_parseans): number[] | undefined {
    if (!pans.data) { pans.error = "invalid data"; return }
    // Обрабатывает только команду для всеъ контактов
    let r = pans.data.split(',');
    if (r[0].startsWith('*')) { r = r.slice(1, 1000) }
    return r.map((value) => { return Number(value) });
}
function parse_direct(pans: t_parseans): number[] | undefined {
    if (!pans.data) { pans.error = "invalid data"; return }
    let r: number[] = [];
    for (let x of pans.data.split(',')) {
        let y = x.split('>')
        r[Number(y[1]) - 1] = Number(y[0])
    }
    return r;
}

type t_command_metainf = {
    [key: string]: { H: (p: t_parseans) => any; }
}
let command_metainf: t_command_metainf = {
    "SIGNAL": { H: (p) => { p.s.mapsignal = parse_set(p) } },
    "DISPLAY": { H: (p) => { p.s.mapdisplay = parse_set(p) } },
    "AV": { H: (p) => { p.s.aud_connects = p.s.vid_connects = parse_direct(p) } },
    "AUD": { H: (p) => { p.s.aud_connects = parse_direct(p) } },
    "VID": { H: (p) => { p.s.vid_connects = parse_direct(p) } },
    "PROT-VER": { H: (p) => { p.s.protocol_version = p.data } },
    "MODEL": { H: (p) => { p.s.device_model = p.data } },
}

function parseFull(ans: string): t_parseans {
    let pans = parseanswer(ans);
    if (pans.error) return pans;
    if (!pans.cmd) { pans.error = "internal error"; return pans; }
    let f = command_metainf[pans.cmd];
    if (!f) return pans;
    f.H(pans);
    if (!pans.error) pans.handled_full = true;
    return pans;
}
function mapa2table(m?: number[]): iSwCnctTable {
    let res: iSwCnctTable = {}; if (!m) return res;
    for (let i in m) res[Number(i) + 1] = m[i]; return res;
}



export class Control implements sw.ControlI {
    private port_: serial.Port | null = null;
    private mut_: sync.Mutex;
    private afv_ = true;
    private presets_: PresetsList = {};
    private maxPresetID_ = -1;
    //device_model:string="";
    //protocol_version:string="";
    //lastState?:rSwitchState;
    current_state: t_switchstate = {};
    lasttime_getstate: mutils.unixtime = 0;
    cfg: sw.SwitchControlConfig;
    presetsFileName: string;
    DiagnosticMessages: tDiagnosticMessages = {};

    errorOnInit(comment: string, e: any) {
        mlog.error(comment, e);
        if (this.port_) this.port_.close();
        this.port_ = null;
        this.DiagnosticMessages.InitError = `Не удалось инициализировать устройство. ${comment} ${mutils.getErrorMessage(e)}.`
    }
    async async_initialize(): Promise<any> {
        if (!this.cfg.SerialPortFileName) return;
        if (!this.port_) {
            try {
                await serial.SetSerialPortParamsByCfg(this.cfg)
                //mlog.log("endof set serial settings", this.cfg.SerialPortFileName)
                //await mutils.wait(300)
                this.port_ = new serial.Port(this.cfg.SerialPortFileName, 0x0A);
                this.port_.cb_OnReadMsg = this.onRead_fromSerial.bind(this);
            } catch (e) {
                this.errorOnInit('', e);
                return;
            }
        }
        try {
            await this.cmd("VID? *");
            //this.current_state.vid_connects?.length
            await this.getState(true)
            const st = this.current_state;
            mlog.log(`Swith control initialized. Device model:${st.device_model} protocol:${st.protocol_version}`);
        } catch (e) {
            this.errorOnInit(`Ошибка при получении состояния коммутатора :`, e);
            return;
        }
        //console.log( st );
        return this.current_state;
    }

    constructor(_cfg: sw.SwitchControlConfig) { // object = {SerialPortFileName: "/dev/ttyS0"}
        let cfg = _cfg as sw.SwitchControlConfig;
        //const cfg = cfgo as ControlConfig;
        this.mut_ = new sync.Mutex();
        this.cfg = cfg;
        LogEnabled = cfg.DebugOutput == true;
        this.presetsFileName = path.join(getEnv().StorageDataDir, PRESETS_FILENAME);
        this.loadPresets();
        //this.init_device(); // no wait
    }


    buffs2strngs(ba: Buffer[]): string[] {
        let res: string[] = []; ba.forEach(value => res.push(value.toString('utf8')))
        return res;
    }

    cb_last_state: t_switchstate = {};
    lockCallBack: number = 0;
    lock_NotyifyChange(n: -1 | 1) {
        this.lockCallBack += n
        // log(`DBG.kramer3000.lock_NotyifyChange:`,n,this.lockCallBack);
        if (!this.lockCallBack) this.check_and_CallBack()
    }
    check_and_CallBack() {
        if (this.lockCallBack) return
        //log("check_and_CallBack 1" , this.cb_last_state.vid_connects , this.current_state.vid_connects )
        if (cmp_switchstate(this.cb_last_state, this.current_state)) return
        mutils.AnyCopyTo(this.cb_last_state, this.current_state)
        //log("check_and_CallBack 2")
        // call back
        mgen.do_notify({ switch: 1 })
    }

    async onRead_fromSerial(buf: Buffer) {
        let data = buf.toString('utf8');
        let pans = parseFull(data);
        let [r, c] = assign_ss(this.current_state, pans);
        if (c) this.check_and_CallBack()
        //buf.entries()
        log(`kramer3000.serial[${this.port_?.syspath}].Read=${data}`)
    }

    private async cmd(cmd: string, cntc: number = 1): Promise<string> {
        if (!this.port_) return "";
        await this.mut_.lock()
        try {
            let oldm = this.buffs2strngs(await this.port_.peekMessages());
            if (oldm.length) mlog.error("kramer3000.clear input:", oldm);

            let cmd_s = "#" + cmd + "\r";
            log(`kramer3000.cmd: ${cmd_s}`)
            this.port_.write(Buffer.from(cmd_s, "ascii"));
            let fsans: string[] = []; let errs = [];
            while (fsans.length < cntc) {
                const aans = await this.port_.waitMessages(2 * 1000).catch(e => Error(e));
                //log(`kramer3000.ans: ${aans}`)
                if (isError(aans)) throw aans;
                if (!aans.length) throw Error(`TimeOut:Коммутатор не отвечает на команду`)
                let sans = aans.map((value) => value.toString('utf8'));
                fsans = fsans.concat(sans);
                for (let ans of sans) {
                    let pans = parseFull(ans);
                    if (pans.error) errs.push(pans.error)
                }
                //log(`kramer3000.ans: ${x}` )
            }
            if (errs.length) throw Error(`kramer3000.on cmd (${cmd}) Errors:${errs.join(';')}`)
            return fsans.join(";");
        }
        finally {
            this.mut_.unlock();
        }
    }

    public async command(cmd: string): Promise<object> {
        return {
            answer: await this.cmd(cmd)
        }
    }

    public async connect(input: sw.SwitchID, outputs: sw.SwitchID[]): Promise<object> {
        let answers: { [key in string]: string } = {};
        const code = (this.afv_ && parseInt(input) <= NUM_OUTPUTS) ? "AV" : "VID";

        try {
            this.lock_NotyifyChange(1);

            for (const out of outputs) {
                const cmd = `${code} ${input}>${out}`;
                let answ = await this.cmd(cmd);
                answers[cmd] = answ;
            }

            return { answers };
        } finally {
            this.lock_NotyifyChange(-1);
        }
    }


    public async afv(set: boolean) {
        await this.cmd(`AFV ${set ? 0 : 1}`);
        this.afv_ = set;
    }

    GetSavedState(): rSwitchState {
        return this.calc_state();
    };
    Display2Signal(display_pin: t_display_pin): t_signal_pin | undefined {
        if (!display_pin || !this.port_) return;
        const cstate = this.current_state;
        if (!cstate.vid_connects) throw Error("Switch not ready to talk (on call Display2Signal)")
        let r = cstate.vid_connects[display_pin - 1]
        return r ? r : undefined
    };

    private calc_state(): rSwitchState {
        const cstate = this.current_state
        function au2a(a?: number[]): number[] { return a ? a : []; }
        return {
            Audio: mapa2table(cstate.aud_connects),
            Video: mapa2table(cstate.vid_connects),
            AFV: this.afv_,
            ActiveInputs: au2a(cstate.mapsignal),
            ActiveOutputs: au2a(cstate.mapdisplay),
            DeviceInfo: `model:${cstate.device_model} proto:${cstate.protocol_version}`,
            internal: cstate,
            DiagnosticMessages: getDiagnosticMessagesO(this),
            Controlled: Boolean(this.port_),
            port: this.cfg.SerialPortFileName
            //getDiagnosticMessages( this.DiagnosticMessages )
        }

    }
    public async getState(force: any = false): Promise<rSwitchState> {
        let tmstart = mutils.getUnixTime();
        if ((force == "cash") || (!force && (this.lasttime_getstate + 60 > tmstart)))
            return this.calc_state();

        try {
            this.lock_NotyifyChange(1);
            this.lasttime_getstate = tmstart;
            await this.cmd("AUD? *");
            await this.cmd("VID? *");
            await this.cmd("SIGNAL? *");
            await this.cmd("DISPLAY? *");
            const cstate = this.current_state
            if (cstate.device_model == undefined)
                await this.cmd("MODEL?");
            if (cstate.protocol_version == undefined)
                await this.cmd("PROT-VER?");
            return this.calc_state();
        } finally {
            this.lock_NotyifyChange(-1);
        }
    }

    public async close(): Promise<void> {
        if (!this.port_) return;
        await this.port_.close();
    }

    private loadPresets() {
        if (fs.existsSync(this.presetsFileName)) {
            const t = fs.readFileSync(this.presetsFileName, { encoding: "utf8" });
            this.presets_ = JSON.parse(t);
            for (let id in this.presets_) {
                const preset = this.presets_[id];
                if (preset.ID > this.maxPresetID_)
                    this.maxPresetID_ = preset.ID;
            }
        }
    }

    private savePresets() {
        fs.writeFileSync(this.presetsFileName, JSON.stringify(this.presets_, null, ' '));
    }

    public async createPreset(name: string): Promise<Preset> {
        this.maxPresetID_++;
        const preset: Preset = {
            ID: this.maxPresetID_,
            Name: name,
            State: await this.getState(),
        }
        mutils.DeleteFieldFromObj(preset.State, "DeviceInfo", "ActiveInputs", "ActiveOutputs", "internal");
        this.presets_[preset.ID] = preset;
        this.savePresets();
        return preset;
    }

    public removePreset(ID: number) {
        delete this.presets_[ID];
        this.savePresets();
    }

    async getPresets(): Promise<PresetsList> {
        this.loadPresets();
        return this.presets_;
    }

    async setPreset(ID: number): Promise<object> {
        const preset = this.presets_[ID];
        this.afv(preset.State.AFV);

        try {
            this.lock_NotyifyChange(1);
            let args = Object
                .entries(preset.State.Video)
                .map(([outp, inp]) => `${inp}>${outp}`); //.join(",");

            let cmd = `VID ${args.join(",")}`;
            await this.cmd(cmd, args.length);

            args = Object
                .entries(preset.State.Audio)
                .map(([outp, inp]) => `${inp}>${outp}`)

            cmd = `AUD ${args.join(",")}`;
            await this.cmd(cmd, args.length);

            return preset;
        } finally {
            this.lock_NotyifyChange(-1);
        }
    }

}