// Модуль schedule-service.ts содержит:
// функции и структуры данных службы планировщика заданий
// Служба планировщика это внутренний "процесс" сервера
// Планировщик активизирует таймер с нужным периодом по мере необходимости

import path from "path";
import fs from "fs";
import * as msched from "./schedule-gen";
import * as mutils from "./utils";
import * as mlog from "./log";
import * as menv from "./environment";
import * as mgen from "./device-types";
import {hNoCopy,unixtime} from "./utils";
import {cTimer} from "./sync";
import {rScheduleEntry,rSchedulerConfig,rScheduleTaskState , rSchedulerServiceState , cSchedulerStoreData ,rSchedulerConfigUpdate } from "./schedule_interface";


import { MessageChannel } from "worker_threads";

//import { stringify } from "querystring";

//type unixtime = msched.unixtime;
export enum eTaskState { NotRun="notrun",Running="Running", PendingStart="PendingStart",PendingEnd="PendingEnd" }
export enum eTaskWhen { Update="update", Delete="delete", TryEnds="try ends", Completed= "completed"
    ,TryStart="try start", Started= "started"  };
export enum eTOInitiator { Unknown="Unknown", Manual="Manual", Auto="Auto"}    
export type cTaskOperationInitiator = "manual"|"auto";

type rTaskDBRec = {t:unixtime, w:eTaskWhen, s?:unixtime, f?:string, m?:string,e?:string,i?:eTOInitiator };
    //legend: s-start at, f-file , m-message, e-error

export type cTaskOperation={
    tid?:string; 
    pending?:boolean; 
    msg?:string;
    error?:string; 
    opcode?:string; 
    //cameraId?:string; 
    source?:{ cameraId:string, Camera_PresetID?:string , oldPresetID?:string }
    file?:string;
};

export function IntegrateMsgTaskOperation( top:any ):cTaskOperation{
    let res:cTaskOperation={}; let errors=""
    let cur=top; let aerrs=[];
    if ( Array.isArray(cur)) { 
        for (let e of cur) { let etop=IntegrateMsgTaskOperation(e);
            if (etop.error) aerrs.push(etop.error);
        }
        if (aerrs.length) res.error = aerrs.join(".\n");
    } else if ( typeof(cur)=="object" ) {
        if ( cur.error) res.error=cur.error;
    }
    return res;
}

export type ActiveTask = {
    //startAt:unixtime;
    //endAt:unixtime;
    err?:string;
    file?:string;
    msg?:string;
}
export interface ITaskCall{
    start_capturetask( to:cTaskOperation ):Promise<cTaskOperation>;
    stop_capturetask( to:cTaskOperation , fr:Promise<cTaskOperation> ):Promise<cTaskOperation>;
    makecapture_filename_fortask( fn : string):string;
}


export type tScheluderSettings = {
    ParamsFile : string ,
    JournalPath: string,
    ApiPath_LogFiles: string
    ApiPath_LogJsonFiles: string
    DebugOutput?:{Timer:number}
}  


export class SchedTask {
    entry : rScheduleEntry;
    //isexecute : boolean=false;
    state : eTaskState= eTaskState.NotRun;
    last_starttime : unixtime=0;
    curr_duration: unixtime=0;
    curr_file:string=""; // current capture file name
    next_starttime : unixtime=0;
    next_duration: unixtime=0;
    cnt_calls:number=0;
    cnt_errcalls:number=0;
    called? : Promise<cTaskOperation>;
    savedinfo:any={};
    
    constructor (e :rScheduleEntry){   this.entry = e;  }
    //Duration():unixtime { return this.entry.Duration; }
    isexecute() :boolean { return mutils.containsA( this.state , [eTaskState.PendingStart,eTaskState.Running] ) };
    recalc_NextStart(ctime?:unixtime):boolean{
        if (!ctime) { ctime = mutils.getUnixTime() }
        var newns:unixtime;
        if (!this.entry.Period) { // одноразовый запуск
            newns = ctime<this.entry.Start ? this.entry.Start : 0;
        } else {
            let cntp = Math.floor( (ctime - this.entry.Start)/this.entry.Period );
            newns =this.entry.Start + ( cntp<0 ? 0 : this.entry.Period*(cntp+1) );
            //let res = (this.next_starttime != newns) || (this.next_duration != this.entry.Duration);
        }    
        this.next_starttime = newns;
        this.next_duration = this.entry.Duration;
        //console.log("Recalc start time",ctime , this.entry.Id,this.next_starttime);
        return true;
    }
}
export type Dictionary<TO> = { [key:string]:TO };



