import {tDiagnosticMessages,iPositionLimits,
    PresetInfo} from "./api_interfaces"


export interface rCameraSoftPreset extends PresetInfo {
    //ID: string;
    //Name: string;

    softData?:rCameraData;
}

export interface rCameraSoftPresetsList {  [id: string]: rCameraSoftPreset; }


export interface iCameraData_INFO{
    MaxSpeed?:{ pan:number, tilt:number };
    UserTagId?:string,
    Version?:string,
}  
interface iCameraData_Human{
    ZoomPos_h?:number,          // коэф. увеличения >=1
    PanTiltPos_h?:number[],     // углы поворота
    PanTiltPos_Pano?:number[], // позиция камеры в панораме
    //TODO: [number, number],
}    

export interface iCameraData_POS{
    ZoomPos?:number,
    FocusPos?:number,
    FocusAuto?:boolean,
    PanTiltPos?:number[], //TODO: [number, number],
    
    CurrentPreset?:number,
}  

export interface iCameraData_PosExt  extends iCameraData_POS,iCameraData_Human {}

interface iCameraData_LensControlSystem {
    DZoomMode? : number; // 0-combine,1-separate  = buf[13] >> 5;
    DZoomOn? :boolean; //
    AFMode? : number ; // 0-normal,1-separate,2-zoom trigger
    Executing_Memrecall?:boolean;
    Executing_Focus?:boolean;
    Executing_Zoom?:boolean;
}
interface iCameraData_ControlSystem {
    AEMode?:number;
    BackLigthOn? :boolean; 
    WBMode? :number;    
    ApertureGain? :number;    
    RGain? :number;    
    BGain? :number;    
    SlowShutterAuto? :boolean;
    ShutterPos? :number;
    IrisPos? :number;
    GainPos? :number;
    BrightPos? :number;
    ExposureMode? :number[];
    ExposureCompensOn? :boolean;
    ExposureCompensPos? :number;
}

export interface iCameraData_Data extends iCameraData_INFO,iCameraData_POS,
    iCameraData_LensControlSystem, iCameraData_ControlSystem { };

export interface iCameraData_Ext {
        Speed_OP?:number[]
        CameraID?:string;
        SelfID?:string;
        warning?:string;
        error?:string;
        //[k : keyof iCameraData_Data ]:any;
}

    
export interface rCameraData extends iCameraData_Data , iCameraData_Ext , iCameraData_Human {    }    
    

export interface rCameraSpeedInfo {
    readonly speedRange?:[number, number]; //[минимальная,максимальная] скорость поворота
    speed?:number; //текущая скорость поворота
}


export interface iCameraHumanLimits{ 
    PanTiltPos_h:iPositionLimits;
    ZoomPos_h: number[];
    //TODO: ZoomPos_h: [number, number]
}


// Этот интерфейс используется в проектах client|server
export interface rCameraState extends rCameraSpeedInfo {
    ID:string, 
    Name?:string , 
    ActiveCapture?:boolean, // filled by owner
    Controlled?:boolean,
    Pin_SwitchIn?:string;
    //readonly speedRange?:number[],
    //readonly speedRange?:[number, number],
    //speed?:number,
    port?:string,
    readAnswers?:boolean,
    current_preset?:string;
    PanoramaApiPath?:string;
    readonly DiagnosticMessages?:tDiagnosticMessages;
    error?:string;
    //readonly camdata?:iCameraData_Data,
    readonly camdata?:rCameraData,
    
    Limits?:iCameraHumanLimits,
    Presets?:rCameraSoftPresetsList,
    
}

export type tTruncateValue = 0 | 1 | -1;

export interface rImageTruncateData {
    PanTiltPos?: [tTruncateValue, tTruncateValue]
    ZoomPos?: tTruncateValue;
}



export interface resCameraOperation{
    // Возвращается сервером в поле APiResult.result после каждой команды для камеры
    //shiftpos?:{ truncate?:number[]; settoXY:number[];  }
    //shiftzoom?:{}
    operation?:any
    prevData?:rCameraData
    postData?:rCameraData
    truncate?:rImageTruncateData
    result?:string
    error?:string
    state?:rCameraState;
}
