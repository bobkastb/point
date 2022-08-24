// Модуль camera.ts содержит:
// Функции управления камерой
// функции получения состояния камеры

import * as ui from "hyperoop";
import * as cam from "../model/camera";
//import {rCameraState} from "../model/camera";

import * as vid from "../model/video";
import * as utils from "./utils";
import * as mcapt from "./capture";
import { MainController } from "./main";
import * as video from "./video";

import {rCameraState,iCameraData_PosExt,rCameraSoftPreset,iCameraHumanLimits
        ,rCameraSpeedInfo, resCameraOperation , rImageTruncateData } from "@gen_lib/camera_interfaces";
import {InvalidPresetID} from "@gen_lib/api_const";
import {PresetIdType ,unixtimeMS } from "@gen_lib/api_interfaces";


export type CameraPageState = {
    VisibleCameraID: string;
    ActivePresetID: PresetIdType;
    Moving: string;
    ShowDialog: boolean;
    ShowErrorsDialog: boolean;
    Presets: rCameraSoftPreset[];
    SpeedInfo: rCameraSpeedInfo;
    Errors: cam.PerCameraErrors;
    PanoramaFile: string;
    PanoramaVisible: boolean;
    CameraPos: iCameraData_PosExt | null;
    CameraMoveLimits: iCameraHumanLimits | null;
    Truncated: rImageTruncateData | null;
    VideoText: vid.TextTable;
    IndicationVisible: boolean;
    //VideoUrl:string;
}

interface PointXY {
    x: number,
    y: number
}

const dfltSpeedInfo: rCameraSpeedInfo = {
    speedRange: [1, 1],
    speed: 1
}

export class CameraPageController extends ui.SubActions<CameraPageState> {

    private dialogText: string = "";
    private wheel_delta: number = 0;
    private q_setpos: Promise<any> | number = 0;
    private start_shift?: PointXY;
    private start_shift_time: unixtimeMS = 0;
    private truncTimeoutID: NodeJS.Timeout | null = null;
    private parent: MainController;
    sock: video.Socket = null;
    videoCallback: (ev: MessageEvent) => void = null;
    already_setup: boolean

    constructor(parent: ui.Actions<object>) {
        super({
            VisibleCameraID: "",
            ActivePresetID: InvalidPresetID,
            Moving: "",
            ShowDialog: false,
            ShowErrorsDialog: false,
            Presets: [],
            SpeedInfo: dfltSpeedInfo,
            Errors: {},
            PanoramaFile: "",
            PanoramaVisible: true,
            CameraPos: null,
            CameraMoveLimits: null,
            Truncated: null,
            VideoText: {},
            IndicationVisible: true,
            //VideoUrl:'',
        }, parent);
        this.parent = parent as MainController;
    }

    async setup(sock: video.Socket) {
        this.sock = sock;
        this.already_setup=true;
        const cams = await this.getCameras()
        await this.setErrors();
        if (cams.length > 0) {
            this.State.VisibleCameraID = cams[0].ID;
        }
        const opt = this.parent.Options;
        if (opt.PanoramaVisible !== undefined) this.State.PanoramaVisible = opt.PanoramaVisible;
        if (opt.CameraIndicationVisible !== undefined) this.State.IndicationVisible = opt.CameraIndicationVisible;
        await this.getState();
    }

    private calcErrors(st: rCameraState): cam.ErrorsAndWarnings {
        const ew: cam.ErrorsAndWarnings = {
            Controlled: true,
            Visible: true,
            HasCtrlErrors: false,
            HasCommErrors: false
        };

        function updateCtrlError(...msgs: string[]) {
            if (ew.CtrlError) ew.CtrlError = ew.CtrlError.concat(msgs);
            else ew.CtrlError = msgs;
            ew.Controlled = false;
            ew.HasCtrlErrors = true;
        }

        function updateCtrlWarning(...msgs: string[]) {
            if (ew.CtrlError) ew.CtrlWarning = ew.CtrlWarning.concat(msgs);
            else ew.CtrlWarning = msgs;
        }


        if (!st.port) {
            updateCtrlError("Порт управления не задан");
        } else if (!st.Controlled) {
            const dm = st.DiagnosticMessages;
            //dm.IdError = ["ошибка 1", "ошибка 2"]; // УДАЛИТЬ!!!
            if (dm.IdError) {
                updateCtrlWarning(...dm.IdError);
            }
            if (dm.IdSet) {
                updateCtrlWarning(...dm.IdSet);
            }
            if (dm.SerialError) {
                updateCtrlError(dm.SerialError);
            }
            if (dm.InitError) {
                updateCtrlError(dm.InitError);
            }
        }

        //st.Pin_SwitchIn = "";  // УДАЛИТЬ!!!

        if (!st.Pin_SwitchIn) {
            ew.CommError = ["Не задано подключение камеры к коммутатору"];
            ew.Visible = false;
            ew.HasCommErrors = true;
        }

        if (!st.ActiveCapture) {
            ew.Visible = false; //TODO: это дичь проверять это тут
        }

        //console.log("!!!", ew);
        return ew;
    }

