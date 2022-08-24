// Модуль switch.ts содержит:
// Общий интерфейс работы с видеокоммутатором. Рассчитан на широкий класс видеокоммутаторов.
// Функции реализованные без учета специфики протоколов управления видеокоммутатором
import http from "http";
import url from "url";
import * as mgen from "./device-types";
import * as api_base from "./api_base";
import { APIResult , rSwitchState , SwitchNamingTable, cSwitchPinDesc_Text , SwitchNamingIOPins  } from "./api_interfaces";


export type t_display_pin = number;
export type t_signal_pin = number;

/*
type iSwCnctTable = {[key in number]: number};
export type rSwitchState = {
    Audio: iSwCnctTable;
    Video: iSwCnctTable;
    //VideoOutMap:number[];
    ActiveInputs:number[];
    ActiveOutputs:number[];
    //Inputs?: tConnectState[];
    //Outputs?: tConnectState[];
    DeviceInfo:string;
    AFV: boolean;
    internal?:any;
    DiagnosticMessages?:tDiagnosticMessages;
    Controlled:boolean;   
    port:string; 
}
*/
export type tConnectState={
    Active:number; NameID:string; Desc:string;
}

export type SwitchID = string;


export type cSwitchPinDesc_DeviceRef={
    print?:[string, string],
    Device?:string;
    ControlType?:string;
}

export interface SwitchDeviceTable {   [key: string]: cSwitchPinDesc_DeviceRef|cSwitchPinDesc_Text };
type cIOSetting={
    MapDevices:SwitchDeviceTable,
    ViewOrder:(string|number)[],
    ViewNames:SwitchNamingTable
}

export type SwitchControlConfig = {
    ControlType: string;
    Ignore: boolean;
    SerialPortFileName:string;
    CountIO: { in:number,out:number },
    Patterns:{
        range:number[],
        ControlType:string
        print:string[];
    },

    DebugOutput?: boolean;

    InputSetting:cIOSetting;
    OutPutSetting:cIOSetting;


    //MapInputDevices:SwitchDeviceTable;
    //MapOutputDevices:SwitchDeviceTable;

    //InputNames: SwitchNamingTable;
    //OutputNames: SwitchNamingTable;
}


export interface ControlI {
    command(cmd: string): Promise<object>,
    connect(input: SwitchID, outputs: SwitchID[]): Promise<object>,
    Display2Signal( display_pin:t_display_pin ):t_signal_pin|undefined;
    getState( force?:any ): Promise<rSwitchState>
    close(): void;
    afv(set: boolean): Promise<void>;
    createPreset(name: string): Promise<object>;
    removePreset(ID: number): void;
    getPresets(): Promise<object>;
    setPreset(ID: number): Promise<object>;
    async_initialize():Promise<any>;
    GetSavedState(): rSwitchState;
};

export const Switch_Factory=new mgen.ControlFactory<ControlI,SwitchControlConfig>()



type cbSwitchState = (  swtch:SwitchAPI, state: rSwitchState ) => Promise<any>;
type cDeviceInfo = mgen.cDeviceInfo;


export class SwitchAPI {
    public switch?: ControlI ;
    private cfg: SwitchControlConfig;
    //f_stateupdate:cbSwitchState;
    SignalDeviceMap : mgen.mapcDeviceInfo={};
    DisplayDeviceMap : mgen.mapcDeviceInfo={};
    //private patternDeviceInfo : cDeviceInfo;
    private patternDevices:cDeviceInfo[]=[];

    //property 
    //public get value() : string {       return ""'   }
    // getp: mgen.cDeviceInfo ()=>  {}

    constructor(cfg: SwitchControlConfig ) {
        const ccfg = cfg;
        this.cfg = ccfg;
        if (!cfg) return;
        //for (let  )     
        //this.replace_PatternMark();
        if (ccfg.Ignore) return;
        this.switch = Switch_Factory.make(ccfg.ControlType, ccfg);
        
    }

    patternId2Pin(pid:number) :number{ return pid-1+ this.cfg.Patterns.range[0]  }
    parsePaternId( key:string):number|undefined{
        let re= /Pattern-(\d+)|(\d+)/;
        let m= key.match(re); if (!m) throw `Invalid key in json settings this.cfg.InputNames[${key}]`;
        if (m[1]) return Number(m[1]);
    }

    private replace_PatternMark( ){
        /*
        let aentr = Object.entries(this.cfg.InputNames)
        for ( let e of aentr ) { let key=e[0];
            let pid = this.parsePaternId( key );
            if (!pid) continue;
            let newkey = String(this.patternId2Pin(pid));
            this.cfg.InputNames[ newkey ] = e[1];
            delete this.cfg.InputNames[key];
        }*/
    }
    SignalPin2Device( PinIn:number|string ):cDeviceInfo|undefined{
        if ( !PinIn ) return;
        let r= this.SignalDeviceMap[String(PinIn)];
        if (r) return r;
        let n = Number(PinIn);
        if ( n> this.cfg.CountIO.in ) return this.getPatternDeviceInfo(n);
    }
    getPatternsCount():number{
        let r=this.cfg.Patterns.range; return r[1]-r[0]-1;
    }
    getPatternDeviceInfo( pinNum:string|number ):cDeviceInfo{
        let r=this.cfg.Patterns.range;
        let patn = ( Number( pinNum ) - r[0]) % this.getPatternsCount() ;
        return this.patternDevices[patn];
    }

