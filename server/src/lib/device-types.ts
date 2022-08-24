// Модуль device-types.ts содержит:
// Описание базовых типов устройств (cDeviceInfo,cDeviceStorage)
// Функции обратного вызова сервисов сервера (iServerIntegrate)
// Классы нотификационных сообщений для подписчиков (NotifyRecord) и управление подписчиками(NotifyController)
// Подписка - это обратная связь для клиента по протоколу http long-polling

import { privateDecrypt } from "crypto";
import path from "path";
import { eventNames } from "process";
import { isApiError } from "./api_base";
import {  getUnixTime , AnyCopyTo } from "./utils";
import { cTimer , wait, Event  } from "./sync";
import { log, error } from "./log";
import { APIResult , iPositionLimits , tDiagnosticMessages } from "./api_interfaces";


//export const mainDir = path.dirname(process.argv[1]);
export interface iPositionAllLimits { Degree:iPositionLimits , Param:iPositionLimits }
export interface iPositionXY { x:number , y:number}
export const keys_iPositionXY:(keyof iPositionXY)[]=['x','y'];


//TODO:
//export interface rFullPositionLimits{    Degree:iPositionLimits , Param:iPositionLimits }

export interface rCameraDeviceParams{
        //AnglePerPos?: number[] 
        //PosLimits?:{ x:number[] , y:number[] }
        PosLimits?: iPositionAllLimits ,
        ZoomLimits?: { 
            TheSize:number[] , 
            Param:number[],
            Param2SizeApproximation?:{ Polynom?:number[] }
         },
        ViewingAngle?: iPositionXY,
}
export interface rCameraDeviceInfo{
    IgnoreAnswersIO?: boolean; 
    notSupportParams?: string[];
    Optics?:rCameraDeviceParams;
};
//rCameraDeviceInfo:

export function getDiagnosticMessages( d:tDiagnosticMessages ):tDiagnosticMessages|undefined{
    if ( Object.keys( d ).length) return d;   
}
export function getDiagnosticMessagesO( self:{DiagnosticMessages:tDiagnosticMessages} ):tDiagnosticMessages|undefined{
    return getDiagnosticMessages( self.DiagnosticMessages );
   //     if ( Object.keys( d ).length) return d;   
 //   }    
}

             
export type tCapSignalType=string;
export type tControlType=string;
export type cConfigControlType = {
    CapSignalType:tCapSignalType    , 
    CameraDeviceSetting?:rCameraDeviceInfo;
    SerialPortSetting?:string
}

export type mapControlTypes= { [key:string]:cConfigControlType }

export type device_id_type=string
export interface IDeviceInfo{
    ID?: number|device_id_type,
    ControlType: string,
    DisplayName: string,
    Description?: string,
    Pin_SwitchIn?:string
    Pin_SwitchOut?:string
    //SwitchInput?: string|number
}

export type eDeviceIOtype="I"|"O"|"IO";

function saveNoEmpty<T>( v:T|undefined , c:T ):T { return v?v:c;  }
export class cDeviceInfo{
    gID:string; // global (server context) device ID
    id_aliases:string[]=[];
    io:eDeviceIOtype;
    info:IDeviceInfo;
    private cfg_:any;
    private control_?:any;
    toJSON(){ return { gID:this.gID , io:this.io , info:this.info , id_aliases:this.id_aliases } };
    constructor ( io:eDeviceIOtype, gID:string, info:IDeviceInfo, control?:any){
        this.io= io;
        this.gID = gID;
        this.info = info;
        if (control) this.control_ = control
    }
    getDisplayNames():string[] {
        return [ 
            saveNoEmpty(this.info.DisplayName,"")
            ,saveNoEmpty(this.info.Description,"")
        ];
    }
    setDisplayNames( nms: [string,string]|string[] ){
        if (nms[0]) this.info.DisplayName=nms[0];
        if (nms[1]) this.info.Description=nms[1];
    }
    getControlType():string {
        let t=this.info.ControlType;
        return t? t :"default";
    }     
} 
export type mapcDeviceInfo= { [key:string]:cDeviceInfo };

export var ControlTypes : mapControlTypes={}
export function SetControltypes( ct :mapControlTypes) { ControlTypes=ct;}
export class cDeviceStorage{
    devices : cDeviceInfo[]=[];
    //mapSwitchInput: { [key:string]:cDeviceInfo } = {};
    private map_device: { [key:string]:cDeviceInfo } = {};
    mct:mapControlTypes=ControlTypes;
    //constructor () { }
    addnewdevice( di : cDeviceInfo ):cDeviceInfo{
        var ia = [di.gID].concat(di.id_aliases);
        var already = ia.filter( value=>{ return Boolean(this.map_device[value]) });
        if ( already.length ) 
            throw `Device ${di.gID} has not unique alias: ${already.join(',')}`;
        for (var a of ia) 
            this.map_device[a] = di;
        this.devices.push(di);    
        return di;
        //Reflect.
    }
    getdevice( key:string ):cDeviceInfo{
        return this.map_device[key];
    }
} 

export interface iFilePath{ fspath:string , apipath:string }