class EmulateTaskCall{
    datapath:string;
    constructor( datapath:string) {
        this.datapath = datapath;
    }
    async start_capturetask( to:cTaskOperation ):Promise<cTaskOperation>{
        if (to.tid == "IDerr") to.error="Error on start capture!";
        to.msg = "Emulator start task";
        //if (to.tid == "ID3") throw "THROW:Error on start capture!";
        return to;
    }
    async stop_capturetask( to:cTaskOperation , fr:Promise<cTaskOperation> ):Promise<cTaskOperation>{
        let at = await fr;
        to.file = to.file ? to.file : at.file;
        let temf = path.join( this.datapath , "template/image.mp4" )
        if (to.file) fs.copyFileSync(temf, to.file );
        else mlog.error( "On Emulator.stop_capturetask  - file not defined" );
        to.msg = "Emulator end task";
        return to;
    };
    makecapture_filename_fortask( fn : string):string{
        return path.join( this.datapath , `${fn}.mp4`);
    }
}

type eNotyifyChangeWhat="own"|"all"|"change"|"new"|"delete"|"start"|"stop"


export class SchedulerService {
    //timer_period: unixtime=10;
    //enabled : boolean=false;
    history = {lastRunTime:0,lastUpdateTime:0};
    private nsave_changes:number=0;
    private cfg_changes:number=0;
    isExecute: boolean=false;
    private cfg : rSchedulerConfig;
    tasks: Dictionary<SchedTask>  = {};
    private current_execute : Dictionary<SchedTask>  = {};
    ScheluderSettings : tScheluderSettings ;
    AllowedMultipleOperations: boolean=false;
    timer:cTimer = new cTimer(); 
    taskcmd :hNoCopy<ITaskCall> = new hNoCopy<ITaskCall>();
    taskcmd_srv :hNoCopy<ITaskCall> = new hNoCopy<ITaskCall>();

    //private lock_NotyifyChange_cnt:number=0
    lock_NotyifyChange(v:-1|1){
        mgen.notify_Controller.lock_NotyifyChange(v)
        //this.lock_NotyifyChange_cnt += v ;
    }
    do_NotyifyChange( what:eNotyifyChangeWhat , taskid?:string) {
        this.cfg_changes++;
        this.nsave_changes++;
        mgen.do_notify( { schedule:1 } )
    }
    isLoaded():boolean {
        return this.ScheluderSettings? true :false;
    }
    constructor ( cset : tScheluderSettings , itc: ITaskCall ){
        //ncfg
        this.taskcmd_srv.itc = itc; 
        //this.taskcmd.itc = new EmulateTaskCall();
        this.ScheluderSettings = cset;
        if (!this.ScheluderSettings) { this.cfg= {} as rSchedulerConfig; return;}
        mlog.log("Load ScheluderSettings from" , cset.ParamsFile );
        const cfgData_1 = fs.readFileSync(cset.ParamsFile, "utf8");
        const cfg_1 = JSON.parse(cfgData_1) as cSchedulerStoreData;
        if (!cfg_1.Scheduler) throw( "Scheduler params file not contained node 'Schedule'! " + cset.ParamsFile ); 
        this.cfg =  cfg_1.Scheduler ;
        //let errload = msched.validate_SchedulerConfig_Load(this.cfg);
        let errload = msched.validate_SchedulerConfig(this.cfg);
        if (errload) mlog.error("Invalid data in Scheduler Config file:",cset.ParamsFile);
        //this.updateDB(true);

        this.init_Itc();
        //this.update( this.cfg );
        this.cfg.Entries.forEach( e=> this.NewTask(e));
        this.update_Control( this.cfg ) 
    }