    private updateErrors(cams: rCameraState[]) {
        if (!this.State.Errors)
            this.State.Errors = {}
        let errs = this.State.Errors;
        for (const st of cams) {
            errs[st.ID] = this.calcErrors(st);
        }
        this.State.Errors = errs

    }
    private async setErrors() {
        const cams = await this.getCameras();
        this.State.Errors = {};
        this.updateErrors(cams);
    }

    async setVisibleCamera(ID: string): Promise<any> {
        this.State.VisibleCameraID = ID;
        await utils.callServer(`/cmd/cam/activate?id=${ID}`, "camera.setVisibleCamera")
        const err = await this.getState();
        if (err) return null;
        return true;
    }

    async getCameras(): Promise<rCameraState[]> {
        const res = await utils.callServer("/cmd/cam/cameras", "camera.getCameras")
        if (res.error) return [];
        return res.result as rCameraState[];
    }

    //window.location.hostname

    async getVideoURL(): Promise<string> {
        const res = await utils.callServer("/cmd/videostream", "camera.getVideoURL")
        if (res.error) return "";
        const re = /(\/\/)(localhost)([:\/])/
        res.result = (res.result as string).replace(re, '$1' + window.location.hostname + '$3')
        console.log("getVideoURL()=", res.result);
        return res.result;
    }

    async makePanorama(): Promise<resCameraOperation | null> {
        const res = await utils.callServer(`/cmd/cam/makepanorama?id=${this.State.VisibleCameraID}`, "camera.makePanorama")

        if (res.error) return null;
        const q = res.result as resCameraOperation;
        if (q.state) {
            this.State.PanoramaFile = "";
            setTimeout(() => this.State.PanoramaFile = q.state.PanoramaApiPath);
        }
        return q;
    }

    private doUpdateCameraPos(p: iCameraData_PosExt) {
        const col = "rgba(0,200,0,30)";
        let ntxt = "error";
        if (p.PanTiltPos_h && p.ZoomPos_h) {
            this.State.CameraPos = p;
            if (this.State.IndicationVisible) {
                ntxt = `H: ${p.PanTiltPos_h[0].toFixed(3)}°  V: ${p.PanTiltPos_h[1].toFixed(3)}°   Zoom ×${p.ZoomPos_h.toFixed(3)}`;
            }
        }
        this.DoSetTableText(ntxt, "location", col)
    }

    onSocketError(msg: string) {
        let txt = '';
        if (this.State.IndicationVisible && msg) {
            txt = `видео недоступно: ` + msg.toLowerCase();
        }
        this.DoSetTableText(txt, ["center", "center"], "rgba(200,50,0,30)");
    }

    private DoSetTableText(txt: string, keyp: [vid.TextPosX, vid.TextPosY] | string, color: string = "black") {
        this.State.VideoText = vid.setTableText(this.State.VideoText, txt, keyp, color);
    }

    private updateCameraState(rstate: rCameraState): rCameraState {
        if (rstate.speedRange && rstate.speed) {
            const si = { speed: rstate.speed, speedRange: rstate.speedRange }
            this.State.SpeedInfo = si;
        }
        if (rstate.Presets) {
            let presets: rCameraSoftPreset[] = [];
            for (const k in rstate.Presets) presets.push(rstate.Presets[k]);
            this.State.Presets = presets;
        }
        if (rstate.Limits)
            this.State.CameraMoveLimits = rstate.Limits;
        this.State.PanoramaFile = rstate.PanoramaApiPath;
        if (rstate.camdata) {
            this.doUpdateCameraPos(rstate.camdata);
        }

        //this.updateErrors([rstate]);

        return rstate
    }

    private handleCameraResult(q: resCameraOperation): resCameraOperation {

        if (q.state)
            this.updateCameraState(q.state)
        let truncate_txt = '';
        if (q.truncate) {
            this.State.Truncated = q.truncate;
            if (this.truncTimeoutID === null) {
                truncate_txt = `изображение обрезано`;
                this.truncTimeoutID = setTimeout(() => {
                    this.DoSetTableText('', ["left", "top"]);
                    this.truncTimeoutID = null;
                }, 5000);
            }
        } else {
            this.State.Truncated = null;
            if (this.truncTimeoutID !== null) {
                clearTimeout(this.truncTimeoutID);
                this.truncTimeoutID = null;
            }
        }
        this.DoSetTableText(truncate_txt, ["left", "top"], "rgba(200,0,0,30)");
        return q;
    }