export interface iServerIntegrate {
    callMediaServer( url:string ):Promise<APIResult>;
    VideoCaptureForDevice( device_id:device_id_type ):Promise<APIResult>;
    WhoCapturedNow():Promise<device_id_type|undefined>
    TestSignalIsActive( pinin:string ):boolean;
    MakeDataFilePath(fn:string):string;
    GetPanoramaPath( Id?:string ):iFilePath;
    do_notify( nc: NotifyComponent  ):any;
    //lock_NotyifyChange(v:-1|1):any;
    //async start_capturetask( to:ssched.cTaskOperation ):Promise<ssched.cTaskOperation>{
    //async stop_capturetask( to:ssched.cTaskOperation , fr:Promise<ssched.cTaskOperation> ):Promise<ssched.cTaskOperation>{
}
export var serverCB:iServerIntegrate;
export function setServerCB( cb : iServerIntegrate){
    serverCB = cb;
}



export class ControlFactory<ControlT,ConfigT> {
    private tab:{ [key: string]: new (cfg: ConfigT) => ControlT } = {};

    public register(name: string, constr: new (cfg: ConfigT) => ControlT ) {
        this.tab[name] = constr;
    }

    public make(name: string, cfg: ConfigT ): ControlT {
        const t=this.tab[name]
        if (!t) throw Error(`Unregistred type:"${name}"`)
        return new t(cfg);
    }
}

interface aNotifyArray{ [key:string]:number }
export function Array2NotifyArray(...nms:string[]):aNotifyArray{
    let r:aNotifyArray={};
    nms.forEach( v=>r[v]=1 );
    return r;
}

export interface NotifyComponent{
        capture?:number
        capturefiles?:number
        camera?:aNotifyArray
        switch?:number
        schedule?:number
}
type eDevNotifyTypes="change"|"closesocket"|"timeout";
class  NotifyRecord{
    ownerID:string=""
    remoteAddress=""
    curr_tm:number=-1
    last_tm:number=-1;
    notifySigns?:NotifyComponent;
    event:Event  = new Event()
    countuse:number=0
    lastuseTime:number=0;
    constructor ( own:string ){ this.ownerID= own; this.fixtime();}
    fixtime() { this.lastuseTime = getUnixTime(); }
    on_AnyEvent( sign:eDevNotifyTypes ){
        this.event.signal( sign )
    }
    ownerInfo():string {
        return `${this.ownerID} ${this.remoteAddress}`;
    }

    async Wait():Promise<[eDevNotifyTypes, NotifyComponent|undefined]>{ 
        let retf=( s:eDevNotifyTypes ):[eDevNotifyTypes,NotifyComponent|undefined]=>{
            let ns=this.notifySigns;
            if (s=="change") this.notifySigns=undefined; 
            return [s, ns]
        }
        this.fixtime();
        if (this.notifySigns) return retf("change")
        this.countuse++; 
        let r=await this.event.wait(); 
        this.fixtime();
        this.countuse--; 
        return retf(r)
    }
    do_notify( nc: NotifyComponent  ){
        this.notifySigns = AnyCopyTo( this.notifySigns , nc )
        //this.notifySigns = nc; //TODO:
        if (this.notifySigns)
            this.on_AnyEvent("change")
    }
}
export class NotifyController{
    delayForNotify=50 //ms
    delayForChecksubscriber=1000*60//5*60; ms
    SubscriberTimeOut=5*60; //sec
    timer=new cTimer( )
    private mp:{ [key:string]:NotifyRecord }={}

    constructor (){
        this.timer.Start( this.CheckSubscriber.bind(this) , this.delayForChecksubscriber)
    }

    CheckSubscriber(){
       let va=  Object.values(this.mp)
       let ctm = getUnixTime()-this.SubscriberTimeOut;
       for (let nc of va)
        if (!nc.countuse && nc.lastuseTime < ctm) { 
            delete this.mp[nc.ownerID]
            log("Unlink notify Subscriber:",nc.ownerInfo())
       }
    }
    private do_notify_l(  ){
        let nc= this.cashNC; if (!nc) return;
        this.cashNC=undefined;
        for (let own in this.mp ) {
            this.mp[own].do_notify(nc);
        }
    }
    getownrec( own:string):[NotifyRecord,string] {
        let status="";
        let r= this.mp[own];
        if (!r) { status="new"; r=this.mp[own] = new NotifyRecord( own ) }
        return [r,status];
    }
    private counter_lock_NotyifyChange=0;
    lock_NotyifyChange( v:-1|1 ){
        return; // оставляем только задержку
        this.counter_lock_NotyifyChange+=v;
        if (this.counter_lock_NotyifyChange==0) {
            this.do_notify()
        }
    }
    private cashNC?: NotifyComponent
    private delayNotfy?:Promise<any>;
    do_notify( nc?: NotifyComponent  ){
        if (nc) { 
            if (serverCB) serverCB.do_notify(nc);
            this.cashNC = AnyCopyTo( this.cashNC , nc )
        }    
        if (!this.counter_lock_NotyifyChange && this.cashNC) {
            let w = wait(this.delayForNotify)
            w.then( ()=>{ this.delayNotfy=undefined; this.do_notify_l() } )
            this.delayNotfy=w;
            //this.do_notify_l();
        }    
    }    

}

export const notify_Controller= new NotifyController();

export function lock_NotyifyChange( v:-1|1  ){
    notify_Controller.lock_NotyifyChange(v)
}
export function do_notify( nc: NotifyComponent  ){
    notify_Controller.do_notify(nc)
}