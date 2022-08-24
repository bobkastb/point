type t_time = number;
type t_ip_address = string;

export type e_callstate = ("incRing"|"outRing"|"outRing_NAnswer"|"outRing_NoPing");
export type tCallStatus="ringing"|"connecting"|"connected"|"disconnecting"|"disconnected"|"inactive";
export interface rCallInfo {
    tmStartRing?:t_time;
    tmStartCall?:t_time;
    tmEndCall?:t_time;
    call_id:number;
    address?: string;
    //bookref?: rAdressBookRecord;
    bookName?: string;
    //ringstate:e_callstate;
    callstatus?:tCallStatus; //opened,connecting,connected,ringing
    calldirection?:string; //"outgoing"|"incoming";
    call_speed?:number;
    call_speccode?:number;
    call_type?:string; // videocall
    call_muted?:boolean; // its far mute
    ringstate_extra?:string;
}
export interface rAdressBookRecord {
    //{"id":"local:6","type":"SINGLE","displayName":"11, Rostov","firstName":"Rostov","lastName":"11","readOnly":false,"buddy":false,"email":"","homePhone":"","mobilePhone":"","workPhone":"","devices":[{"id":"6","name":"","addressList":[{"addressType":"IP_ADDRESS","number":"10.1.0.84","rate":"0","extension":null}]}],"fullName":""}
    //id:string; // number
    //type:string; // "SINGLE"
    Name:string;//firstName:string; lastName:string;
    H_ADDRESS?:t_ip_address; H_speed?:string; H_ext?:string;
    SIP_ADDRESS?:t_ip_address; sip_speed?:string
    email?:string;
}


export interface rConferenceState {
    what?:string;
    calls?: rCallInfo[]; // текущие разговоры
    Book?:rAdressBookRecord[];
    calls_history?: rCallInfo[];
}

export interface rConferenceConfig  {
    ID:string;
    ControlType: string;
    DisplayName?: string;
    Description?: string;
    ControlAddress: string; // "telnet://192.168.77.45:24"
    StdTimeOut:number; // 1000 ms
    StdHistoryCallWindow?:number; // 50 
    DebugOutput?:boolean
}

export interface IConferenceDeviceInfo {
    Model?:string
    SerialNumber?:string
    LocalTime?:string
    EnabledService:string[]
}   

export type f_notify = (sender:IConference, event:rConferenceState )=>void;

export interface IConference {
    Command(cmd: string , testResult?:any ): Promise<object>
    CallTo( dest: string ): Promise<object>
    CallEnd( dest?: string ): Promise<object>
    CallAns( dest: string ): Promise<object>
    GetBook( filtr?:string):Promise<rConferenceState>
    GetState( force?:any ): Promise<rConferenceState>
    GetRecentCalls( full?:any ): Promise<rConferenceState>
    GetHistoryCalls( from:number , cnt?:number ): Promise<rConferenceState>
    close(): void;
    async_initialize():Promise<any>;
    set_notify( n: f_notify):void;
};




interface tStorageEl<EType> { ref: EType; unikey:string };
class cStorage<EType>{
    list : {[key in string]: tStorageEl<EType>}={};   
    index : {[key in string]: tStorageEl<EType>}={}
    //list : {v:EType,key:string}[]=[];   
    //index : {[key in string]: EType}={}
    indexfield: (keyof EType)[]=[]; 
    nocopyField: {[key in string]: boolean }={}; 
    private _lastUnikeyNum=0;
    constructor (indexfield: (keyof EType)[] , nocopyField: (keyof EType)[] ) {
        this.indexfield =indexfield
        for ( let k of nocopyField ) 
            this.nocopyField[String(k)]=true;
    }
    private getNewUniKey() { this._lastUnikeyNum++; return "uk:"+String(this._lastUnikeyNum); }
    private DeleteIndexesOf( rec:tStorageEl<EType> ){
        for (let fld of this.indexfield ) {
            let fval= String( rec.ref[fld] );
            let ptr=this.index[fval]
            if (ptr.unikey==rec.unikey) 
                delete this.index[fval];
        }    
    }
    private InsertIndexesOf( rec:tStorageEl<EType> ){
        for (let fld of this.indexfield ) {
            let fval= String( rec.ref[fld] );
            this.index[fval] = rec
        }    
    }
    private newRec( erec:EType ){
        let rec: tStorageEl<EType> = { unikey:this.getNewUniKey() , ref:erec };
        this.list[rec.unikey] = rec;
        this.InsertIndexesOf( rec ) 
        return rec;   
    }
    Find( vid : string ):EType|undefined{
        let v=this.index[vid];
        return (v && v.ref) ? v.ref : undefined;
    }
    Delete( key :string ):boolean{
        let rec = this.index[key];
        if (!rec) return false
        this.DeleteIndexesOf(rec);
        delete this.list[rec.unikey]
        return true;
    }
    private UpdateRecordI( br :EType ):tStorageEl<EType>{
        let ptr:tStorageEl<EType>|undefined;
        for (let fld of this.indexfield ) {
            let fval= String( br[fld] );
            if (fval in this.index) { ptr=this.index[fval];  break; }
        }
        if (!ptr) { ptr = this.newRec(br); 
        } else {
            // to do check changes!
            this.DeleteIndexesOf( ptr );
            for (let fld in br ) 
                if (!this.nocopyField[fld])
                    (ptr.ref as any)[fld] = (br as any)[fld]
            this.InsertIndexesOf( ptr );
        }    
        return ptr;
    }
    UpdateRecord( br :EType ):EType{
        return this.UpdateRecordI(br).ref;
    }    
    UpdateAllRecord( abr :EType[] ){
        let clist : {[key in string]: tStorageEl<EType>}={}; 
        for (let rec of Object.values( this.list ) ) 
            clist[rec.unikey]=rec; 
        for (let br of abr) {
            let urec = this.UpdateRecordI( br );
            delete clist[urec.unikey];
        }
        for (let rec of Object.values( clist ) ) 
            delete this.list[rec.unikey]; 
    }

    
}

function makestrg_AddressBook():cStorage<rAdressBookRecord> {
    return new cStorage<rAdressBookRecord>(["Name","H_ADDRESS","SIP_ADDRESS"],[])
}
function makestrg_CallInfo():cStorage<rCallInfo> {
    return new cStorage<rCallInfo>(["call_id","address"] , ["tmStartRing","tmStartCall","tmEndCall","address"])
}


export class ConferenceAPI {
    obj:IConference;
    constructor( obj:IConference ){
        this.obj = obj;
    }
}

