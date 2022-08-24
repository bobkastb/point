// Модуль schedule.ts содержит:
// Функции для планировщика заданий на сервере, которые вызываются со страницы "/#schedule"

import * as ui from "hyperoop";
import * as utils from "./utils";
import * as model from "../model/schedule";
//import {rCameraState} from "../model/camera";
import {rCameraState} from "@gen_lib/camera_interfaces";
import {APIResult} from "@gen_lib/api_interfaces";
//import {rSchedulerApiResult} from "../model/schedule";
import {rScheduleEntry,rScheduleTaskState,rSchedulerApiRequest,rSchedulerApiResult} from "@gen_lib/schedule_interface";




export type SchedulePageState = {
    Entries: model.ScheduleMap;
    Enabled:boolean;
    TaskProps:rScheduleTaskState|null;
    TaskLog:string;
    RecordFiles:string[];
    EditEntryId:string;
    EditNewEntry:boolean;
    Entry2Edit:model.SchedEntry_Local|null;
    Cameras:rCameraState[];
    Presets:model.CameraPresets;
}

//type EntryIds = {   IdList: string[];}



export class SchedulePageController extends ui.SubActions<SchedulePageState> {

    taskPropsHidden:rScheduleTaskState|null;

    constructor(parent: ui.Actions<object>) {
        super({Entries:{}, Enabled:true, TaskProps:null, TaskLog:"", RecordFiles:[], EditEntryId:"", Entry2Edit:null, Cameras:[], Presets:{}, EditNewEntry:false}, parent);
        this.taskPropsHidden = null;
    }

    private makeScheduleMapEntry = (entry: rScheduleEntry, state?: rScheduleTaskState): model.SchedEntry_Local => {
        if (entry.Start === undefined) {
            entry.Start = Math.floor(Date.now()/1000);
            console.error("Schedule entry with undefined Start received!");
        }
        if(entry.Duration === undefined) {
            entry.Duration = 0;
            console.error("Schedule entry with undefined Duration received!");
        }
        if(entry.Period === undefined) {
            entry.Period = 0;
            console.error("Schedule entry with undefined Period received!");
        }
        const offt = new Date().getTimezoneOffset() * 60; //timezone offset in seconds
        const localStartDT = new Date((entry.Start-offt)*1000);
        const dtArr = localStartDT.toISOString().split("T");
        const tmArr = dtArr[1].split(".");
        const ret:model.SchedEntry_Local = {
            ...entry,
            StartDate:dtArr[0], 
            StartTime:tmArr[0],
            Changed:false,
            Running: state !== undefined ? state.state==="Running" : false
        };
        return ret;
    }

    private makeEntries(schedInfo: rSchedulerApiResult) :model.ScheduleMap {
        const res: model.ScheduleMap = {};
        if (schedInfo.SchedulerCfg)
        schedInfo.SchedulerCfg.Entries.forEach(entry => (entry.Id!==undefined && entry.Id!=="") 
            ? res[entry.Id]=this.makeScheduleMapEntry(entry, schedInfo.SchedulerState.tasks[entry.Id])
            :"" );
        return res;
    }

    private getTasksStates(state: rSchedulerApiResult) : model.ScheduleMap | null {
        if (state.SchedulerState !== undefined) {
            const taskStates = state.SchedulerState.tasks;
            const newEntries: model.ScheduleMap = {...this.State.Entries};
            let changed = false;
            for(let Id in newEntries) {
                if(taskStates[Id] !== undefined) {
                    const running = taskStates[Id].state==="Running"
                    if(running !== newEntries[Id].Running) {
                        changed= true;
                        newEntries[Id].Running = running;
                    }
                    if(this.State.TaskProps !== null && Id === this.State.TaskProps.Id) {
                        if(taskStates[Id].state!==this.State.TaskProps.state) {
                            if(taskStates[Id].state === "notrun") {
                                this.getTaskLogAndRecords();
                            }
                            const taskProps = {...this.State.TaskProps, state:taskStates[Id].state};
                            this.State.TaskProps = taskProps;
                        }
                    }
                }
            }
            if (changed) {
                return newEntries;
            }
        }
        return null
    }

    setEditEnrtyId() {
        const entryIds = Object.keys(this.State.Entries);
        if(entryIds.length > 0) {
            this.State.EditEntryId = entryIds[0];
        } else {
            this.State.EditEntryId = "";
        }
    }

    async setup(poll: utils.LongPolling) {
        const sched = await this.getState();
        this.State.Entries = this.makeEntries(sched);
        this.State.Enabled = sched.SchedulerCfg?.Enabled;
        this.State.Cameras = await this.getCameras();
        for(const id in this.State.Cameras) {
            const camId = this.State.Cameras[id].ID
            if (this.State.Presets[camId] === undefined) {
                const p = await this.getPresets(camId)
                this.State.Presets[camId] = p === null ? {} : p;
            }
        }
        this.setEditEnrtyId();
        const self = this;
        poll.subscribe((r: APIResult) => {
            const state = r.result.schedule as rSchedulerApiResult;
            if (state) {
                const newEntries = self.getTasksStates(state);
                if (newEntries !== null) self.State.Entries = newEntries;
            }
        })
    }

