//import { lemonchiffon } from "color-name";
import { SIGQUIT } from "constants";
import { watchFile } from "fs";
import net from "net";
import * as UConference from "./UConference";
import * as mutils from "./utils";
import * as msync from "./sync";
import {unixtime}  from "./utils";

type rConferenceState=UConference.rConferenceState
type rCallInfo=UConference.rCallInfo;
type rAdressBookRecord=UConference.rAdressBookRecord;
type tCallStatus= UConference.tCallStatus
type IConferenceDeviceInfo=UConference.IConferenceDeviceInfo



interface iSocketTelnet {
    readonly port:number 
    readonly host:string
    user_tag:any;
    read():string[];
    write(data:string):void;
    reconnect(addr?:string):void;
    close():void;
    getaddress():string;
}   

type tcb_SocketRD= ( src:iSocketTelnet )=> void;
export class SocketTelnet implements iSocketTelnet{
    port:number=0; 
    host:string=""
    inputbuffer:string[]=[];
    socket: net.Socket|null = null; 
    user_tag:any=undefined;
    own_onrecieve?: tcb_SocketRD;    
    own_reconnect?: tcb_SocketRD;    
    constructor ( address:string , own_onrecieve?: tcb_SocketRD , own_reconnect?:tcb_SocketRD ){
        this.own_onrecieve = own_onrecieve;
        this.own_reconnect = own_reconnect;
        this.reconnect(address);
    }
    getaddress():string{
        return `${this.host}:${this.port}`;
    }
    private onrecieve(buff:Buffer){
        this.inputbuffer.push( buff.toString() );
        if (this.own_onrecieve)
            this.own_onrecieve( this );
    }
    read():string[]{
        let res = this.inputbuffer;
        this.inputbuffer=[];
        return res;
    };
    write(data:string):void{
        if (!this.socket) return;
        this.socket.write(data);
    };
    close():void{
        if (this.socket) {
            this.socket.destroy()
        }
        this.socket = null;
    };
    reconnect(address?:string):void{
        if (address) {
            let m= address.split(":"); 
            this.port=Number(m[1])
            this.host=m[0].trim();
        }

        this.close();
        this.socket = new net.Socket();
        this.socket.connect(this.port, this.host );
        this.socket.on("data", (buff)=>{ this.onrecieve(buff) } )
        if (this.own_reconnect) 
            this.own_reconnect( this );
    };
}

type t_time_milisecond = number;
interface tAnswerStr { type:"error"|"info"|"data"|"timeout"; data:string; dataa:string[] } 
interface tAnswerControl { 
    cnt?:number
    endof?:string[];  
    endOfRE?:string; // regexp
    waitEndAlways?: boolean
    timeout?: t_time_milisecond
 } 

class CallInfoStorage{
    //list : rCallInfo[] 
    strg : {[key in string|number]: rCallInfo }={}
    history:rCallInfo[]=[];
    FreeLost(cia:rCallInfo[]):rCallInfo[] {
        let ss : {[key in string|number]: rCallInfo }={}
        for (let ci of cia ) ss[ci.call_id] = ci;
        let all = this.Get()
        let res:rCallInfo[]=[]
        for (let ci of all) if (!ss[ci.call_id]) {
            res.push(ci); 
            this.Delete(ci);
        }
        return res;
    }
    Delete( ci:rCallInfo):number { 
        ci=this.strg[ci.call_id];
        if (!ci) return 0;
        delete this.strg[ci.call_id] 
        this.history.push(ci);
        return 1;
    }
    Update( ci:rCallInfo, nonew?:boolean):[rCallInfo,number] { 
        let changes=0
        let curr = this.strg[ci.call_id];
        if (curr) for (let k in ci) {
            if ((curr as any)[k] != (ci as any)[k]) changes++;
            (curr as any)[k] = (ci as any)[k]
        } else { 
            curr=ci 
            if (!nonew) {
                this.strg[ci.call_id] = ci; 
                changes++;
            }    
        }

        return [curr,changes];
    }
    Get():rCallInfo[] {
        return Object.values( this.strg );
    }
} 
class Storage_Book{
    //list : rCallInfo[] 
    index : {[key in string]: rAdressBookRecord }={}
    strg : rAdressBookRecord[] = []
    UpdateAll( book:rAdressBookRecord[]){ 
        //this.strg = book;
        this.index={}; this.strg=[];
        for (let b of book) {
            this.strg.push(b);
            if (b.H_ADDRESS) this.index[b.H_ADDRESS]=b; 
            if (b.Name ) this.index[b.Name]=b; 
        }
    }
    Find( searchstr:string ):rAdressBookRecord|undefined{
        let res= this.index[searchstr];
        return res;
    }
} 

