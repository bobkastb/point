// Модуль schedule.ts содержит:
// Интерфейсы для параметров клиенсткой части 
// Интерфейсы для работы с расписанием заданий

import * as cam from "../model/camera";
import {rCameraSoftPreset} from "@gen_lib/camera_interfaces";
import {rScheduleEntry,eTaskState} from "@gen_lib/schedule_interface";

//import {rCameraState} from "../model/camera";

export function nexttime2str( tm : number ) {
    return tm == 0 ? "Никогда" :  new Date( tm*1000 ).toLocaleString();
}


export type Presets = {[key:string]:rCameraSoftPreset}
export type CameraPresets= {[key:string]:Presets}




//export const TaskStates: {[key:string]:string} = {
export const TaskStates: {[key in eTaskState]:string} = {    
    "notrun":"ожидает",
    "Running":"идет запись", 
    "PendingStart":"запускается",
    "PendingEnd":"завершается"
}

export interface TaskLog {
    t:number,
    w:string,
    f:string
} 


// client internal records
export interface SchedEntry_Local extends rScheduleEntry {
    StartDate:string,
    StartTime: string,
    Changed: boolean;
    Running: boolean;
}

export type ScheduleMap = {[key:string]:SchedEntry_Local}