    updateDB( notestchanges?: boolean) {
        if (this.nsave_changes || notestchanges) {
            let cfg = this.Config()
            cfg = msched.reorderSCfgFields(cfg)
            fs.writeFileSync(this.ScheluderSettings.ParamsFile , JSON.stringify( {Scheduler:cfg} , null, ' ' ) , {encoding: "utf8"} );
            mlog.log("Change Scheduler!");
            this.nsave_changes=0;
        }    
    }

    isEmulator() {
        return  menv.getEnv()["Point.Scheduler.EmulateTask"] || this.cfg.EmulateTask?true:false
    }

    init_Itc() {
        if (!this.taskcmd_srv.itc) throw "internal error- this.taskcmd_srv.itc!"
        let dp = path.dirname( this.taskcmd_srv.itc.makecapture_filename_fortask('r') );
        this.taskcmd.itc = this.isEmulator() ? new EmulateTaskCall(dp) : this.taskcmd_srv.itc ; 

    }

    Config( reassemble?:boolean ):rSchedulerConfig { 
      if (this.cfg_changes || reassemble) {
        let l:rScheduleEntry[]=[];
        for (let id in this.tasks) l.push( this.tasks[id].entry );
        this.cfg.Entries = l;
        this.cfg_changes=0;
      }  
      return this.cfg;
    }
    Timer_Period(){ return this.cfg.PeriodResolution; }
    Enabled() { return this.cfg.Enabled; }

    getState( withhistory:boolean , IdList?:string[]  ):rSchedulerServiceState{ //msched.DictionarySA {
       //let result : isExecute: ,    AllowedMultipleOperations: , tasks: 
       let setofTasks:any={}
       if (IdList) for (let id of IdList) setofTasks[id]=1;
       let apip = this.ScheluderSettings.ApiPath_LogFiles;
       let apip1 = this.ScheluderSettings.ApiPath_LogJsonFiles;

       let rr: rSchedulerServiceState={
        isExecute : this.isExecute ,
        AllowedMultipleOperations : this.AllowedMultipleOperations ,
        tasks : {}
       } 
       for (let id in this.tasks) {
           if (Object.keys(setofTasks).length>0 && !setofTasks[id] ) 
                continue;
           let t = this.tasks[id];
           let nt:rScheduleTaskState={
            state:t.state,
            last_starttime: t.last_starttime,
            curr_duration: t.curr_duration,
            curr_file: t.curr_file,
            next_starttime: t.next_starttime,
            cnt_calls: t.cnt_calls,
            cnt_errcalls: t.cnt_errcalls,
            Id: id,
            ApiPath_LogFile: path.join( apip , this.gettask_logfilename(t)),
            ApiPath_LogJsonFile: path.join( apip1 , this.gettask_formatlogfilename(t) )
           }
           rr.tasks[id] = nt;
       }
       return rr;

       /*
       let res:any = {}
       //let res : rSchedulerServiceState ={} as any ; 
       if (!this.isLoaded()) return res;
       res =mutils.TrivialCloneObject( this );
       delete res.cfg.Entries;
       delete res.current_execute;
       //let isdelentry = 
       if (IdList) { 
           let m:any={}; 
           for (let id of IdList) m[id]=1;
           for (let id in this.tasks) if (!m[id]) delete res.tasks[id];
       }
       for (let id in res.tasks) {
            let t= res.tasks[id]; t.Id=id;
            if (!withhistory) delete t.entry;
            delete t.savedinfo; delete t.called; 
            t.ApiPath_LogFile = path.join( apip , this.gettask_logfilename(this.tasks[id]));
            t.ApiPath_LogJsonFile = path.join( apip1 , this.gettask_formatlogfilename(this.tasks[id]));
            //console.log("rr-" ,id, this.tasks[id].entry.Id , "*" , this.gettask_logfilename(this.tasks[id]))
            // TODO:!
       };
       return res;
       */
    }
    public set_Full( ncfg : rSchedulerConfig ):Promise<any>{
        let inm = msched.make_SchedEntryMap( ncfg.Entries );
        let prA:Promise<any>[]=[];
        for (let id in this.tasks) 
            if (!inm[id]) prA.push( this.delete_task( [id] ) ); // TODO await
        for (let e of ncfg.Entries) 
            this.update_SchedEntry( e );
        //msched.compare_ScheludeEntry()
        prA.push( this.update_Control( ncfg ) );
        this.cfg = ncfg;
        return Promise.all(prA);
    }
    public update_Control( ncfg : rSchedulerConfigUpdate  ):Promise<any>{
        //TODO: заполнить все незаполненые поля из cfg (empty_SchedCfg)
        //for (let k in this.cfg ) { if (!(k in ncfg)) (ncfg as any)[k] = (this.cfg as any)[k];}
        if (ncfg.PeriodResolution == undefined ) ncfg.PeriodResolution = this.cfg.PeriodResolution;
        if (ncfg.Enabled == undefined) ncfg.Enabled = this.cfg.Enabled;
        if (ncfg.PeriodResolution <=0) ncfg.Enabled =false;

        if (this.cfg.Enabled == ncfg.Enabled && this.cfg.PeriodResolution == ncfg.PeriodResolution) return mutils.MakePromise();
        this.cfg.PeriodResolution = ncfg.PeriodResolution;
        this.cfg.Enabled = ncfg.Enabled;
        this.do_NotyifyChange("own");

        this.history.lastUpdateTime = mutils.getUnixTime();
        //this.RunService(false, false);
        return this.update_RunService();
    }
    