    registerDefaultDevice( devst : mgen.cDeviceStorage ){
        if (!this.cfg) return;
        let r=this.cfg.Patterns.range;
        let ptext = this.cfg.Patterns.print;
        for ( let pn=0;pn<this.getPatternsCount();pn++) {
            let pid= pn+1;
            let pinfo = { ID:"" ,DisplayName:`${ptext[0]} ${pid}`, Description:`${ptext[1]} ${pid}`
                , Pin_SwitchIn:String((pn+r[0]))
                , ControlType: this.cfg.Patterns.ControlType  }; 
            let di = new mgen.cDeviceInfo('I', `Pattern/${pid}`,pinfo,undefined )
            devst.addnewdevice( di );
            this.patternDevices[pn] = di;
        }
    }


    parse_pin2device( io:'I'|'O' , devst : mgen.cDeviceStorage )  {
        if (!this.cfg) return;
        var swcfg = io=='I'? this.cfg.InputSetting : this.cfg.OutPutSetting ;
        var swmap = io=='I'? this.SignalDeviceMap : this.DisplayDeviceMap;
        const countio = this.cfg.CountIO[io=='I'?"in":"out"]; 

        for (var pinn=1;pinn<=countio;pinn++) { let pin= String(pinn);
            //if (swcfg.MapDevices[String(pin)]) continue;
            di=devst.addnewdevice( new mgen.cDeviceInfo(io,`UnkOnPin/${io}/${pin}` , { ControlType:"default" , DisplayName:""}  ) );
            di.info.DisplayName =`${(io=='I' ?"Вход":"Выход")} №${pin}`;
            di.info[io=='I'? "Pin_SwitchIn":"Pin_SwitchOut"]=pin;
            swmap[ pin ] = di;
        }
        //console.log("swmap:", swmap );
        for (var pin in swcfg.MapDevices ){
            if (!pin.match(/^\d+/)) throw `Config.Switch${io}: invalid pin ${pin}`;
            if (Number(pin) > countio )  throw `Config.Switch${io}: invalid pin number ${pin}`;
            const dc = swcfg.MapDevices[pin];
            var di:mgen.cDeviceInfo;
           // console.log("handle MapDevices:", pin , dc );
             if (!Array.isArray( dc) ) {
                if (dc.Device) {
                    di=devst.getdevice(dc.Device);
                    if (!di) throw `Config:Invalid device ID ${dc.Device}`
                }else if (dc.ControlType) {
                    di=devst.addnewdevice( new mgen.cDeviceInfo(io,`CTypeOnPin/${io}/${pin}` , { ControlType:dc.ControlType , DisplayName:""} , null  ) );
                }else throw `Config:Invalid device reference on switch.pin ${pin}`

                if (dc.print) di.setDisplayNames( dc.print );

            } else {
                di = swmap[ pin ];
                di.setDisplayNames( dc );
            }
            di.info[io=='I'? "Pin_SwitchIn":"Pin_SwitchOut"]=pin;
            swmap[ pin ] = di;
        }
        let a_t : SwitchNamingTable= {}
        for (let pid of swcfg.ViewOrder) {
            di = swmap[ String(pid) ];
            if (!di) {
                let patternid = this.parsePaternId( String(pid) );
                if (patternid) {
                    if (io!='I') throw "Config: Pattern in output swicth devices! "+pid;
                    di = this.patternDevices[patternid-1];
                    pid = String(di.info.Pin_SwitchIn);
            }}
            if (!di) throw `Config.ViewOrder: Invalid pin ${pid}`;
            a_t[pid] = di.getDisplayNames() as cSwitchPinDesc_Text;
        }
        swcfg.ViewNames  = a_t;
    }


    public async command(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        if (this.switch) {
            const result = await this.switch.command(query.query["cmd"] as string);
            return { result };
        }

        return { error: "switch was not initialized" }
    }
    
    public async connect(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        if (this.switch) {
            if (!("input" in query.query) || !("outputs" in query.query)) {
                return { error: "Invalid parametrs. Need 'input' & 'outputs'" }        
            }
            const input = query.query["input"] as string;
            const outs = (query.query["outputs"] as string).split(",");
            const result = await this.switch.connect(input, outs);
            return { result };
        }

        return { error: "switch was not initialized" }
    }

    public async reqGetNamesIOPins(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        const res: SwitchNamingIOPins ={
            InputNames: this.cfg.InputSetting.ViewNames, // this.cfg.InputNames,
            OutputNames: this.cfg.OutPutSetting.ViewNames
        }
        return  { result: res }
    }

    async getState( force?:string ):Promise<rSwitchState|undefined> {
        return await this.switch?.getState( force )
    }
    public async reqGetState (req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        if (this.switch) {
            const res = {
                result: await this.switch.getState(query.query["force"] as string)
            }
            //log("SWITCH STATE:", JSON.stringify(res));
            return res;
        }

        return { error: "switch was not initialized" }
    }

    public async afv (req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        if (this.switch) {
            const mode = query.query["mode"] as string;
            return {
                result: await this.switch.afv(mode === "follow")
            }
        }

        return { error: "switch was not initialized" }
    }

    public async getPresets(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        const result = await this.switch?.getPresets();
        return { result };
    }

    public async addPreset(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        const name = decodeURIComponent(query.query["name"] as string);
        const result = await this.switch?.createPreset(name);
        return { result };
    }

    public async removePreset(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        const preset = parseInt(query.query["preset"] as string);
        this.switch?.removePreset(preset);
        return { result: null };
    }

    public async setPreset(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        const preset = parseInt(query.query["preset"] as string);
        this.switch?.setPreset(preset);
        return { result: null };
    }
}