export class Control implements UConference.IConference {
 //   private port_: serial.Port | null = null;
 //   private mut_: Mutex;
 //   private afv_ = true;
 //   private presets_: PresetsList = {};
 //   private maxPresetID_ = -1;
    cfg : UConference.rConferenceConfig
    port: iSocketTelnet
    rdbuff:string[]=[];
    notify_buff:string[]=[];
    //stdcmd_TimeOut=1000;
    //list_calls:{[key in string]: rCallInfo}={}
    //history_calls:rCallInfo[]=[];
    //book_byip:{[key in string]: rAdressBookRecord}={}
    //book = UConference.makestrg_AddressBook();
    //calls = UConference.makestrg_CallInfo()
    calls = new CallInfoStorage()
    book = new Storage_Book();
    mutex: msync.Mutex = new msync.Mutex();
    devInfo:IConferenceDeviceInfo={EnabledService:[]}
    fNotify?: UConference.f_notify
    //type Table = {[key in number]: number};

constructor(  cfg : UConference.rConferenceConfig )   {
    this.cfg =cfg;
    if (!cfg.StdTimeOut) cfg.StdTimeOut=1000;
    if (!cfg.StdHistoryCallWindow) cfg.StdHistoryCallWindow=50;
    this.port = new SocketTelnet( cfg.ControlAddress , 
            (src)=>{  this.handleinput(src) } , 
            (src)=>{  this.handleReconnect(src) }  
            )
    //this.port.write("echo //off\n" );
} 
set_notify( n: UConference.f_notify){
    this.fNotify = n;
};
log(...args: any[]) { 
    if (!this.cfg.DebugOutput) return;
    console.log( ...args); 
}
logm(...args: any[]) { 
    console.log( ...args); 
}
logw(...args: any[]) { 
    console.log( ...args); 
}

private UpdateCallInfo( ci: rCallInfo ):rCallInfo {
    //let nocopyKeys:(keyof rCallInfo)[]=["tmStartRing","tmStartCall","tmEndCall","address"] ;
    //let re=/\w+ @ \d+\.\d/; //Rostov @ 10.1.0.84
    let call_Finished = ( ci.callstatus == "disconnected" || ci.callstatus == "inactive" );
    if (ci.address) {
        let sad= ci.address.split("@");
        if (sad.length>1) {
            ci.address = sad[1].trim();
            ci.bookName = sad[0].trim();
        }
        if (!ci.bookName || ci.bookName.trim()=="" ) {
            let b = this.book.Find( ci.address );
            if (b) ci.bookName = b.Name
        }
    }   
    let cntchanges=0; 
    [ci,cntchanges] = this.calls.Update(ci , call_Finished);
    if (!call_Finished) {
        if (!ci.tmStartRing ) { 
            ci.tmStartRing = mutils.getUnixTime();
            cntchanges++
        }    
        if ( ci.callstatus == "connected" &&  !ci.tmStartCall  ) {
            ci.tmStartCall=mutils.getUnixTime();
            cntchanges++
        }    
    } else {
        // save history
        ci.tmEndCall = mutils.getUnixTime();
        cntchanges += this.calls.Delete( ci );
    } 
    if (this.fNotify && cntchanges>0) 
        this.fNotify( this , { calls:this.calls.Get() } );
    //ci.tmStartCall
return ci;
}
private HandleNotification( s:string ){
    this.notify_buff.push(s);
    let aa =  s.split(":");
    let notify_tp = aa[1];
    switch (notify_tp) {
        case "callstatus": {
            //notification:callstatus:<calldirection>:<call id>:<far sitename>:<far sitenumber>:<connectionstatus>:<callspeed>:<status-specific causecode from call engine>:<calltype>    
            let ci: rCallInfo={
            calldirection:aa[2],
            call_id:Number(aa[3]), // videocall
            address:aa[4],
            callstatus:aa[6] as tCallStatus,
            call_speed:Number(aa[7]),
            call_speccode:Number(aa[8]),
            call_type:aa[9], // videocall
            };
            this.UpdateCallInfo(ci );
            break;
        }
        case "linestatus": {
            //notification:linestatus:<direction>:<call id>:<line id>:<channelid>:<connection status>        
            let ci: rCallInfo={
            calldirection:aa[2],
            call_id:Number(aa[4]), // line id
            address:aa[3],
            callstatus:aa[7] as tCallStatus,
            };
            this.UpdateCallInfo(ci );
            break;
        }
        case "mutestatus": { //notification:mutestatus:far:5:Rostov:10.1.0.84:notmuted
            if (aa[2]=="near") break; // статус локального микрофона
            if (aa[2]!="far") break; // 
            let ci: rCallInfo={
                call_id:Number(aa[3]), // line id
                //bookName:aa[4],
                address:aa[5],
                call_muted:aa[6]=="muted",
                };
                this.UpdateCallInfo(ci );
                break;
        }    
    }    
}    

private handleReconnect( socket:iSocketTelnet ){
    socket.user_tag=undefined;
    this.logm(`Connect to ${socket.getaddress()}`);
}   
private handleinput( socket:iSocketTelnet ){
    let l = this.port.read()
    for (let pack of l){
        //pack = pack.trim();
        //this.log("conf.handleinput.packet<<",pack,"--",socket.user_tag);
        let ll= pack.split("\n");
        for ( let s of ll){
            s=s.trim();
            if (s=="" || s=="->") continue;
            this.log("conf.handleinput<<",s);
            if (s.startsWith("notification:")) 
                this.HandleNotification(s)
            else this.rdbuff.push(s);
        }
    }

}


private async WaitAns( timeout?:number ):Promise<string|undefined>{
    timeout = timeout ? timeout : this.cfg.StdTimeOut
    let tom_stp = 10 , tom=tom_stp;
    while (this.rdbuff.length==0 && tom<timeout ) { await msync.wait(tom_stp); tom+=tom_stp;}
    if (this.rdbuff.length==0) return undefined;
    let d= this.rdbuff[0]; this.rdbuff=this.rdbuff.slice(1);
    return d;
}    

private async ReadAns(timeout?:number):Promise<tAnswerStr>{
    let d= await this.WaitAns(timeout);
    if (d==undefined) return {type:"timeout",data:"",dataa:[]};
    let res:tAnswerStr={ type:"data", data: d,dataa:[]}
    if ( d.startsWith("error:")) {
        res.type="error";
    } else if ( d.startsWith("info:")) {
        res.type="info";
    }    
    if (res.type!="data") {
        res.data=d.split(":").slice(1).join(":")
    }
    return res;
}
private async Enter() { await this.mutex.lock() }
private Leave() { this.mutex.unlock() }
async IntCommand(cmd: string , ac? : tAnswerControl ): Promise<tAnswerStr>{    
    await this.Enter()
    try{
    if (this.rdbuff.length>0)  this.logm("в приемном буффере остались данные")  
    this.rdbuff.splice(0);    
    this.log("send command>>",cmd);
    this.port.write( cmd+"\n" );

    //let ac:tAnswerControl={};
    //ac.endof = _ac?.endof;
    //ac.endOfRE = _ac?.endOfRE;
    //ac.cnt = _ac && _ac.cnt ?  _ac.cnt : ( ac.endof || ac.endOfRE ? undefined : 1 );
    if (!ac) ac={}
    ac.cnt = ac && ac.cnt ?  ac.cnt : ( ac.endof || ac.endOfRE ? undefined : 1 );

    let eofs:any = {}; 
    if (ac.endof) for (let aeof of ac.endof ) { eofs[aeof]=1; }
    let ans=[];
    for (let k=0;ac.cnt==undefined || k<ac.cnt;k++) {
        let r:tAnswerStr=await this.ReadAns( ac.timeout )
        //this.log("IntCommand.RA:",r,eofs[r.data]);
        if (r.type=="timeout") { throw "Timeout!"}
        if (r.type=="error") { throw r; return r; }
        //if (r.type=="info" && !ac.waitEndAlways ) { r.dataa = ans; return r; }
        ans.push(r.data);
        if (r.data in eofs) break;
        if (r.type=="info" && !ac.waitEndAlways ) { break; }
    }
    let res:tAnswerStr={ type:"data", data:ans.join("\n"), dataa:ans };
    //this.log("IntCommand.Exit:",ac,res);
    return res;

    } finally{ this.Leave(); }
}    
async noLimCommand( cmd:string ):Promise<tAnswerStr>{
    let r=await this.IntCommand(cmd+"\necho #endcmd#",{  waitEndAlways:true, endof:["#endcmd#"]  });
    r.dataa = r.dataa.slice(0,r.dataa.length-1)
    r.data = r.dataa.join("\n")
    return r;
}


async Command(cmd: string , testResult?:any): Promise<object>{    
    
    try{ await this.Enter()
    this.port.write( cmd+"\n" );

    return {}; 
    } finally { this.Leave() }
}
 async CallTo( dest: string ): Promise<object>{

    let ipr=mutils.parseIPproto(dest)
    if (ipr && ipr.ip) {
        //dial auto 10.1.0.84 << dialing manual
        let r=await this.IntCommand("dial auto "+ipr.ip,{ timeout:4000 });
        if (r.data!="dialing manual") 
            throw `Неправильный адрес вызова ${ipr.ip}`;
    }else {
    //dial addressbook rostov << dialing addressbook rostov | info: no match(s) found
        let r=await this.IntCommand("dial addressbook "+ dest.trim());
        if (r.type=="info") 
        throw `Неправильный имя вызова для адресной книги:${dest}`;
    }

    return {};
}
async  CallEnd( dest?: string ): Promise<object>{
    //hangup all
    //  hanging up all
    //  system is not in a call
    let r = await this.IntCommand("hangup all");
    if (!r.data.startsWith("hanging up")) 
        throw "Невозможно завершить разговор. Нет активных разговоров"

    //hangup video <callid>
    //  error: connection 1 is not active
    //  hanging up video
    return {};
}
async  CallAns( dest: string ): Promise<object>{
    //answer video
    //answer incoming video call failed
    //answer incoming video call passed    
    let r = await this.IntCommand("answer video");
    if (-1==r.data.search("passed") ) {
        throw "Ошибка при попытке ответить на звонок";
    }
    return {};
}
async GetHistoryCalls( from:number , cnt?:number ): Promise<rConferenceState>{
    if (!cnt) cnt= this.cfg.StdHistoryCallWindow;
    let res:rConferenceState={
        calls_history:  this.calls.history.slice(from,cnt)
    };
    return res;
}

async  GetBook( filtr?:string):Promise<rConferenceState>{
    let abookcmd=( cc:string )=>{
        return this.IntCommand(cc ,{endof:[cc+" done"]});
    }
    let r= await abookcmd("addrbook all");
    if (!r.dataa) throw "Invalid answer for addrbook: empty list"
    r.dataa = r.dataa.slice(0,r.dataa.length-1);
    let re = /addrbook (\d+)\. ("[^"]+")(.+)/
    let reOpts = /h\d+_num:([^\s]+)|h\d+_spd:([^\s]+)|sip_num:([^\s]+)|sip_spd:([^\s]+)|h\d+_ext:[^\s]*/
    let unkOpts:any={}
    let abook: rAdressBookRecord[] = []
    for (let tar of r.dataa) {
        let reres = tar.match(re); 
        if (reres==null) throw "Error addrbook format"
        // 1 - ID , 2- name 
        let abr : rAdressBookRecord={ Name: reres[2] }
        let aopts=reres[3].trim().split(" ")
        for ( let ost of aopts){
            let oname = ost.split(':')[0];
            let most=ost.match(reOpts); if (most==null) { unkOpts[oname]=1; continue; }
            let k = most.findIndex( (v,i)=> i>0 && v!=undefined)
            switch (k) {
                case 1: abr.H_ADDRESS = most[k]; break;
                case 2: abr.H_speed  = most[k]; break;
                case 3: abr.SIP_ADDRESS  = most[k]; break;
                case 4: abr.sip_speed = most[k]; break;
            }
        }
        abook.push(abr);
    }
    if (Object.keys(unkOpts).length>0) {
        this.logw("Warning: invalid options", Object.keys(unkOpts))
    }

    // update local copy of book
    this.book.UpdateAll( abook );

    let st:rConferenceState={};
    st.Book = abook;
    return st;
}

async  GetState( force?:any ): Promise<rConferenceState>{
    if (force )
        return this.GetState_force()
    return { calls: this.calls.Get() }
}
async  GetState_force(  ): Promise<rConferenceState>{
    let st:rConferenceState={};
    let r=await this.IntCommand("callinfo all",{endof:["callinfo end","system is not in a call"]});
    let rlist:rCallInfo[]=[];
    if (r.dataa) {
         for (let k=1;k<r.dataa.length-1;k++) {
            let a= r.dataa[k].split(":");
            let ci : rCallInfo={
                callstatus:a[5] as tCallStatus, //opened,connecting,connected
                address: a[3], 
                //bookName:"",
                calldirection: a[7],
                call_speed: Number(a[4]),
                call_muted: a[6]=="muted", 
                call_id:Number(a[1]),
                call_type:a[8]
            };   
            ci=this.UpdateCallInfo(ci);
            //rlist.push(ci);
    }}

    //getcallstate
    //cs: call[3] speed[1024] dialstr[10.1.0.84] state[connecting]
    r=await this.noLimCommand("getcallstate");
    let replfield:{[key in string ]: (keyof rCallInfo)}={speed:"call_speed",dialstr:"address",state:"callstatus",call:"call_id"}
    for (let s of r.dataa) {
        if (!s.startsWith("cs:")) continue;
        let sa = s.split(" ").slice(1,);
        let ci : rCallInfo={ call_id:-1 };
        for (let ss of sa ) {
            if (ss=="inactive") { ci.callstatus="inactive"; continue };
            let ra=ss.match(/(\w+)\[(\w+)\]/)
            //this.log(`--${ss} = ${ra}`)
            if (!ra) continue;
            let v= ra[2]; if (v==undefined) continue;
            let f=replfield[ra[1]]; if (f==undefined) continue;
            (ci as any)[f] = v;
        }
        if (ci.call_id==-1) { 
            this.logw("Invalid answer for getcallstate (no call id):"+s)
            continue; }
        ci=this.UpdateCallInfo(ci);
        rlist.push(ci);
    }
    this.calls.FreeLost( rlist );    

    //r=await this.IntCommand("status");

    
    r=await this.IntCommand("notify");
    //registered for 2 notifications:callstatus:sysstatus
    //registered for 0 notifications:callstatus:sysstatus
    st.calls = this.calls.Get() ;
    return st;
}

async  GetRecentCalls(full?:any):Promise<rConferenceState> {
    let st:rConferenceState={};
    let r= await this.noLimCommand("recentcalls");
    //10.1.0.84    12/февр./2021 13:09:31  Out
    let fparceDT=( s:string ):unixtime|undefined =>{
        let re=/(\d+)\/(\p{L}+)\.?\/(\d+)\s+(\d\d):(\d\d):(\d\d)/u
        let da = s.match(re);
        if (!da) return;
        let m= mutils.MonthNameToNumber(da[2]);
        if (m==undefined) return; 
        let res= new Date( Number(da[3]),m, Number(da[1]) , Number(da[4]) , Number(da[5]),Number(da[6]) )
        //this.log(res.toLocaleString());
        return mutils.dt2UnixTime(res)
    };
    let cia:  rCallInfo[] = [];let idx: any = {};
    for (let s of r.dataa) {
        let da = s.split(/\s+/)
        let ci : rCallInfo={
            address : da[0],
            call_id:-1,
            tmStartCall : fparceDT(`${da[1]} ${da[2]}`),
            //Out, In ,Missed
        }
        if (ci.address && ci.tmStartCall  &&!(idx[ci.address])) { cia.push(ci);  idx[ci.address]=1; }
    }
    st.calls_history = cia;
    return st;    
}
private async cmd_notify( nfor:string[] ) {
    let aerrors=[];
    for ( let nf of nfor ) {
        let nc="notify"+ (nf ? " "+nf : "");
        let r=await this.IntCommand(nc, );
        if (r.type=="info") continue;
        if (r.data != nc + " success") 
            aerrors.push(nf)
    }
    if (aerrors.length>0)
        throw "Error on set notify: " + aerrors.join(",");
    //info: event/notification already active:sysstatus
    //notify sysstatus success
}
close(): void{
     this.port.close();
};
async getVersionInfo( ans? : tAnswerStr ):Promise<IConferenceDeviceInfo>{
    if (!ans) 
        ans = await this.noLimCommand("whoami");
    let di : IConferenceDeviceInfo={EnabledService:[] };    
    for (let s of ans.dataa) {
        let sa = s.split(":");
        if (sa.length<2 || !sa[1].trim()) continue;
        sa[0]=sa[0].trim();sa[1]=sa[1].trim();
        switch (sa[0]) {
            case "Model": di.Model = sa[1]; continue;
            case "Serial Number": di.SerialNumber= sa[1]; continue;
            case "Local Time is": di.LocalTime = sa.slice(1,).join(":"); continue;
        }
        let ma = sa[0].split(" ");
        if (ma.length==2 && ma[1]=="Enabled") 
            di.EnabledService.push(ma[0]);
    }   
    this.devInfo = di;
    return this.devInfo;
}

async async_initialize():Promise<any>{
    await this.getVersionInfo( await this.IntCommand("echo #start#",{endof:["#start#"]}) );
    //wait this.IntCommand("callstate get");
    await this.IntCommand("callstate unregister",{endof:["callstate unregistered"]});
    
    //await this.noLimCommand("getcallstate");
    
    
    // wait for "Hi, my name is"
    //return ;
    await this.cmd_notify(["callstatus","linestatus","mutestatus"]);
    await this.GetBook();
    await this.GetState(true);
    let di = this.devInfo;
    this.logm(`UPolycomRPG initialized. Model ${di.Model}; SN:${di.SerialNumber}; Srv:${di.EnabledService}; Time:${di.LocalTime} `)
    return {};
};
}    