    RunService( run:boolean ):Promise<any>{
        if ( !this.isLoaded() ) return mutils.MakePromiseAny(0);
        let c = { Enabled : run} as rSchedulerConfig; 
        return (run ==this.cfg.Enabled) && !run ? this.StopExecute(undefined,eTOInitiator.Manual) :  this.update_Control( c );
    }
    update_RunService(  ):Promise<any> {
        //let c = { Enabled = startstop} as msched.SchedulerConfig; 
        //this.update_Control( c );
        if ( !this.isLoaded() ) return mutils.MakePromiseAny(0);
        let prStop:Promise<any>|undefined;
        let timerV = 1000*this.cfg.PeriodResolution;
        let nowexec = this.cfg.Enabled;
        if (!nowexec || timerV != this.timer.interval) this.timer.Stop();
        if (nowexec && !this.timer.Active()) 
            this.timer.Start( ()=>{ this.OnTimer() } , 1000*this.cfg.PeriodResolution );
        if (this.isExecute != nowexec){
            mlog.log(nowexec ? "start" : "stop", "Scheduler timer");
            if (!nowexec) prStop=this.StopExecute(undefined,eTOInitiator.Manual);
        }
        this.isExecute = nowexec; 
        return prStop ? prStop : mutils.MakePromise();
    }    
    private NewTask( ecfg : rScheduleEntry ):SchedTask {
        let t = this.tasks[ecfg.Id] = new SchedTask( ecfg ); 
        t.recalc_NextStart( );
        return t;
    }
    public update_SchedEntry( ncfge : rScheduleEntry , onlychange?:boolean ){
        //if (!ncfge.Name) { this.delete_task(ncfge.Id ); return; } // no await!
        //if (!ncfge.Id) { throw  }
        let t = this.tasks[ncfge.Id];
        let what:eNotyifyChangeWhat="change";
        if (!t) {
            t = this.NewTask(ncfge)
            what="new"
        } else {
            if (onlychange) 
                mutils.CopyUnDefinedFileds( ncfge , t.entry );
            if (!msched.compare_ScheludeEntry( t.entry , ncfge  )) return;
            t.entry = ncfge;
            if (!t.isexecute()) 
                t.recalc_NextStart( );
        }    
        this.task_logf( t , {where:eTaskWhen.Update,i:eTOInitiator.Manual});    
        this.do_NotyifyChange(what, t.entry.Id );

    }
    public async delete_task( ida : string[] ) {
        let tA : SchedTask[] = [];
        for (let id of ida) {
            let t = this.tasks[id]; 
            if (!t) { mlog.log("Error in schedule.delete_task. Invalid task ID"); continue; }
            // mutils.MakePromiseAny( { tid:String(i) , error:`Error in StopExecute. Invalid task ID ${i}`} )
            this.task_logf( t , {where:eTaskWhen.Delete,i:eTOInitiator.Manual});    
            delete this.tasks[id];
            this.do_NotyifyChange("delete", t.entry.Id );

            if (t.isexecute()) tA.push( t );
        }
        return this.StopExecute( tA , eTOInitiator.Manual )
    }
    recalc_NextStart__(  ctime?:unixtime ){
        if (!ctime) { ctime = mutils.getUnixTime() }
        for (let id in this.tasks) {
            this.tasks[id].recalc_NextStart(ctime);
        }
    };
    getReadyStartTaskList():SchedTask[] {
        let res=[];
        let ctime = mutils.getUnixTime();
        for (let id in this.tasks) {
            let task= this.tasks[id];
            if ( mutils.containsA( task.state , [eTaskState.NotRun])  && task.entry.Allowed && (task.next_starttime < ctime) && (task.next_starttime!=0) ) {
                res.push( task );
            }
        }
        //console.log("getReadyStartTaskList",ctime, this.tasks["ID1"], (this.tasks["ID1"].state in [eTaskState.NotRun]) );
        return res;
    }
    getReadyEndTaskList():SchedTask[] {
        let res = [];
        let ctime = mutils.getUnixTime();
        for (let id in this.current_execute){
            let task = this.current_execute[id];
            //task.state = eTaskState.PendingStart;
            if (mutils.containsA( task.state , [eTaskState.NotRun,eTaskState.PendingEnd] )) continue;
            if ( task.last_starttime + task.curr_duration <= ctime ) 
                res.push( task );
        }
        return res;
    }   
    gettask_logfilename( task :SchedTask ) { return `task.${task.entry.Id}.log`; }
    gettask_formatlogfilename( task :SchedTask ) { return `task.${task.entry.Id}.json`; }
    append_formatlog( task:SchedTask , dbrec:any ){
        let fn = path.join( this.ScheluderSettings.JournalPath  , this.gettask_formatlogfilename( task));   
        let prefix =  fs.existsSync(fn) && fs.statSync( fn ).size ? ",":"";
        let data = prefix + JSON.stringify(dbrec)+"\n"; 
        //mlog.doLog(fn, data  );
        fs.appendFileSync(fn, data , {encoding: "utf8"});
    }
    task_logf(task:SchedTask, m:{ where:eTaskWhen, msg?:string , err?:string , i:eTOInitiator  }): string{
        function unixtime2str( t:unixtime ):string { return new Date(t*1000).toLocaleString(); };
        function nexttime2str( t:unixtime ):string { return t==0 ? "Никогда" :  unixtime2str(t); };
        
        let fi:string=""; let dbrec:rTaskDBRec={t:mutils.getUnixTime(), w:m.where}; //m:string,e:string,i:eTOInitiator
        let typerun:string=m.i?String(m.i):"";
        switch(m.where){
            case eTaskWhen.Completed : { fi=`Result in ${task.curr_file}! Duration:${dbrec.t-task.last_starttime} сек`; 
                dbrec.s=task.last_starttime, dbrec.f=task.curr_file; 
                            break; }
        }
        let tpi= typerun; //typerun? `${typerun}`:"";
        let lmsg=m.msg? ':'+m.msg: "";
        if (m.msg) dbrec.m=m.msg; if (m.err) dbrec.e=m.err; if (m.i) dbrec.i=m.i;
        let ni = (task.savedinfo.next_starttime != task.next_starttime) ? `. Next start at ${nexttime2str(task.next_starttime)}.`:""; 
        task.savedinfo.next_starttime = task.next_starttime;
        let logs= (m.err) ? `<${m.where}>${tpi}.Error:${m.err}.${ni}` 
            : `<${m.where}>${tpi}${lmsg}.${fi}${ni}`;
        this.task_log(task , logs );
        if (this.cfg.TaskHistoryFormat) 
            this.append_formatlog( task, dbrec )

        return logs;
    }
    task_log( task:SchedTask , ...oargs: any[] ){
        let args = [`[${(new Date()).toLocaleString("ru-RU")}]`].concat(oargs);
        const fname = path.join( this.ScheluderSettings.JournalPath  , this.gettask_logfilename(task));
        mlog.doFLog(fname, ...args);   
        //console.log(...args);        
        mlog.log(`Task(${task.entry.Name} ${task.entry.Id})`,...oargs);
    }
    logtask_error( task:SchedTask , where:eTaskWhen ,initator:eTOInitiator , err:string ):string{
        let s= this.task_logf( task , {where:where,err:err,i:initator} );
        return s;
    }    
    
