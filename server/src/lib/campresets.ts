// Модуль campresets.ts содержит:
// Фукнции и структуры ланных для управления пресетами камер.
// Пресет это параметры камеры которые можно сохранить и восстановить ,  в том числе координаты направления камеры, коэффициент увеличения, скорость поворота, и др. параметры

// Конкретные параметры для сохранения описаны в структуре rCameraData из файла camera.ts

import fs from "fs";
import {ControlI } from "./camera";
import {eErrorAction} from "./utils"
import * as mutils from "./utils";
import {  rCameraSoftPreset, rCameraSoftPresetsList  } from "./camera_interfaces";



export class Presets {
    private fname_: string;
    private data_: rCameraSoftPresetsList;
    private idx: {[id:string]:string}={};

    constructor(fname: string) {
        this.fname_ = fname;
        this.data_ = {};
        this.load();
    }

    private load() {
        if (fs.existsSync(this.fname_)) {
            const t = fs.readFileSync(this.fname_, {encoding: "utf8"});
            this.data_ = JSON.parse(t);
        }
        for (let v of Object.values(this.data_) ){
            this.idx[v.Name] =  this.idx[v.ID] = v.ID;
        }
    }

    private save() {
        fs.writeFileSync(this.fname_, JSON.stringify(this.data_));
    }

    async create(name: string, cam: ControlI, id:string=""): Promise<rCameraSoftPreset | null> {
        let result = null;
        if (!id) for (let i = 0; i < 0x7F; i++) { 
            let ii = String(i)
            if (typeof this.data_[ii] === 'undefined') { 
                id= ii
                break;
            }
        }
        if (!id) id=`${cam.getCfg().ID}-t${mutils.getUnixTime()}`;
        result= await this.MakePreset( cam , {ID: id, Name: name});
        this.save();
        return result;
    }

    async MakePreset( cam: ControlI , prs: rCameraSoftPreset):Promise<rCameraSoftPreset>{
        this.data_[prs.ID] = prs;
        this.idx[prs.Name] =  this.idx[prs.ID] = prs.ID;
        prs.softData = await cam.getCameraData( ["pos"] , { ea:eErrorAction.Continue } )
        let n = Number(prs.ID);
        if (mutils.isInteger(prs.ID) && n<0x7F) 
            await cam.presetHardSave( Number(prs.ID) );
        return prs;
    }

    remove(ID: string) {
        let pr=this.getPreset(ID);
        delete this.idx[pr.ID];
        delete this.idx[pr.Name];
        delete this.data_[ID];
        this.save();
    }

    get(): rCameraSoftPresetsList {
        this.load();
        return this.data_;
    }

    getPreset(ID: string ):rCameraSoftPreset{
        ID = this.idx[ID];
        const preset = this.data_[ID];
        if (!preset) throw Error(`Invalid preset ID:${ID}`);
        return preset
    }
    async setPreset(ID: string, cam: ControlI) {
        const preset = this.getPreset(ID);
        if (!preset) throw Error(`Invalid preset ID:${ID}`);
        return await cam.presetRecall(Number(preset.ID));
    }
}