    async getState(): Promise<rSchedulerApiResult|null> {
        const res = await utils.callServer( `/cmd/schedule` , "schedule.getState" )

        if (res.error) return null;
        const rsch = res.result as rSchedulerApiResult;
        return rsch;
    }

    async deleteSchedule(ID: string) {
        const toDelete:rSchedulerApiRequest = {IdList:[ID]}
        if(this.State.Entry2Edit !== null && this.State.Entry2Edit.Id==ID) {
            this.State.Entry2Edit = null;
        } 
        if(this.State.EditNewEntry === false) {
            const val = JSON.stringify(toDelete)
            const res = await utils.callServer( `/cmd/schedule/delete?value=${val}` , "schedule.deleteSchedule" )

            const rsch = res.result as rSchedulerApiResult;
            this.State.Entries = this.makeEntries(rsch);
        }
        this.setEditEnrtyId();    }

        async updateSchedule() {
            if(this.State.Entry2Edit !== null) {
                const se:rScheduleEntry = {...this.State.Entry2Edit}
                for (let nm of ["StartDate","StartTime","Changed","Running"])
                    delete(se[nm]);    

                let toUpdate:rSchedulerApiRequest = {SchedulerCfg:{Entries:[se]}}
                const val = JSON.stringify(toUpdate);
                const res = await utils.callServer( `/cmd/schedule/update?value=${val}` , "schedule.updateSchedule" )
    
                const rsch = res.result as rSchedulerApiResult;
                this.State.Entries = this.makeEntries(rsch);
                this.State.Entry2Edit = null;
                this.State.EditNewEntry = false;
                if (this.taskPropsHidden !== null) {
                    this.State.TaskProps = this.taskPropsHidden;
                    this.taskPropsHidden = null;
                }
            }
        }
    
    

    async addSchedule(camID: string) {
        let presetId = "";
        const presets = Object.keys(this.State.Presets[camID]);
        if(presets.length > 0)
            presetId = presets[0];
        const entry = {
            Id: utils.createUUID(),
            Start: Math.floor(Date.now()/1000),
            Duration: 0,
            Period: 0,
            Name: "new_schedule",
            Camera: camID,
            FileTemplate: "",
            Camera_PresetID: presetId,
            Allowed: true
        }
        this.State.Entry2Edit = this.makeScheduleMapEntry(entry);
        this.State.EditNewEntry = true;
        this.State.EditEntryId = entry.Id;
    }

    async switchScheduler(enabled:boolean) {
        let toUpdate:rSchedulerApiRequest = { SchedulerCfg:{Enabled:!enabled} }
        const val = JSON.stringify(toUpdate)
        const res = await utils.callServer( `/cmd/schedule/update?value=${val}` , "schedule.switchScheduler" )

        const rsch = res.result as rSchedulerApiResult;
        this.State.Enabled = rsch.SchedulerCfg?.Enabled;
    }

    toggleAllowed() {
        if(this.State.Entry2Edit !== undefined) {
            let e = {...this.State.Entry2Edit}
            e.Allowed = !e.Allowed;
            e.Changed = true;
            this.State.Entry2Edit = e;
        }
    }

    async setCamera(camId: string) {
        if(this.State.Entry2Edit !== undefined) {
            let e = {...this.State.Entry2Edit}
            e.Camera = camId;
            e.Changed = true;
            this.State.Entry2Edit = e;
            //update presets for new camera
            const p = await this.getPresets(camId)
            if(p != null) this.State.Presets[camId] = p
        }
    }

    setPreset(presetId: string) {
        if(this.State.Entry2Edit !== undefined) {
            let e = {...this.State.Entry2Edit}
            e.Camera_PresetID = presetId;
            e.Changed = true;
            this.State.Entry2Edit = e;
        }
    }

    setDuration(dur: number) {
        if(this.State.Entry2Edit !== undefined) {
            let e = {...this.State.Entry2Edit}
            e.Duration = dur;
            e.Changed = true;
            this.State.Entry2Edit = e;
        }
    }

    setPeriod(per: number) {
        if(this.State.Entry2Edit !== undefined) {
            let e = {...this.State.Entry2Edit}
            e.Period = per;
            e.Changed = true;
            this.State.Entry2Edit = e;
        }
    }

    setName(name: string) {
        if(this.State.Entry2Edit !== undefined) {
            let e = {...this.State.Entry2Edit}
            e.Name = name;
            e.Changed = true;
            this.State.Entry2Edit = e;
        }
    }

    setFile(file: string) {
        if(this.State.Entry2Edit !== undefined) {
            let e = {...this.State.Entry2Edit}
            e.FileTemplate = file;
            e.Changed = true;
            this.State.Entry2Edit = e;
        }
    }

