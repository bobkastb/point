// Модуль capture.ts содержит:
// Функции для захвата изображения , которые вызываются со страницы "/#Capture"

import * as ui from "hyperoop";
import * as utils from "./utils";
import * as video from "./video";
//import * as iapi from "../../../genlib/lib/api_interfaces";
import * as iapi from "@gen_lib/api_interfaces";
import {APIResult} from "@gen_lib/api_interfaces";

import { watchFile } from "fs";
import { FilesTable } from "../view/caplist";


export type CapturePageState = {
    ShowDialog: number;
    IsRecording: boolean;
    IsPaused: boolean;
    Files: string[];
    CurrentFile: string;
    Session: string;
};

export enum CaptureState {
    Running,
    Paused,
    NotRunning
};

export interface captureVideoViewer{
    already_setup: boolean
    sock: video.Socket 
    videoCallback: (ev: MessageEvent) => void ;
    onSocketError(msg: string)
}
export const enter_VideoViewer=async ( ctx: captureVideoViewer)=> {
    //if (!this.already_setup)
    const waitcond= ()=>{ return !ctx.already_setup ? true: ctx.sock && !ctx.videoCallback  }
    for (let i = 0; i < 10 && waitcond(); i++) await utils.wait(10)
    if (!ctx.already_setup)
        console.error("CAPTURE: CANNOT ENTER wait setup!:", ctx.sock, ctx.videoCallback);
    if (ctx.already_setup && !ctx.sock) return;
    if (!ctx.videoCallback) 
        console.error("CAPTURE: CANNOT ENTER: wait video callback!", ctx.sock, ctx.videoCallback);
    ctx.sock.start(ctx.videoCallback, (e) => ctx.onSocketError(e));
}



export class CapturePageController extends ui.SubActions<CapturePageState> {
    private dialogText: string = "";
    sock: video.Socket = null;
    videoCallback: (ev: MessageEvent) => void = null;
    already_setup:boolean=false

    constructor(parent: ui.Actions<object>) {
        super({ 
            ShowDialog: 0, 
            IsRecording: false, 
            IsPaused: false, 
            Files: [], 
            CurrentFile: "",
            Session: "",
        }, parent);
    }

    async setup(poll: utils.LongPolling, sock: video.Socket) {
        this.sock = sock;
        this.already_setup= true;
        await this.updateState();
        const self = this;
        poll.subscribe((r: APIResult) => {
            const x = r.result.capture as iapi.iVideoCaptureState;
            if (x) this.handle_RCaptureState( { result: x});
            const files = r.result.capturefiles as string[];
            if (files) {
                self.State.Files = files;
            }
        })

        //setInterval(() => {
        //    if (opts(window).switchStateRefresh) self.updateState()
        //}, 1500);
    }
    private handle_CaptureState( cr: iapi.iVideoCaptureState ){
        this.State.IsRecording = cr.filewritestate.process;
        this.State.IsPaused = cr.filewritestate.pause;
        if (cr.videofiles) this.State.Files = cr.videofiles;
    }
    private handle_RCaptureState( res: APIResult ){
        if (res.error) return;
        if (!res.result) return;
        this.handle_CaptureState(res.result as iapi.iVideoCaptureState)
    }

    private async updateState() {
        if(document.visibilityState === "visible" && window.location.hash.endsWith("capture")) {
            let result =  await utils.callServer( `/cmd/capture/state` , "capture.updateState state" )
            this.handle_RCaptureState( result);
        }
    }

    toggleDialog() {
        let st = this.State;
        st.ShowDialog = st.ShowDialog ? 0 : 1;
    }
    fileSaveDialogState():number{
        return this.State.ShowDialog;
    }

    setDialogText(txt: string) {
        this.dialogText = txt;
    }
    OnChangeFileName(txt: string){
        //console.log("set dialog text",txt)
        let i=this.State.Files.indexOf(txt)
        let newdv = i==-1 ? 1 : 2
        if (this.State.ShowDialog!=newdv)
            this.State.ShowDialog=newdv
    };

    async chooseFile(name: string) {
        if (name) {
            if (this.State.Session) {
                await utils.callServer( `/cmd/video/session/end?session=${this.State.Session}` , "capture.chooseFile 1" )

            }
            const res = await utils.callServer( `/cmd/video/session/start` , "capture.chooseFile 2" )
            if (res.error) {
                return;
            }
            this.State.Session = res.result;
            this.State.CurrentFile = name;    
        } else {
             await utils.callServer( `/cmd/video/session/end?session=${this.State.Session}` , "capture.chooseFile 3" )
            this.State.Session = "";
            this.State.CurrentFile = "";    
        }
    }

    async startRecord() {
        let r= await utils.callServer(`/cmd/capture/start`, "capture.startRecord" )
        this.handle_RCaptureState( r )
    }

    async stopRecord() {
        let r=await utils.callServer(`/cmd/capture/stop?file=${this.dialogText}`, "capture.stopRecord" )
        this.handle_RCaptureState( r )
    }
    async cancelRecord() {
        let r=await utils.callServer(`/cmd/capture/stop`, "capture.cancelRecord" )
        this.handle_RCaptureState( r )
        this.toggleDialog();
    }

    async pauseRecord() {
        if (!this.State.IsRecording) return
        let r= (this.State.IsPaused) 
        ?await utils.callServer(`/cmd/capture/start`, "capture.resumeRecord" )
        :await utils.callServer(`/cmd/capture/pause`, "capture.pauseRecord" );
        this.handle_RCaptureState( r )
    }

    async setRecordName() {
        await this.stopRecord();
        this.toggleDialog();
    }
    async cmd_stoprecord(){
        if (!this.State.IsRecording) return;
        if (!this.State.IsPaused)
            utils.callServer(`/cmd/capture/pause`, "capture.pauseRecord" );
        this.toggleDialog();    
    }

    scrollRecords(el) {
        const curRec = el.getElementsByClassName("presets-li-on");
        if(curRec.length > 0) {
            curRec[0].scrollIntoView();
        }
    }

    setVideoCallback(cb: (ev: MessageEvent) => void) {
        this.videoCallback = cb;
    }

    onSocketError(msg: string) {
        console.error(msg)
    }

    async enter() {
        enter_VideoViewer(this);
    }

    exit() {
        if (this.sock) this.sock.stop()
    }
}