    test_taskIds( at?: string[] ) : any {
        if (at) { let aerror=[]; let ids=[]; let tasks=[]; //let ret={ ids:string[], tasks:[]  }; 
            for (let id of at ) { 
                let t = this.tasks[id]; 
                if (!t) { aerror.push(id) } else { ids.push(id); tasks.push(t);}
            };
            let ret:any = { ids:ids , tasks:tasks, error:aerror.join(',') };
            if (!ids.length) { delete ret.ids; delete ret.tasks; }
            return ret;
        }    
        return {};
    }

    //, iniator:cTaskOperationInitiator
    async StopExecute( at:(SchedTask | string)[] | undefined , initator:eTOInitiator ):Promise<any>{
        let errs=0; //let resa:SchedTask[]=[]; 
        if (!at) { at=[]; for (let id in this.current_execute){ 
            let task = this.current_execute[id];if (task.isexecute()) at.push(task.entry.Id); }
            if (at.length) mlog.log("try stop execute all!:",at)
        }
        let atop:cTaskOperation[]=[]; let prA:Promise<any>[]=[];
        let self=this;
        function oncompletion(task:SchedTask , top:cTaskOperation, err?:string ){ 
            delete self.current_execute[task.entry.Id];
            task.state = eTaskState.NotRun;
            if (err) top.error = `Task ${top.tid} error at stoping.`;
            if (!err) {
                self.task_logf( task , {where:eTaskWhen.Completed , i:eTOInitiator.Manual ,msg: top.msg });    

                //self.task_log( task ,"Stopped task. Next start at ", task.next_starttime, "\n Result in", task.curr_file );
            } else {    
                self.logtask_error( task , eTaskWhen.TryEnds , initator , err );    
                //self.logtask_error( task ,"Try stop:", err,"Next start at ", task.next_starttime );
            }    
            self.do_NotyifyChange("stop", task.entry.Id );
        }
        for (let i of at) {  
            let r:cTaskOperation={  }; atop.push(r); prA.push(mutils.MakePromiseAny(r));
            let task:SchedTask = typeof(i)=="string" ? this.tasks[i] : i;
            if (!task) { r.tid=String(i); r.error=`Try stop: Invalid task ID ${i}`; continue; }
            r.tid = task.entry.Id;
            if (!this.taskcmd.itc) { r.error=this.logtask_error( task , eTaskWhen.TryEnds , initator , "Ivalid redirector for task operations" ); continue; }
            if (!task.isexecute()) { r.error=self.logtask_error( task , eTaskWhen.TryEnds , initator,"Task  not running" ); continue; }
            if (task.state == eTaskState.PendingEnd) 
                { r.error=self.logtask_error( task , eTaskWhen.TryEnds, initator, "task already in pending stopped" );continue; }
            task.state = eTaskState.PendingEnd;
            task.recalc_NextStart();     

            if (task.called && this.taskcmd.itc) {
                this.task_logf( task , {where:eTaskWhen.TryEnds,i:initator});
                let q = this.taskcmd.itc.stop_capturetask( r , task.called  );
                delete task.called;
                q.then( value=>{ oncompletion(task , r  )} , error=>{ oncompletion(task ,r,error) } );
                //q.catch( ()=>{ oncompletion(task ,r," ");} )
                //try { await q; } catch { q =mutils.MakePromiseAny(r); }
                prA[prA.length-1] = q ;
            } else oncompletion(task,r);    

        } 
        return Promise.all(prA);
        //return errs==0;
    }    