    private makeStart = (dateStr:string, timeStr:string): number => {
        //const offt = new Date().getTimezoneOffset() * 60; //timezone offset in seconds
        //Date.Parse considers argument as local datetime, however https://developer.mozilla.org/ru/docs/Web/JavaScript/Reference/Global_Objects/Date/parse says it should consider as UTC 
        const startDT = Date.parse(dateStr+"T"+timeStr);
        return Math.floor(startDT/1000)//+offt;
    }

    setStart(value:string, part:string) {
        if(this.State.Entry2Edit !== undefined) {
            let e = {...this.State.Entry2Edit}
            if(part === "d") {
                e.StartDate = value;
            } else if (part === "t") {
                e.StartTime = value;
            }
            e.Start = this.makeStart(e.StartDate, e.StartTime);
            e.Changed = true;
            this.State.Entry2Edit = e;
        }
    }

    private getRecordFilesFromLog(log: string) {
        const lines = log.split("\n");
        const ret:string[] = []
        for(let l of lines) {
            if(l.length > 2) {
                if (l.startsWith(",")) {
                    l = l.substring(1, l.length);
                }
                if (l.endsWith(",")) {
                    l = l.substring(0, l.length-1);
                }
                try {
                    const tll = JSON.parse(l);
                    if(tll.w==="completed" && tll.f.length > 0) {
                        const fpp = tll.f.split("\\")
                        ret.push(fpp[fpp.length-1]);
                    }
                }
                catch (e) {
                    ret.push("Ошибка получения имени файла записи");
                }
            }
        }
        return ret;
    }

    async getTaskLogAndRecords() {
        const promise1 = fetch(this.State.TaskProps.ApiPath_LogFile).catch((e) => Error(e));
        const promise2 = fetch(this.State.TaskProps.ApiPath_LogJsonFile).catch((e) => Error(e));
        const r1 = await promise1;
        const r2 = await promise2;
        const text = await utils.getRawData(r1, "schedule.getTaskLog");
        const files = await utils.getRawData(r2, "schedule.getTaskFiles");
        this.State.TaskLog = text;
        this.State.RecordFiles = this.getRecordFilesFromLog(files);
    }

    async toggleSchedProps(ID?:string) {
        if(this.State.TaskProps === null && ID !== undefined) {
            const ids:rSchedulerApiRequest = {IdList:[ID]};
            const val = JSON.stringify(ids);
            const res = await utils.callServer( `/cmd/schedule/state?value=${val}` , "schedule.getTaskState" )

            if (res.error) {
                this.State.TaskProps = null;
            } else {
                const rsch = res.result as rSchedulerApiResult;
                this.State.TaskProps = rsch.SchedulerState.tasks[ID];
                this.getTaskLogAndRecords();
            }
        } else {
            this.State.TaskProps = null;
        }
    }

    toggleSchedEdit(ID?:string) {
        if(ID !== undefined) {
            if(this.State.Entry2Edit === null) {
                this.State.Entry2Edit = {...this.State.Entries[ID]};
            }
            if (this.State.TaskProps !== null) {
                this.taskPropsHidden = this.State.TaskProps;
                this.State.TaskProps = null;
            }
        }
        else {
            if(this.State.Entry2Edit !== null) {
                this.State.Entry2Edit = null;
                if(this.State.EditNewEntry) 
                    this.setEditEnrtyId();
                this.State.EditNewEntry = false;
            }
            if (this.taskPropsHidden !== null) {
                this.State.TaskProps = this.taskPropsHidden;
                this.taskPropsHidden = null;
            }
        }
    }

    async startStopTask(ID:string) {
        const ids:rSchedulerApiRequest = {IdList:[ID]};
        const val = JSON.stringify(ids);
        let url = `/cmd/schedule/stop?value=${val}`
        if(this.State.TaskProps.state==="notrun") {
            url = `/cmd/schedule/start?value=${val}`
        }
        const res = await utils.callServer( url , "schedule.startStopTask" )

        if (res.error) {
            this.State.TaskProps = null; //TODO: change it to error display
        } else {
            const rsch = res.result as rSchedulerApiResult;
            this.State.TaskProps = rsch.SchedulerState.tasks[ID];
            const r = await fetch(this.State.TaskProps.ApiPath_LogFile).catch((e) => Error(e));
            const text = await utils.getRawData(r, "schedule.getTaskLog");
            this.State.TaskLog = text;
        }
    }

    async getCameras(): Promise<rCameraState[]> {
        const res = await utils.callServer( "/cmd/cam/cameras" , "schedule.getCameras" )

        if (res.error) return [];
        return res.result as rCameraState[];
    }

    async getPresets(cameraId:string): Promise<model.Presets | null> {
        const res = await utils.callServer( `/cmd/cam/preset/get?id=${cameraId}` , "schedule.getPresets" )

        if (res.error) return null;
        return res.result as model.Presets;
    }

    selectEntry(ID:string) {
        this.State.EditEntryId = ID;
    }

    enter() {}
    exit() {}
}