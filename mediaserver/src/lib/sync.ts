// Модуль sync.ts содержит:
// Примитивы синхронизации Timer , Sleep , Mutex и др.

export function promise_any( ...na:Promise<any>[]) {
    let pp=new Promise( (res,rej)=> {
        for (let p of na ) {
            p.then( v => {  res(v); },
                    vr =>  {  rej(vr); } 
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
                await new Promise(r => setTimeout(r, 10));
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
