// Модуль camera.ts содержит:
// Общий интерфейс работы с камерами рассчитанный на широкий класс камер.
// В модуле собраны функции, реализованные без учета специфики протоколов управления камерами

import http from "http";
import url from "url";
import path from "path";
import fs from "fs";
import * as preset from "./campresets";
import * as mgen from "./device-types";
//import * as api_base from "./api_base";
import * as menv from "./environment";
import * as mlog from "./log";
import {eErrorAction,hNoCopy} from "./utils"
import * as mutils from "./utils";
import * as msync from "./sync";

import {iPositionXY,ControlTypes,iServerIntegrate,rCameraDeviceParams}  from "./device-types";
import { fstat } from "fs";
import { prependListener } from "process";
//import { keys } from 'ts-transformer-keys';
import { APIResult , tDiagnosticMessages , iPositionLimits } from "./api_interfaces";
import { iCameraData_Data,iCameraData_POS , iCameraData_INFO , iCameraData_Ext 
    ,rCameraData ,  iCameraHumanLimits , rCameraState , resCameraOperation  } from "./camera_interfaces";


export interface rCamPosition {
    posFrom?:number[] // new rel pos 0..1
    posTo?:number[] // new rel pos 0..1
    zoomwheel?:number; // mouse abs wheel 
}    


/*
export interface ExtCameraInfo{ 
    ID:string, 
    Name:string , 
    ActiveCapture?:boolean,
    Controlled?:boolean,
    Pin_SwitchIn?:string,
    state?:rCameraState,
    //cfg?: CameraControlConfig 
}
*/

export interface ExtCameraInfo extends rCameraState{};




export type CameraControlConfig = {
    ControlType: string;
    ID: string;//number;
    Ignore: boolean;
    SerialPortFileName:string;
    DisplayName: string;
    Description? : string;
    //SwitchInput: string;
    CameraDriveSpeed: number;

    PanoramaFile?:mgen.iFilePath;
    Pin_SwitchIn: string;

    ReadAnswers?: boolean;
    DebugOutput?:boolean;
    //NamedStateSetDef:{ [key:string]:eCameraDataKeys[] }
}

// /cmd/cam/cameras": this.getListCameras.bin

export type mapCameraControlConfig = {[name in string]: CameraControlConfig};
//export type rCameraData={


export type eCameraDataKeys = keyof iCameraData_Data; 
export type eCgDP_key = (keyof iCameraData_Data | keyof typeof CamDataKeysPredefSets)


//type Named
function maketypedArr<Tp>( a : Tp[] ): Tp[] { return a} 
//function make
export function AsKeys<Tp>( a : (keyof Tp)[] ): (keyof Tp)[] { return a} 
function fill_CamDataKeysPredefSets() {
    let r={
        pos:AsKeys<iCameraData_POS>(["ZoomPos","FocusPos","PanTiltPos"]),
        base:AsKeys<iCameraData_Data>(["FocusPos","ZoomPos","PanTiltPos","UserTagId","MaxSpeed","CurrentPreset"]) ,
        info:AsKeys<iCameraData_INFO>(["UserTagId","MaxSpeed","Version"]),
        //info1:AsKeys<iCameraData_INFO>(["Version"]),
        LensControlSystem:AsKeys<iCameraData_Data>(["FocusPos","ZoomPos","DZoomMode","DZoomOn","AFMode","FocusAuto"]),
        CameraControlSystem:AsKeys<iCameraData_Data>(["AEMode","RGain","BGain","WBMode","ApertureGain","ExposureMode","BackLigthOn","ExposureCompensOn","SlowShutterAuto","ShutterPos","IrisPos","GainPos","BrightPos","ExposureCompensPos"]),
        all:AsKeys<iCameraData_Data>([]),
        //all: keys<rCameraData>(),
    }   
    r.all= mutils.convolutionarray(  ...(mutils.catarrays(...Object.values(r))) )
    return r;
}
export let CamDataKeysPredefSets=fill_CamDataKeysPredefSets();
let CamDataKeys_ExtPredefSet:(keyof iCameraData_Ext)[] = ["Speed_OP","CameraID","SelfID","warning","error"]; 
 

