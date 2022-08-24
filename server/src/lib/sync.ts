// Модуль sync.ts содержит:
// Примитивы синхронизации Timer , Sleep , Mutex и др.

import * as mutils from "./utils";

export function promise_any( ...na:Promise<any>[]) {
    let pp=new Promise( (res,rej)=> {
        for (let p of na ) {
            p.then( v => { console.log("promse++then "+ v ); res(v); },
                    vr =>  { console.log("promse++then"+ vr ); rej(vr); } 
            )
            
        }
    })
    return pp;
}
export function promseTimeOut( toms:number, toresult:any, ...na:Promise<any>[]) {
    return promise_any( new Promise( r => setTimeout( ()=>{ r(toresult) },toms ) ) , ...na ) 
}


export async function wait(ms?: number) {
    if (ms)
        await new Promise(r => setTimeout(r, ms));
    else
        await new Promise(r => setImmediate(r));
}

export class cTimer extends mutils.cNoCopyNoJSON {
    //'www':number;
    timer?:NodeJS.Timeout ;
    interval:number=0;
    constructor(callback?: (...args: any[]) => void , ms?:number){
           super();    
           if (!callback || !ms) return;
           this.Start(callback ,ms);
    } 
    Start( callback: (...args: any[]) => void , ms:number ){
        this.Stop();
        this.timer=setInterval( callback , ms )
    };
    Stop() {
        if (this.timer) clearInterval( this.timer );
        delete this.timer;
    }
    Active(): boolean { return this.timer?true:false; }
}

export class Event{
    private efun:any
    private wh:Promise<any>    
    constructor (){
        this.wh = new Promise( r=> this.efun=r )
    }    
    async wait() { return this.wh }
    signal( d:any ) { 
        this.efun(d);
        this.wh = new Promise( r=> this.efun=r )    
     }
}

export class Mutex {
    private locked_: number = 0;
    private queue_: (() => void)[] = [];

    async lock(): Promise<void> {
        const self = this;
        const locked = this.locked_ > 0;
        this.locked_++;
        if (locked) return new Promise(r => self.queue_.push(r));
    }

    unlock() {
        const r = this.queue_.shift();
        this.locked_--;
        if (r) r();
    }
}

function test() {
    const mut = new Mutex();

    function mkfunc(text: string): () => void {
        return async () => {
            await mut.lock();
            for (let i = 0; i < 3; i++) {
                await wait(10)
                console.log(text)
            }
            mut.unlock();
        }
    }
    
    const f1 = mkfunc("F1");
    const f2 = mkfunc("F2");
    const f3 = mkfunc("F3");
    
    f2();
    f1();
    f3();
}
