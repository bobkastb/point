
export type unixtime = number; // unix time in second!!!
export type unixtimeMS= number; // unix time in milisecond!!!

export interface iPositionLimits{ 
    x:number[]; 
    y:number[];
    //TODO: [number, number]
}
export type PresetIdType = string;

export interface PresetInfo {
    //ID: number;
    ID: PresetIdType;
    Name: string;
};


export interface APIResult  {
    servertime? : unixtime
    result?: any,
    error?: string;
    errordiff?:any;
    opt_readable?: boolean;
}

export interface iFileWriteState {
    process:boolean
    pause?:boolean
    binstate?:"run"|"pause"|"stop"
}

export interface cVideoSignalType {
    CmdLineOpts: string,
    Id: string 
};

export interface iVideoCaptureState {
    filewritestate:iFileWriteState
    activeSourceCapture:boolean
    videofiles?:string[]
    videosignaltype:cVideoSignalType
}

export function api_Error( err:string ):APIResult {
    return { error: err };
}
export function api_Result( res:any ):APIResult {
    return { result:res };
}

export interface tDiagnosticMessages{
    IdError?:string[];
    IdSet?:string[];
    SerialError?:string;
    InitError?:string;
}

// rProgramOptions - возвращается сервером и обрабатывается клиентом при сохранении/загрузке настроек
export interface rProgramOptions {
    SaveVideoPath: string;
    Themes: string[];
    DefaultTheme: string;
    PathSep: string;

    // Слеждующие опции не обрабатываются на сервере (проскакивают), просто сохраняются в БД 
    // Эти опции обрабатываются только на клиенте
    DefaultPage: string;
    ShowSideBar: boolean;
    CameraIndicationVisible: boolean;
    PanoramaVisible: boolean;
}

export type iSwCnctTable = {[key in number]: number};
// rSwitchState - возвращается сервером и обрабатывается клиентом при запросах к видеокоммутатору
export interface rSwitchState  {
    Audio: iSwCnctTable;
    Video: iSwCnctTable;
    ActiveInputs:number[];
    ActiveOutputs:number[];
    DeviceInfo:string;
    AFV: boolean;
    internal?:any;
    DiagnosticMessages?:tDiagnosticMessages;
    Controlled:boolean;   
    port:string; 
}
export type cSwitchPinDesc_Text=[string, string];
export interface SwitchNamingTable {   [key: string]: cSwitchPinDesc_Text; };

// SwitchNamingIOPins возвращается по запросу /cmd/switch/names
export interface SwitchNamingIOPins {
    InputNames: SwitchNamingTable;
    OutputNames: SwitchNamingTable;
}