export let KeysAll_iCameraData=new Set<string>( mutils.catarrays(  ...Object.values(CamDataKeysPredefSets) ) );
let KeysAll_rCameraData=new Set<string>( mutils.catarrays( ...Object.values(CamDataKeysPredefSets) , CamDataKeys_ExtPredefSet )  );
export let KeysAll_iCameraDataExt=new Set<string>(  CamDataKeys_ExtPredefSet  );

 
export function rtCheck_Keys_rCameraData( v:string[] , ext:boolean ,onError : eErrorAction=eErrorAction.Continue ):string[]{
    let _fltr =ext ?  KeysAll_rCameraData : KeysAll_iCameraData;
    v = v.filter( value=> !_fltr.has( value as keyof rCameraData ) )
    if ( !v.length ) return v;
    switch (onError) {
        case eErrorAction.Throw: throw Error(`Invalid prop's. rCameraData has not this properties:${v}`); break;
        case eErrorAction.Warning: mlog.warning(`Invalid prop's. rCameraData has not this properties:${v}`); break;
    }    
    return v;
}

export type SetOf_Id_Hard = {id:string , expected_hardid: string, hardid?:string  }


export type options_gcd={ nobigQ?:boolean; ea?:eErrorAction }

export interface ControlI {
    close(): void;
    turnOn(): Promise<resCameraOperation>;
    turnOff(): Promise<resCameraOperation>;
    zoomStart(tele: boolean): Promise<resCameraOperation>;
    zoomStop(): Promise<resCameraOperation>;
    drive(dir: string, speed:string): Promise<resCameraOperation>;
    driveStop(): Promise<resCameraOperation>;
    setSpeed(val: number): rCameraState;
    setPosition( query:rCamPosition ): Promise<resCameraOperation>;
    setGlobalPosition( query:rCamPosition ): Promise<resCameraOperation>;
    presetHardSave(p: number): Promise<resCameraOperation>;
    presetRecall(p: number): Promise<resCameraOperation>;
    presetGet(): Promise<resCameraOperation>;

    getState(noupdate?:boolean): Promise<rCameraState>;
    getStateSync():rCameraState;
    getCameraData(who:eCgDP_key[],opt:options_gcd): Promise<rCameraData>;
    setCameraData(data:rCameraData, ea:eErrorAction): Promise<rCameraData>;

    getCfg():CameraControlConfig;
    async_initialize():Promise<any>;
    getIds():SetOf_Id_Hard;
    DiagnosticMessages: tDiagnosticMessages;
};

/*
interface FactoryTable {
    [key: string]: new (cfg: CameraControlConfig) => ControlI;
}

export class ControlFactory {
    private tab: FactoryTable = {};

    public register(name: string, constr: new (cfg: CameraControlConfig) => ControlI) {
        this.tab[name] = constr;
    }

    public make(name: string, cfg: CameraControlConfig): ControlI {
        return new this.tab[name](cfg);
    }
}
*/

export const Camera_Factory=new mgen.ControlFactory<ControlI,CameraControlConfig>()

type tCameraObj = { 
    control:ControlI, 
    cfg:CameraControlConfig , 
    prs:preset.Presets , 
    Limits? : iCameraHumanLimits
};


export function getDiagnosticMessages( cobj:ControlI ):tDiagnosticMessages|undefined{
    if ( Object.keys( cobj.DiagnosticMessages).length) return cobj.DiagnosticMessages;   
}

export class CameraAPI {
    //private cam: {[id in string]: ControlI} = {};
    //private prs: {[id in string]: preset.Presets} = {};
    //private cfgCameras: mapCameraControlConfig;
    private Cameras_idx:{ [key:string]:tCameraObj }={};
    savedCamData: { [key:string]:rCameraData}={};
    srvcb = new hNoCopy<iServerIntegrate>();


    constructor(_acfg: CameraControlConfig[], srvcb:iServerIntegrate ) {
        //this.cfgCameras = cfg;
        this.srvcb.itc = srvcb;
        if (!_acfg) return; 
        let acfg: CameraControlConfig[] = Array.isArray(_acfg) ? _acfg : Object.values(_acfg);
        for (const ccfg of acfg) {
            //const ccfg = this.cfgCameras[name];
            if (ccfg.Ignore) continue;
            //ccfg.ID = name; //CHECK!
            let id = String(ccfg.ID);
            if (!id) throw Error(`Config.Invalid camera ID:${id} for ${ccfg.DisplayName}`)
            if (this.Cameras_idx[id]) throw Error(`Config.Duplicate camera ID:${id} for ${ccfg.DisplayName}`)
            this.Cameras_idx[id] = {
                cfg : ccfg, 
                control:Camera_Factory.make(ccfg.ControlType, ccfg) , 
                prs:new preset.Presets(path.join(menv.getEnv().StorageDataDir, `presets_${ccfg.ID}.json`))
            };
        }
    }
    async async_initialize():Promise<any>{
        let pr :Promise<any>[] = [];
        let cams = Object.values(this.Cameras_idx);
        for (let  cc  of cams  ) 
            pr.push( cc.control.async_initialize()  )
        let q = Promise.all( pr );
        await q;
        this.checkCamerasIds( false);

        return q;
    }    

