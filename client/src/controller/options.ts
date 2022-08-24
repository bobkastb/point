// Модуль options.ts содержит:
// Функции получения и первичной обработки параметров клиентской части (цветовая тема, путь для сохранения видеофайлов )

import * as ui from "hyperoop";
import * as utils from "./utils";
import { MainController } from "./main";
import { enumServerID,enumReloadProcessStatusID, imapServerID } from "../model/options";
import { pathjoin, isRoot, MakeError } from "../controller/utils";
//import {isError} from "@gen_lib/gen_functions";
import {isError} from "./utils";
import { rProgramOptions   } from "@gen_lib/api_interfaces";


export type OptionsPageState = {
    Options: rProgramOptions;
    Folders: string[];
    ShownFolder: string;
    Selection: string;
    ChangeState:number;
}

export class OptionsPageController extends ui.SubActions<OptionsPageState> {
    private parent: MainController;

    constructor(parent: MainController) {
        super({
            Options: parent.Options,
            Folders: [],
            ShownFolder: "",
            Selection: "",
            ChangeState:0
        }, parent);
        this.parent = parent;
    }

    public async setup() {
        this.State.Options = this.parent.Options;
        const f = this.State.Options.SaveVideoPath;
        if (isRoot(f)) this.State.ShownFolder = f;
        else {
            const p = f.replace(new RegExp('\\' + this.State.Options.PathSep + '$'), "").split(this.State.Options.PathSep);
            this.State.ShownFolder = p.slice(0, p.length-1).join(this.State.Options.PathSep);
        }
        const fld = await this.getFolders(this.State.ShownFolder);
        if (!isError(fld)) this.State.Folders = fld;
    }

    private async getFolders(start: string): Promise<string[] | Error> {
        const url = `/cmd/folders?start=${encodeURIComponent(start)}`
        const res = await utils.callServer( url , "getFolders" )

                
        if (res.error) return MakeError(res.error);

        if (isRoot(start)) {
            return res.result as string[];
        } else {
            return ["..."].concat(res.result as string[]); 
        }
    }

    public async setVideoPath(p: string) {
        if (p === "...") return;
        p = pathjoin(this.State.Options.PathSep , this.State.ShownFolder, p );
        this.State.Options = {
            ...this.State.Options,
            SaveVideoPath: await this.parent.setVideoPath(p)
        };
    }

    public async setTheme(s: string) {
        this.State.Options = {
            ...this.State.Options,
            DefaultTheme: await this.parent.setTheme(s)
        };
    }

    public async goTo(s: string) {
        const sep = this.State.Options.PathSep;
        let dest = "";
        if (s === "...") {
            const p = this.State.ShownFolder.split(sep);
            dest = p.slice(0, p.length-1).join(sep);
        } else {
            dest = this.State.ShownFolder + sep + s;
        }
        const fld = await this.getFolders(dest);
        if (!isError(fld)) {
            this.State.ShownFolder = dest;
            this.State.Folders = fld;
        }
    }

    private reload_process:{[key:string]:boolean}={}
    async reloadServer( id: enumServerID ){
        if (this.reload_process[id]) { console.log("Error: Reload "+id+" is in process!");  return; }
        const checkprc:{[key in enumServerID ]?:{ restartq:string , report:string, ping:string         }} = { 
            server: { restartq:"/cmd/reload/server" , report:"server", ping:"/cmd/options"         }
            ,media: { restartq:"/cmd/reload/media" , report:"media-server", ping:"/cmd/capture/state" }
        }
        let prc = checkprc[id];
        if (!prc){ console.log("Error: Reload "+id+" not supported!");  return; }
        console.log("Reload "+id+" start")
        if (!confirm("Вы уверены что хотите перезапустить "+prc.report+"?")) return;
        this.reload_process[id]=true; 
        this.State.ChangeState=this.State.ChangeState+1;
        let ready=false; 
        let r= await utils.callServer( prc.restartq , "restart-"+prc.report )
        for (let timeout=10 ; !ready && !r.error && timeout>0; timeout--) {
            await utils.wait(1000)
            try { 
                let rp=await utils.callServer( prc.ping , "ping-"+prc.report )
                ready= rp.error? false : true ; } 
            catch {}
        }
        this.reload_process[id]=false
        this.State.ChangeState=this.State.ChangeState+1;
        console.log("Reload "+id+" end:")
    }
    reloadProcessStatus( srvid:enumServerID , statusD:enumReloadProcessStatusID ){
        if (statusD=="process") return this.reload_process[srvid]==true;
        if (statusD=="enabled") return this.reload_process[srvid]!=true;
        return false;
    }


    public select(s: string) {
        this.State.Selection = s;
    }

    enter() {}
    exit() {}
}