    async StartExecute(inta:(SchedTask | string)[] , initator:eTOInitiator ):Promise<any>{
        let res:cTaskOperation[]=[]; let prA:Promise<any>[]=[];
        let self=this; let count=0;
        //let TryStart= initator==eTOInitiator.Manual ? eTaskWhen.TryStartManual : eTaskWhen.TryStart;
        function starttack_promisehandler( task:SchedTask, to:cTaskOperation , error?:string   ){
            error = !error ?  to.error :  error+(to.error?" "+to.error:"");
            if (error) {
                if (!error.trim()) { error=" general failure on start task" }
                delete self.current_execute[task.entry.Id];
                task.state = eTaskState.NotRun;
                self.logtask_error( task , eTaskWhen.TryStart, initator, "Reject-"+ error );
                to.error = `TASK(${to.tid}) ${error}`;
            }else {
                task.state = eTaskState.Running; 
                self.task_logf( task , { i:initator, where:eTaskWhen.Started  , msg:to.msg  } );
            }   
            self.do_NotyifyChange("start", task.entry.Id );

        }
        for (let i of inta){
            let task:SchedTask = typeof i == "string" ? this.tasks[i] : i;
            let r:cTaskOperation={  }; res.push(r); prA.push(mutils.MakePromiseAny(r));
            //r.msg="test start";
            if (!task) { r.tid=String(i); r.error=`Try start : Invalid task ID ${i}`; continue; }
            r.source ={ cameraId : task.entry.Camera, Camera_PresetID: task.entry.Camera_PresetID };
            r.tid = task.entry.Id;
            if (task.isexecute()) { r.error=this.logtask_error(task,eTaskWhen.TryStart,initator, "Start not allowed, task is running" ); continue; }         
            if (!this.taskcmd.itc) { r.error=this.logtask_error(task,eTaskWhen.TryStart,initator,  "Ivalid redirector for task operations" ); continue; }
            if ( count && !this.AllowedMultipleOperations) { r.error=this.logtask_error( task , eTaskWhen.TryStart,initator, "Multiple task start is disabled" ); continue; }
            count++;
            await this.StopExecute(undefined,initator); 
            //await this.StopExecute_task([task]);
            this.current_execute[task.entry.Id] = task;
            task.last_starttime = mutils.getUnixTime() //task.next_starttime;
            task.curr_duration = task.next_duration;
            task.cnt_calls++;

            r.pending = true;
            task.state = eTaskState.PendingStart;

            let file= mutils.unixtime2ISOLocalStr().replace(/[-:]/g,"");
            //new Date().toISOString().split('.')[0].replace(/[-:]/g,"");
            r.file = task.curr_file= file=this.taskcmd.itc.makecapture_filename_fortask( `d${file}.${task.entry.FileTemplate}` );
            try {
                task.called = this.taskcmd.itc.start_capturetask( r  );
                //task.called.catch( error =>{ starttack_promisehandler(task,r,"throw: "+error); })
                task.called.then((value)=>{ starttack_promisehandler(task,r) } , error =>{ starttack_promisehandler(task,r,"throw: "+error)} )
                //await task.called;
                prA[prA.length-1] = task.called ;
            } catch (e) {
                prA[prA.length-1] = mutils.MakePromiseAny(r) ;
                //starttack_promisehandler(task, r , "Internal error: "+e );  count--;
            };   
        }
        //console.log("--------------1")
        //let prAl=Promise.all(prA); prAl.catch( error=>{} );
        return Promise.all(prA);
    }    // END of StartExecute
    async OnTimer(){
        //return;
        try {
        this.lock_NotyifyChange(1);    
        let now = this.history.lastRunTime = mutils.getUnixTime();
        if (this.ScheluderSettings.DebugOutput?.Timer)
            console.log("... SchedulerService.OnTimer ", now );
        await this.StopExecute( this.getReadyEndTaskList() , eTOInitiator.Auto );
        let ready_t = this.getReadyStartTaskList();
        let af:SchedTask[] =[]; 
        for(let task of ready_t) if (task.next_starttime+task.next_duration < now) {
            task.recalc_NextStart( )
            this.logtask_error( task , eTaskWhen.TryStart, eTOInitiator.Auto, "Reject => time missed" );
        } else af.push(task)

        //ready_t.filter( task=> task.next_starttime+task.next_duration < now )
        //    .forEach(task=>this.logtask_error( task , "Try start: Reject => time missed"));
        //let af=ready_t.filter( task=> task.next_starttime+task.next_duration > now )

        await this.StartExecute(af,eTOInitiator.Auto);
        af.forEach( task=> task.recalc_NextStart( ) );
        //console.log("... SchedulerService.OnTimer CHECK STOP END ", now );
        //await this.StopExecute_task( this.getReadyEndTaskList() );
        } finally { this.lock_NotyifyChange(-1); }
    }
    
}