    getCamerasObjList() :tCameraObj[] {
        return Object.values(this.Cameras_idx ); //.map((cam) => ( cam.cfg ));
    }
    registerDevices( devst : mgen.cDeviceStorage ){
        let cl = this.getCamerasObjList();
        for (let cc of cl ) { 
            var di=  new mgen.cDeviceInfo('I',`Cameras/${cc.cfg.ID}` , cc.cfg   ); //cc.control ); 
            devst.addnewdevice(di);
        }
    }    
    //getCameraInf()
    getCameraObj( id :number|string|undefined):tCameraObj|undefined{
        if (id === undefined) return;
        let c = this.Cameras_idx[String(id).trim()];
        //if (!c) return;
        return c;
    }
    getCameraObjN( id :number|string|undefined):tCameraObj{
        let r = this.getCameraObj(id);
        if (!r) throw Error(`Invalid camera ID:${id}`);
        return r; 
    }    


    getCameraControl( id:number|string ) :ControlI|undefined {
        return this.getCameraObj(id)?.control;
    }

    getCameraSettings(cid:string):CameraControlConfig|undefined{
        return this.getCameraObj(cid)?.cfg;
    }

    getAllCameraIds():string[]{
        return Object.keys(this.Cameras_idx)
    }

    async getCamerasList(...ids:string[]):Promise<ExtCameraInfo[]>{
        if (!this.srvcb.itc) throw "Internal this.srvcb.itc"
        if (!ids.length) {
            this.checkCamerasIds( true );
            ids = Object.keys(this.Cameras_idx);
        }    
        //let resa=  Object.values(this.Cameras_idx ).map(cam => { return cam.control.getState(); } );
        let cams=ids.map( (v)=>this.Cameras_idx[v] ).filter( (v)=>v )
        let resa= cams.map( (cam)=>cam.control.getState()  )

        await Promise.all( resa )
        let ress:ExtCameraInfo[]=[];
        //let pin_in=await this.srvcb.itc.WhoCapturedNow();
        for (let acr of resa) {
            let cr = await acr;    
            ress.push( cr );
            //if ( pin_in &&  pin_in== cr.Pin_SwitchIn ) cr.ActiveCapture = true;
        }
        return ress;
    }
    /*
    public async cameras(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        return {
            result: this.getCamerasList()
            ,opt_readable:true
        }
    }*/
    /*
    public async getState(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let cc = this.getCameraObjQ(query)
        let result:rCameraState = await cc.control.getState();
        (result as any).Presets = cc.prs.get();
        //result.DiagnosticMessages = getDiagnosticMessages( cc.control) 
        return { result , opt_readable:true }
    }    
    */
    public async getState( id:string ): Promise<rCameraState> {
        let cc = this.getCameraObjN(id);  //this.getCameraObjQ(query)
        //console.log(`id(${id})==>>`,cc)
        //this.cfg.PanoramaFile
        let pf = this.srvcb.itc?.GetPanoramaPath(cc.cfg.ID); //if (!pf) throw "Internal this.srvcb.itc"
        if (pf && fs.existsSync( pf.fspath )) {
            cc.cfg.PanoramaFile = pf;
        }    
        let result = await cc.control.getState();
        if ( !cc.Limits ) {
            let dinf = ControlTypes[ cc.cfg.ControlType ]?.CameraDeviceSetting?.Optics
            if (dinf?.PosLimits && dinf?.ZoomLimits) {
                cc.Limits = { PanTiltPos_h : dinf.PosLimits.Degree, ZoomPos_h: dinf.ZoomLimits.TheSize }
            }
        }
        result.Limits = cc.Limits ;
        result.Presets = cc.prs.get();

        //result.DiagnosticMessages = getDiagnosticMessages( cc.control) 
        return result;  
    }    
    getCameraObjQ( query: url.UrlWithParsedQuery ):tCameraObj{
        return this.getCameraObjN(query.query["id"] as string);
    }    


