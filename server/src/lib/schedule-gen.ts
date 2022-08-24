// Модуль schedule-gen.ts содержит:
// Вспомогательные функции для работы планировщика заданий

import {unixtime} from "./utils";
import {rScheduleEntry,rSchedulerConfig} from "./schedule_interface";



export type DictionarySA = { [key:string]:any };

/*
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
*/
/*
export interface rSchedulerConfig  {
	Enabled : boolean;
    PeriodResolution: unixtime;
    TaskHistoryFormat?:string;
    EmulateTask?:boolean;
    Entries: rScheduleEntry[];
}
*/
export type SchedEntryMap = {	[key: string]: rScheduleEntry;   };
export type eCommand = 
    "start"    // http://<host>/cmd/schedule/start?ids=ID1,ID2,...
    | "stop"   // http://<host>/cmd/schedule/stop?ids=ID1,ID2,...
    | "set"    // set all
    | "update" // changes only
    | "delete" // delete tasks http://<host>/cmd/schedule/detele?ids=ID1,ID2,...
    | "history"
    | "state"; // get state without history
export var eCommandList= ["start","stop", "set" , "update" , "delete" , "history" , "state"];   



const empty_SchedEntry:rScheduleEntry = { Id:"", Start: 0, Duration: 0,  Period: 0,  Name:"",   Camera: "", Camera_PresetID:"", FileTemplate:"", Allowed: false }; 
export const empty_SchedCfg:rSchedulerConfig={Enabled : false, PeriodResolution: 0, 
    TaskHistoryFormat:"", EmulateTask:false,  Entries: [empty_SchedEntry]}

export function make_SchedEntryMap( a:rScheduleEntry[] ):SchedEntryMap{
    let r : SchedEntryMap={};
    for (let e of a) r[e.Id] = e;
    return r;
}
export function compare_ScheludeEntry( l:rScheduleEntry, r:rScheduleEntry ):number{
    //var xx={}; xx.uu=0;
    if ((l==undefined)||(l==undefined)) return 1;
    let ld= l as DictionarySA; let rd = r as DictionarySA;
    let cntdiff=0;
    for (let i in empty_SchedEntry) {
        if ( ld[i] != rd[i] ) { cntdiff++; }      
    }
    return cntdiff;
}

function makeErrorString( msg:string ,  e:rScheduleEntry ): string {
    let os = JSON.stringify(e);
    os = os.replace(/\"/gi,"'");
    return  msg + os;
}

function typeoft( d:any ):string {
    if (typeof(d)!="object") return "any";
    return Array.isArray(d) ? "array" : typeof(d)
}
export function reorderFields( sample:any , data:any ):any{
    let ts = typeoft(sample); let td= typeoft( data);
    if (ts != td ) { throw `reorderFields:Invalid data ${JSON.stringify(data)} `;  }
    let res:any={};
    switch (ts) {
        case "object":
            for (let n in sample) 
                if (n in data) res[n] = reorderFields(sample[n], data[n]); 
            break;
        case "array": 
            if (sample.length==0) return data;
            res=[ ]; let s0 = sample[0];
            for (let v of data) res.push( reorderFields(s0,v) );
            break;
        default: return data;
    }
    return res;
}
export function reorderSCfgFields(cfg : rSchedulerConfig):rSchedulerConfig{
  return reorderFields( empty_SchedCfg ,cfg  );
}
//export function reorderCfgEntryFields(cfg : SchedEntry):SchedEntry{    return reorderFields( empty_SchedEntry ,cfg  );}
function errValue<T>(r:T, k:(keyof T) , errcond:boolean , isUpdate?:boolean   ):boolean{
    if (!(k in r)) return Boolean(!isUpdate);
    if (r[k]===undefined) return true;
    return errcond;
}
export function validate_SchedulerConfig(  cfg? : rSchedulerConfig , isUpdate? : "update" ) : string{
    //return true;
    if ( !cfg ) return  "missing Scheduler field" ;
    let isupdate = Boolean(isUpdate)
    let m =new Map<string,number>();
    let er= testUnkFields( empty_SchedCfg , cfg ); if (er) return er;
    if (errValue(cfg,"Entries",false,isupdate))
        return " not found 'Entries' field ";
    if (cfg.Entries) for (let e of cfg.Entries ){
        //let e = cfg.Entries[idx];
        if (!e.Id ) { return makeErrorString( "Invalid ID for: SchedulerEntry" , e); }
        if (m.get(e.Id)) { return makeErrorString("Duplicate ID for: SchedulerEntry" ,e); }
        m.set(e.Id,1 );
        er= testUnkFields( empty_SchedEntry , e ); if (er) return er;

        if (errValue(e,"Name",!e.Name,isupdate))
             return makeErrorString("Invalid Name for: SchedulerEntry" ,e); 
        else {     
            if (m.get(e.Name )) { return makeErrorString("Duplicate Name for: SchedulerEntry" ,e); }
            m.set(e.Name,1 );
        }    
        if (errValue(e,"Camera",!e.Camera,isupdate))
             return makeErrorString("Invalid camera ID for: SchedulerEntry" ,e); 
        if (errValue(e,"Period",(e.Period < 0),isupdate))
             return makeErrorString("Invalid period : SchedulerEntry" ,e); 
        if (errValue(e,"Start",(e.Start <= 0),isupdate))
             return makeErrorString("Invalid start : SchedulerEntry" ,e); 
    }
    return "";
}
function testUnkFields( etalon:any , data:any  ):string{
    let eunks=[],etypes=[]
    for (let k in data) {
        //console.log(`test ${k} ${k in empty_SchedEntry}`)
        if (!(k in etalon)) { eunks.push(k); continue; } 
        if (typeof etalon[k]!=typeof data[k] ) { etypes.push(k); continue; } 
    }    
    let er="";
    if (eunks.length) er += "Незнакомые идентификаторы: " + eunks.join(',')+". "
    if (etypes.length) er += "Неправильный тип значения для идентификаторов: " + etypes.join(',')+". "
    //console.log( er, etalon , data )
    return er;
}
export function validate_SchedulerConfig_Load(  cfg? : rSchedulerConfig  ) : string{
    if (!cfg) return "missing 'Scheduler' field";
    let er= testUnkFields( empty_SchedCfg , cfg ); if (er) return er;
	for (let e of cfg.Entries ){
        if (!e.Id ) { return makeErrorString( "Invalid ID for: SchedulerEntry" , e); }
        er= testUnkFields( empty_SchedEntry , e ); if (er) return er;
    }
    return "";
}  
export function validate_SchedulerConfig_Update(  cfg? : rSchedulerConfig  ) : string{
    if (!cfg) return "missing 'Scheduler' field";
    let er= testUnkFields( empty_SchedCfg , cfg ); if (er) return er;
	if (cfg.Entries) for (let e of cfg.Entries ){
        if (!e.Id ) { return makeErrorString( "Invalid ID for: SchedulerEntry" , e); }
        er= testUnkFields( empty_SchedEntry , e ); if (er) return er;
    }
    return "";
}