    async moveVisibleCamera(dir: string): Promise<resCameraOperation | null> {
        this.State.Moving = dir;
        this.State.ActivePresetID = InvalidPresetID;
        let q: string;
        switch (dir) {
            case "PLUS": q = `/cmd/cam/zoomStart?id=${this.State.VisibleCameraID}&zoom=tele`; break;
            case "MINUS":q = `/cmd/cam/zoomStart?id=${this.State.VisibleCameraID}&zoom=wide`; break;
            //TODO: check dir in RIGHT,LEFT,UP,DOWN
            case "RIGHT":case "LEFT":case "UP":case "DOWN":
                 q = `/cmd/cam/driveStart?id=${this.State.VisibleCameraID}&dir=${dir}`;break;
            default: throw Error("Invalid direction")     
        }
        const res = await utils.callServer(q, "camera.moveVisibleCamera")

        if (res.error) return null;
        return this.handleCameraResult(res.result);
    }

    async stopVisibleCamera(): Promise<resCameraOperation | null> {
        const dir = this.State.Moving;
        let q: string;
        switch (dir) {
            case "PLUS":
            case "MINUS": q = `/cmd/cam/zoomStop?id=${this.State.VisibleCameraID}`; break;
            default: q = `/cmd/cam/driveStop?id=${this.State.VisibleCameraID}`;
        }
        const res = await utils.callServer(q, "camera.stopVisibleCamera")

        if (res.error) return null;
        return this.handleCameraResult(res.result);
    }

    async do_wheel_query() {
        let on_finish = async (error?: any) => {
            this.q_setpos = error ? 0 : 1;
            //await utils.wait(100);
            this.do_wheel_query();
        }
        if (typeof this.q_setpos == "number" && this.wheel_delta != 0) {
            //this.
            this.q_setpos = fetch(`/cmd/cam/setposition?id=${this.State.VisibleCameraID}&zoom_abswheel=${-this.wheel_delta}`);// .catch(e=>Error(e));
            this.q_setpos.then(async (value) => {
                on_finish();
                const res = await utils.getJSON(value, "camera.do_wheel_query");
                if (!res.error) {
                    this.handleCameraResult(res.result);
                }
            }, error => { on_finish(error) })
            this.wheel_delta = 0;
        }
    }

    async shift_camera(pFrom: PointXY, pTo: PointXY) {
        //if (!delta.x && !delta.y) return;
        let s = 0; for (let c in pTo) s |= Math.floor((pTo[c] - pFrom[c]) * 10000)
        if (s == 0) return; // nothinf todo 
        console.log(" shift fetch: ", pFrom, ">>>>", pTo);
        let data = `posFrom=${pFrom.x},${pFrom.y}&posTo=${pTo.x},${pTo.y}`
        const res = await utils.callServer(`/cmd/cam/setposition?id=${this.State.VisibleCameraID}&${data}`, "camera.shift_camera")

        if (!res.error) {
            this.handleCameraResult(res.result);
        }
    }

    //m_lastpos?:any;
    async varea_mouseevent(event: MouseEvent) {
        let t: any = event.target;
        //(t as Element).setPointerCapture( 0 )
        //console.log(event ,`>>  "${event.type}" x:${event.offsetX} y:${event.offsetX} b:${ event.button } bs:${event.buttons}`  )
        let tp: "click" | "dblclick" | "mousemove" | "mousedown" | "mouseup" | "wheel" = (event.type as any);
        let mpos = { x: event.offsetX / t.clientWidth - 0.5, y: 1 - (event.offsetY / t.clientHeight) - 0.5 };
        //let newLastPos=undefined;
        let ctime = utils.getUnixTimeMs();

        if (tp != "mousemove")
            console.log(event, `>>  "${event.type}" x:${event.offsetX} y:${event.offsetX} b:${event.button} bs:${event.buttons}`)
        switch (tp) {
            case "wheel": {
                event.preventDefault();
                this.wheel_delta += (event as any).deltaY;
                this.do_wheel_query() // NO await
            }; break;
            case "dblclick":
                this.shift_camera(mpos, { x: 0, y: 0 });
                break;
            case "click":
                //this.shift_camera( mpos );
                break;
            case "mouseup":
                if (this.start_shift && !(event.buttons & 1) && (ctime - this.start_shift_time > 500)) {
                    this.shift_camera(this.start_shift, mpos);
                    this.start_shift = undefined;
                    this.start_shift_time = ctime;
                }
                break;
            case "mousedown":
                if (event.buttons == 1) {
                    this.start_shift = mpos;
                    this.start_shift_time = utils.getUnixTimeMs();
                }
                break
        }
    }