    public async turnOn(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let cc = this.getCameraObjQ(query)
        const result = await cc.control.turnOn();
        return { result };
    }
    
    public async turnOff(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let cc = this.getCameraObjQ(query)
        const result = await cc.control.turnOff();
        return { result };
    }

    public async zoomStart(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let cc = this.getCameraObjQ(query)
        const tele = (query.query["zoom"] as string) === "tele"; 
        //TODO: check dir=="wide"
        return { result:await cc.control.zoomStart(tele) }
    }


    public async zoomStop(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let cc = this.getCameraObjQ(query)
        return { result: await cc.control.zoomStop() };
    }

    public async driveStart(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let cc = this.getCameraObjQ(query)
        const dir = query.query["dir"] as string;
        const speed = query.query["speed"] as string;
        const result = await cc.control.drive(dir,speed);
        return { result }
    }

    public async driveStop(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let cc = this.getCameraObjQ(query)
        const result = await cc.control.driveStop();
        return { result }
    }

    public async setSpeed(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let cc = this.getCameraObjQ(query)
        const speed = parseInt(query.query["v"] as string);
        return { result: cc.control.setSpeed(speed) };
    }

    public async getPresets(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let cc = this.getCameraObjQ(query)
        return { result : cc.prs.get() };
    }

    public async addPreset(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let cc = this.getCameraObjQ(query)
        const name = decodeURIComponent(query.query["name"] as string);
        const result = await cc.prs.create(name, cc.control);
        return { result };
    }

    public async removePreset(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let cc = this.getCameraObjQ(query)
        const preset = query.query["preset"] as string;
        cc.prs.remove(preset);
        return { result: null };
    }

    public async setPreset(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let cc = this.getCameraObjQ(query)
        const preset = query.query["preset"] as string;
        return this.setPresetI( cc.cfg.ID , preset );
    }
    public async setPresetI( camId:string , presetId:string ): Promise<APIResult> {
        let cc = this.getCameraObjN(camId)
        //let p=cc.prs.getPreset(presetId.trim());
        //return { result: await cc.control.presetRecall( p.ID ) };
        return { result: await cc.prs.setPreset(  presetId , cc.control ) };
    }
    public async setCamData(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let [q,e] = mutils.testInvalidStrParamsFromAny( query.query, {id:"" , name:"", value:"" } , "setCamData:" );
        let rec:rCameraData;
        if ( Boolean(q.value) == Boolean(q.name))  return { error:`Invalid params set! Ожидается [id и value] либо [name] принято(${JSON.stringify(q)})` }
        if (q.id) {
            rec = JSON.parse( decodeURIComponent( q.value ) )    
            rec.CameraID = q.id;
        } else {
            let name=q.name;
            rec =this.savedCamData[name];
            if (!rec) return {error:`Invalid name "${name}"`};
            q.id = rec.CameraID?rec.CameraID:"";
        }
        let cc= this.getCameraObj( rec.CameraID );        
        if (!cc) return { error:`Camera ${rec.CameraID} not found in current configuration` }
        rec= await cc.control.setCameraData( rec , eErrorAction.Continue  );
        return { result:rec }
    }    
    public async getCamData(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let cc = this.getCameraObjQ(query)
        let [q,e] = mutils.testInvalidStrParamsFromAny( query.query, {id:"",value:"",name:"",nobigQ:false} , "getCamData:" );
        let v:any= q.value;
        if (v==undefined) v=["base"]
        else if (v=="") return {error:"Неопределенно запрашиваемое значение" }
        else v = v.split(',');
        //if (name){ }
        let result = await cc.control.getCameraData( v , { nobigQ:q.nobigQ ,  ea: eErrorAction.Continue } )
        if (q.name) {
            result.SelfID=q.name;
            result.CameraID= cc.cfg.ID;
            this.savedCamData[result.SelfID] = result
        }
        let ar:APIResult = { result,   opt_readable:true }
        if (result.error)  ar.error = result.error;   
        return ar;
    }
    public async MakePanoramaE(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let [q,e] = mutils.testInvalidStrParamsFromAny( query.query, {id:"" } , "MakePanoramaE:" );
        let pr=await this.MakePanorama( q.id );
        return { result:pr , error:pr.error };
    }    
    public async setPosition(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let cc = this.getCameraObjQ(query)
        let [q,e] = mutils.testInvalidStrParamsFromAny( query.query, {id:"",posFrom:"",posTo:"",zoom_abswheel:""} , "getCamData:" );
        let rq:rCamPosition ={}
        if (q.posFrom) { 
            rq.posFrom= JSON.parse( `[${q.posFrom}]` ) 
            rq.posTo= JSON.parse( `[${q.posTo}]` ) 
            if (rq.posTo?.length!=2 || rq.posFrom?.length!=2 ) return {error:"Invalid pos rel"}
        }    
        if (q.zoom_abswheel) 
            rq.zoomwheel = Number( q.zoom_abswheel ); 
        let r=await cc.control.setPosition( rq );
        return { result:r , error:r.error };
    }    
    async setCameraGlobalPosition(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let [q,e] = mutils.testInvalidStrParamsFromAny( query.query, {id:"",pos:""} , "getCamData:" );
        let cc= this.getCameraObjQ( query );
        let rq:rCamPosition={};
        if (q.pos) { 
            rq.posTo= JSON.parse( `[${q.pos}]` ) 
        }    
        let st = await cc.control.setGlobalPosition( rq );
        return { result:st ,opt_readable:true } 
    }    

        

