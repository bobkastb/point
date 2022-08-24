import {unixtime} from "./api_interfaces";

export enum eTaskState { NotRun="notrun",Running="Running", PendingStart="PendingStart",PendingEnd="PendingEnd" }

export interface rScheduleTaskState {
    state:eTaskState//string, // "run"|"notrun" - выполняется ли в данный момент запись
    last_starttime: unixtime,
    curr_duration: unixtime,
    curr_file: string, // current capture file name
    next_starttime: unixtime,
    cnt_calls: number,
    cnt_errcalls: number,
    Id: string,
    ApiPath_LogFile: string, // путь к файлу лога задачи 
    ApiPath_LogJsonFile: string, // путь к json-файлу лога задачи 
}

export interface rSchedulerServiceState {
    isExecute: boolean,
    AllowedMultipleOperations: boolean,
    tasks: {[key:string]: rScheduleTaskState}
}


export interface rScheduleEntry {
    Id: string,
    Start: unixtime;
    Duration: unixtime;
    Period: unixtime;
    Name: string;
    Camera: string;
    Camera_PresetID?:string;
    FileTemplate: string;
    Allowed: boolean;
};

export interface rSchedulerConfigUpdate    {
	Enabled? : boolean;
    PeriodResolution?: unixtime;
    TaskHistoryFormat?:string;
    EmulateTask?:boolean;
    Entries?: rScheduleEntry[]; 
}
export interface rSchedulerConfig extends rSchedulerConfigUpdate  {
	Enabled : boolean;
    PeriodResolution: unixtime;
    Entries: rScheduleEntry[]; 
    //TaskHistoryFormat?:string;
    //EmulateTask?:boolean;
    //Entries: rScheduleEntry[]; 
}


//  Requests: polling , /cmd/schedule/state|start|stop|...|update|delete

export interface rSchedulerApiResult  {
        // field SchedulerCfg - only for Requests: /cmd/schedule(...|delete|update) 
    SchedulerCfg?:rSchedulerConfig;
    SchedulerState : rSchedulerServiceState //any;
}   

export interface rSchedulerApiRequest {
    //SchedulerCfg?:{ Entries: rScheduleEntry[] };
    SchedulerCfg?:rSchedulerConfigUpdate;
    IdList? : string[];
}

/*
export interface rSchedulerApiRequest  {
    SchedulerCfg?:rSchedulerConfigUpdate;
    IdList? : string[];

}*/

export interface cSchedulerStoreData  {
    Scheduler?:rSchedulerConfig;
}