    async varea_panoevent(event: MouseEvent) {
        let t: any = event.target;
        let tp: "click" | "dblclick" | "mousemove" | "mousedown" | "mouseup" | "wheel" = (event.type as any);
        let mpos = { x: event.offsetX / t.clientWidth, y: 1 - (event.offsetY / t.clientHeight) };
        switch (tp) {
            case "click":
                const q = `/cmd/cam/setglobalposition?id=${this.State.VisibleCameraID}&pos=${mpos.x},${mpos.y}`
                const res = await utils.callServer(q, "camera.varea_panoevent")
                if (res.error) return;
                this.handleCameraResult(res.result);
                break;
        }
    };

    async setVisibleCameraSpeed(val: number): Promise<any> {
        //utils.makeUri("/cmd/cam/setSpeed",{id:this.State.VisibleCameraID, v:val})
        const q = `/cmd/cam/setSpeed?id=${this.State.VisibleCameraID}&v=${val}`
        const res = await utils.callServer(q, "camera.setVisibleCameraSpeed")
        if (res.error) return "";
        this.updateCameraState(res.result)

        return null //await this.getState();
    }

    async getState(): Promise<any> {
        const q = `/cmd/cam/state?id=${this.State.VisibleCameraID}`;
        const res = await utils.callServer(q, "camera.getState")


        if (res.error) return res.error;
        this.updateCameraState(res.result);
        await this.setErrors(); //TODO: Это дичь
        return null;

        const state = res.result as rCameraState;

        this.State.PanoramaFile = state.PanoramaApiPath;
        await this.setErrors();

        let presets: rCameraSoftPreset[] = [];
        for (const k in state.Presets) presets.push(state.Presets[k]);
        this.State.Presets = presets;

        //if (!state.Limits || !state.camdata) console.log("*** pos/limits unknown:", state.Limits, state.camdata);
        if (state.Limits) this.State.CameraMoveLimits = state.Limits;
        if (state.camdata) {
            this.doUpdateCameraPos(state.camdata);
        }

        //console.log("###", presets);
        const si = { speed: state.speed, speedRange: state.speedRange }
        this.State.SpeedInfo = si;
        return null;
    }

    async getPresets(cameraId: string): Promise<rCameraSoftPreset[]> {
        const q = `/cmd/cam/preset/get?id=${cameraId}`
        const res = await utils.callServer(q, "camera.getPresets")

        if (res.error) return [];
        const presets = res.result as { [id: number]: rCameraSoftPreset };
        const result: rCameraSoftPreset[] = [];
        for (const k in presets) result.push(presets[k]);
        return result;
    }

    async addPreset(): Promise<rCameraSoftPreset> {
        const name = encodeURIComponent(this.dialogText);
        const q = `/cmd/cam/preset/add?id=${this.State.VisibleCameraID}&name=${name}`
        const res = await utils.callServer(q, "camera.addPreset")

        this.State.Presets = await this.getPresets(this.State.VisibleCameraID);
        this.toggleDialog();
        if (res.error) return null as rCameraSoftPreset;
        return res.result as rCameraSoftPreset;
    }

    async deletePreset(ID: PresetIdType) {
        const q = `/cmd/cam/preset/remove?id=${this.State.VisibleCameraID}&preset=${ID}`
        const res = await utils.callServer(q, "camera.deletePreset")

        this.State.Presets = await this.getPresets(this.State.VisibleCameraID);
        this.State.ActivePresetID = InvalidPresetID;
    }

    async choosePreset(ID: PresetIdType) {
        const q = `/cmd/cam/preset/set?id=${this.State.VisibleCameraID}&preset=${ID}`;
        await utils.callServer(q, "camera.choosePreset")
        this.State.ActivePresetID = ID;
    }

    toggleDialog() {
        this.State.ShowDialog = !this.State.ShowDialog;
    }

    togglePanorama() {
        this.State.PanoramaVisible = !this.State.PanoramaVisible;
        //const opt = this.parent.Options;
        //opt.PanoramaVisible = this.State.PanoramaVisible;
        //this.parent.saveOptions(opt);
        this.parent.changeOptions({ PanoramaVisible: this.State.PanoramaVisible })
    }

    toggleErrorsDialog() {
        this.State.ShowErrorsDialog = !this.State.ShowErrorsDialog;
    }

    setDialogText(txt: string) {
        this.dialogText = txt;
    }

    toggleIndication() {
        this.State.IndicationVisible = !this.State.IndicationVisible;
        if (this.State.CameraPos) this.doUpdateCameraPos(this.State.CameraPos);
        //const opt = this.parent.Options;
        //opt.CameraIndicationVisible = this.State.IndicationVisible;
        //this.parent.saveOptions(opt);
        this.parent.changeOptions({ CameraIndicationVisible: this.State.IndicationVisible })

    }

    setVideoCallback(cb: (ev: MessageEvent) => void) {
        this.videoCallback = cb;
    }

    async enter() {
        mcapt.enter_VideoViewer(this);
    }

    exit() {
        if (this.sock) this.sock.stop()
    }
}