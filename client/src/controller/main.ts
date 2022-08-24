// Модуль main.ts содержит:
// Основные функции клиентской части 

//( class MainController )

import * as camera from "./camera";
import * as swtch from "./switch";
import * as capt from "./capture";
import * as ui from "hyperoop";
import { Router } from "hyperoop-router";
import * as utils from "./utils";
import {MakeError} from "./utils";

import { OptionsPageController } from "./options";
import * as sched from "./schedule";
import {  OneOptions   } from "../model/options";
import * as moptions from "../model/options";
import * as video from "./video";
import * as mvideo from "../model/video";
import { rProgramOptions   } from "@gen_lib/api_interfaces";


export type MainState = {
    ShowSideBar: boolean;
    VideoUrl:string
    _dummy: boolean;
}

interface Page {
    enter();
    exit();
}

export class MainController extends ui.Actions<MainState> {
    private opt: rProgramOptions;

    private pages: {[name: string]: Page} = {};
    private sock: video.Socket = null;

    public readonly Router: Router;
    public cameraPage: camera.CameraPageController;
    public switchPage: swtch.SwitchPageController;
    public capturePage: capt.CapturePageController;
    public optionsPage: OptionsPageController;
    public schedulePage: sched.SchedulePageController;

    constructor() {
        super({ShowSideBar: true, _dummy: false, VideoUrl:''});
        this.cameraPage = new camera.CameraPageController(this);
        this.switchPage = new swtch.SwitchPageController(this);
        this.capturePage = new capt.CapturePageController(this);
        this.optionsPage = new OptionsPageController(this);
        this.schedulePage = new sched.SchedulePageController(this);
        this.pages = {
            "camera": this.cameraPage,
            "switch": this.switchPage,
            "capture": this.capturePage,
            "options": this.optionsPage,
            "schedule": this.schedulePage,
        };
        this.Router = new Router(this, ui.h);
        mvideo.Set_onErrorVideoMjpg ( this.onErrorVideoMjpg.bind(this) );
    }

    onErrorVideoMjpg(){
       // this.cameraPage.State.VideoUrl = "img/videoNotAccessible.jpg"
       this.State.VideoUrl = "img/videoNotAccessible.jpg"
    }
    public async onLocationChange(data: any) {
        console.log("LOCATION CHANGE");
        let page = window.location.hash;
        if (page.startsWith("#")) page = page.slice(1);
        const was = this.opt.DefaultPage;

        const wasPage = this.pages[was];
        const nowPage = this.pages[page];

        if (wasPage) wasPage.exit();

        this.State._dummy = !this.State._dummy;

        //await this.saveOptions(this.opt);
        await this.changeOptions( { DefaultPage : page } )
        switch(page) {
            case "camera": await this.cameraPage.getState();
        }

        if (nowPage) nowPage.enter();
    }

    localStorageKey="stelcs.PoInt.webclient."+window.location.host;
    ///localStorage.getItem( "stelcs.PoInt.webclient.localhost:8126" )

    private async getOptions(): Promise<rProgramOptions> {
        const res = await utils.callServer("/cmd/options" , "getOptions" )
        if (res.error) return null;
        let gr:any = res.result as rProgramOptions;
        try {
            let lr = JSON.parse( localStorage.getItem(this.localStorageKey) );
            for (let n in lr ) { if (moptions.isLocalOption( n  ))  gr[n] = lr[n] }
        } catch {}

        return gr;
    }

    async changeOptions(opt: OneOptions): Promise<Error | null> {
        let gOpt:any = this.Options
        let isglobal=0
        for (let nm in opt) { 
            gOpt[nm] = opt[nm]; 
            isglobal += moptions.isLocalOption( nm) ? 0 : 1;  
        }
        localStorage.setItem( this.localStorageKey,JSON.stringify(gOpt));
        if ( isglobal ) 
            return this.saveOptions( gOpt );
        return null;
    }
    async saveOptions(opt: rProgramOptions): Promise<Error | null> {
        const val = JSON.stringify(opt);
        const res = await utils.callServer(`/cmd/options?value=${encodeURIComponent(val)}` , "saveOptions" )
        return res.error ? MakeError(res.error) : null;
    }

    get Options() { return this.opt; }

    public async setup(poll: utils.LongPolling, videoURL: string) {
        this.opt = await this.getOptions();
        this.State.ShowSideBar = this.opt.ShowSideBar;
        if (videoURL.startsWith("ws:")) this.sock = new video.Socket(videoURL);

        await this.cameraPage.setup(this.sock);
        await this.switchPage.setup(poll);
        await this.capturePage.setup(poll, this.sock);
        await this.optionsPage.setup();
        await this.schedulePage.setup(poll);
    }

    public async toggleSideBar() {
        this.State.ShowSideBar = !this.State.ShowSideBar;
        //this.opt.ShowSideBar = this.State.ShowSideBar;
        //await this.saveOptions(this.opt);
        await this.changeOptions( { ShowSideBar : this.State.ShowSideBar } )
    }

    public async setVideoPath(p: string): Promise<string> {
        //let saveopt= this.opt.SaveVideoPath
        await this.changeOptions( { SaveVideoPath: p } )
        return this.opt.SaveVideoPath;

        //const opt = {...this.opt, SaveVideoPath: p};
        //if (await this.saveOptions(opt) === null) {            this.opt = opt;        }
        //return this.opt.SaveVideoPath;
    }

    public async setTheme(p: string): Promise<string> {
        const style = document.getElementById("mainStyleLink") as HTMLLinkElement;
        style.href = `built/css/theme-${p}.css`;
        //this.opt.DefaultTheme = p;
        //await this.saveOptions(this.opt);
        await this.changeOptions( { DefaultTheme : p } )

        return p;
    }
}