    public async savehardinfo(req: http.IncomingMessage, query: url.UrlWithParsedQuery): Promise<APIResult> {
        let cc = this.getCameraObjQ(query)
        let v = ""; if ("hardid" in query.query) { v=query.query["hardid"] as string }
        let result= await cc.control.setCameraData( { UserTagId:v} ,eErrorAction.Throw )
        return { result };
    }    
        
    checkCamerasIds( nomsgs:boolean=true ){
        let cams = Object.values(this.Cameras_idx);
        let idxi2h:{[key:string]:SetOf_Id_Hard} ={}
        let msgs:string[]=[];
        for (let  cc  of cams  ){ let ids = cc.control.getIds(); idxi2h[ids.expected_hardid] = ids; }
        for (let ii of Object.values(idxi2h)  ){
            let ctrl = this.Cameras_idx[ii.id].control;
            delete ctrl.DiagnosticMessages.IdSet;
            delete ctrl.DiagnosticMessages.IdError;
            if (!ii.hardid || ii.expected_hardid==ii.hardid ) continue;
            if (ii.hardid=="0"){
                let m=`Камера ${ii.id}. Идентификатор на устройстве не установлен`;
                ctrl.DiagnosticMessages.IdSet=[m];
                msgs.push(m);
            }; 
            let msgs_cam=[`Камера ${ii.id}. Идентификатор на устройстве (${ii.hardid}) не совпадает с ожидаемым (${ii.expected_hardid}) !`]
            let dup=idxi2h[ii.hardid];
            if (dup)
                msgs_cam.push(`Вероятно неправильное подключение устройств. Идентификатор на устройстве камеры '${ii.id}' соотвествует камере '${dup.id}'.Следует исправить конфигурацию.`) 
            ctrl.DiagnosticMessages.IdError = msgs_cam;
            if (!nomsgs) mlog.error( msgs_cam.join('.') );
            
        }
        if (!nomsgs) mlog.log( msgs.join('. ') );
    }
    public async MakePanorama( camId:string ): Promise<resCameraOperation> {
        let cc = this.getCameraObjN(camId as string);
        let dInf = ControlTypes[ cc.cfg.ControlType ]?.CameraDeviceSetting?.Optics;
        if (!this.srvcb.itc) throw Error("Internal! this.srvcb.itc!");
        if (!dInf || !dInf.ViewingAngle || !dInf.PosLimits?.Degree || !dInf.PosLimits?.Param ) return { error:"Неизвестен угол обзора камеры" }
        let cb = this.srvcb.itc;
        let ea=eErrorAction.Throw;
        let savedpos=await cc.control.getCameraData( ["ZoomPos","PanTiltPos"] ,  { ea }  );
        await cc.control.setCameraData( {ZoomPos:0 } , ea  );

        let cloc = calcPanoPositions( dInf )
        
        let plp=dInf.PosLimits.Param;
        //let parPerAngle=dInf.PosLimits.Param.x[0]/dInf.PosLimits.Degree.x[0];
       // let xWinSize = Math.floor( dInf.ViewingAngle.x * parPerAngle ); // размер окна в еденицах камеры
       // let len=[plp.x[1]-plp.x[0], 0];
        //let winCont= Math.round(len[0]/xWinSize); 
        //let lasttruncWinX=(winCont*xWinSize + plp.x[0] - plp.x[1])/xWinSize;

        let pos:iPositionXY={x:0,y:0}, stepi:iPositionXY={x:0,y:0}
        let snapshots:any[]=[];
        let snapshot=async ( stepi:iPositionXY  ) => {
            let file = cb.MakeDataFilePath(`PartOfPano_${cc.cfg.ID}_x${stepi.x}_y${stepi.y}.jpg`) ;
            snapshots.push({ file , geom:{x:stepi.x,y:stepi.y} ,campos:{x:pos.x,y:pos.y} })
            let r= await cb.callMediaServer( "capture/snapshot?file=" + file );
            if (r.error) throw Error("Error at make shapshot. File "+file);
        }
        //mlog.log( `Make Panorama on ${camId } cnt Jpg=${ cloc.winCount } step=${ cloc.xWinSize } last trunc=${cloc.xLastTruncWin }`)
        mlog.log( `Make Panorama on ${camId } ::`, cloc);

        for (pos.x=plp.x[0]; stepi.x < cloc.winCount ; pos.x+= cloc.xWinSize , stepi.x++ ) {
            pos.x = Math.min(pos.x,plp.x[1]); pos.y = Math.min(pos.y,plp.y[1]);
            await cc.control.setCameraData( { PanTiltPos:[ pos.x , pos.y ]  } , ea  );
            let cd= await cc.control.getCameraData( ["PanTiltPos"] , { ea }  );
            if (!cd.PanTiltPos || cd.PanTiltPos[0] != pos.x || cd.PanTiltPos[1] != pos.y ) 
                throw Error(`Invalid position durng cicle pano wait ${[pos.x,pos.y]} , by fact ${cd.PanTiltPos} `);
            await msync.wait(100);    
            await snapshot( stepi);
        }

        mlog.log("Returned camera to start position+zoom  " )
        await cc.control.setCameraData( savedpos , ea );

        // montage snapshot_x0_y0.jpg snapshot_x1_y0.jpg snapshot_x2_y0.jpg snapshot_x3_y0.jpg -tile 4x1 -geometry +0+0  all.jpg
        const PanoramaFile = cb.GetPanoramaPath(cc.cfg.ID)
        //let PanoramaFile= cb.MakeDataFilePath(`Panorama_Camera_${cc.cfg.ID}.jpg`);
        // Узнаем размер картинки identify -format "%w %h" img1.jpg
        let lastfile = snapshots[snapshots.length-1].file
        let exres=await menv.Execute(`identify -format "%w %h" ${lastfile}`,{ echo:1, hide:0 , raise:1})
        let imsz= exres.out.trim().split(' '); if (imsz.length!=2) throw Error("Error at identify image get size");
        // Подрежем последнюю картинку convert img1.jpg -crop (1920-O)x1080+(O)+0 +repage out.jpg
        let deltashift=Math.round(cloc.xLastTruncWin * Number(imsz[0])); // 274
        let lastWinSize = Number(imsz[0])-deltashift;
        await menv.Execute(`convert ${lastfile} -crop ${Number(imsz[0])-deltashift}x${imsz[1]}+${deltashift}+0 +repage ${lastfile}`,{echo:1, raise:1})
        

        // Сливание всех картинок в одну по горизонтали
        let cmdline= `montage ${snapshots.map( value=>value.file).join(' ')} -tile ${snapshots.length}x1 -geometry +0+0 ${PanoramaFile.fspath} ` 
        await menv.Execute( cmdline , {echo:1,raise:1} );
        fs.appendFileSync(PanoramaFile.fspath, JSON.stringify({ imsz, snapshots , shiftLastWin:deltashift } ) )
        //cc.cfg.CameraDriveSpeed
        cc.cfg.PanoramaFile = PanoramaFile;

        return { result:"OK" , state:await cc.control.getState() }
    }    


}

export interface rPanoramLocation{
    plp:iPositionLimits,
    xWinSize:number, //  размер видимого окна в еденицах камеры
    winCount:number, // количество видимых окон в панораме
    parPerAngle:number, // param / angle 
    xLastTruncWin:number, // rel shift x/xWinSize относительный размер обрезания последнего окна
    istruncate?:boolean,
    xFullSize:number, // размер панорамы в еденицах камеры
    yWinSize:number, //  размер видимого окна в еденицах камеры
    xTruncLWpano:number, // размер обрезания в еденицах панорамы

    PosLimits: mgen.iPositionAllLimits ,
    ViewingAngle: iPositionXY,

}
interface rPanoramPos{
    winnum:number[];
    center:number[]; // in params
    rel_shift:number[];  // in relpos
}    
function Angle2RelWinPos(g: rPanoramLocation , coordid:keyof iPositionXY, angle_camparam:number   ){
    // angle >=-ViewingAngle , <= ViewingAngle
    // x= 0.5 * ctg(ViewingAngle/2) *tg( angle )
    // return in -0.5 , 0.5 
    let degreePerParam=g.PosLimits.Degree[coordid][1]/g.PosLimits.Param[coordid][1];
    let angle = angle_camparam*degreePerParam * (Math.PI/180);
    return 0.5 * Math.tan( angle ) / Math.tan( (Math.PI/180)*g.ViewingAngle[coordid]/2 )
}
export function Pano_Param2GPos(g: rPanoramLocation , pos: number[] ):number[]{
    let winnum= Math.floor((pos[0] - g.plp.x[0])/g.xWinSize + 0.5); 
    let x=(pos[0] - g.plp.x[0]+g.xWinSize/2)/g.xFullSize;
    let truncx = winnum>=g.winCount-1? g.xTruncLWpano : 0;
    //mgen.keys_iPositionXY
    let panoWinSize=[g.xWinSize/g.xFullSize , 1 ] 
    let centrCam=[Math.min( winnum*g.xWinSize + g.plp.x[0] , g.plp.x[1] ) ,0];
    let centrPano=[ (winnum+0.5)*panoWinSize[0] - truncx , 0.5];
    let relWp:number[]=[]
    //console.log('Pano_Param2GPos',{ pos, winnum , panoWinSize,centrCam,centrPano} )
    for (let i=0;i<2;i++) {    
        relWp[i]=centrPano[i] + panoWinSize[i]*Angle2RelWinPos(g ,mgen.keys_iPositionXY[i] , (pos[i]-centrCam[i]) ); 
     }
    

    return relWp;
    //return [ x - (winnum>=g.winCount-1? g.xTruncLWpano : 0) , pos[1]/g.yWinSize + 0.5 ]
}    
export function calclAbsPosInPano(g: rPanoramLocation , pos: number[] ):rPanoramPos{
    let apx = pos[0]*g.xFullSize;
    let wn = Math.floor( apx / g.xWinSize )
    let leftloc =  g.plp.x[0]-0.5* g.xWinSize;
    let cx = Math.floor( Math.min( leftloc + (wn+0.5)* g.xWinSize , g.plp.x[1] ) )
    let dx = leftloc + apx - cx ;
    let r:rPanoramPos= {
        winnum:[ wn , 0 ],
        center:[ cx , 0 ],        
        rel_shift: [ dx/g.xWinSize , pos[1] - 0.5 ]
    }
    return r;
}
export function calcPanoPositions( di? : rCameraDeviceParams  ):rPanoramLocation{
    if (!di?.PosLimits || !di?.ViewingAngle ) throw Error("Internal calcPanoPositions")
    let fpl=di.PosLimits;
    let plp=fpl.Param;
    let r:rPanoramLocation={ parPerAngle:fpl.Param.x[0]/fpl.Degree.x[0],
            PosLimits : di.PosLimits, ViewingAngle: di.ViewingAngle,
            xWinSize:0 ,winCount:0, xLastTruncWin:0,xFullSize:0, xTruncLWpano:0, plp,
            yWinSize:Math.floor( di.ViewingAngle.y * (fpl.Param.y[1]/fpl.Degree.y[1]))
         };
    r.xWinSize = Math.floor( di.ViewingAngle.x * r.parPerAngle ); // размер окна в еденицах камеры
    let len=[plp.x[1]-plp.x[0], 0];
    r.winCount= 1+ Math.round(len[0]/r.xWinSize); 
    let xlast = (r.winCount-1)*r.xWinSize + plp.x[0];
    r.istruncate = xlast >plp.x[1];
    r.xLastTruncWin= r.istruncate ?  ( xlast - plp.x[1])/r.xWinSize : 0 ;
    r.xFullSize = Math.floor( r.winCount * r.xWinSize - (r.xLastTruncWin*r.xWinSize) )
    r.xTruncLWpano= (r.xLastTruncWin*r.xWinSize)/r.xFullSize

    return r;
}    

