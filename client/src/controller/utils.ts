// Модуль utils.ts содержит:
// Вспомогательные функции, которые используются в различных файлах клиентской части

import * as iapi from "@gen_lib/api_interfaces";
import {APIResult} from "@gen_lib/api_interfaces";

import {unixtime,unixtimeMS} from "@gen_lib/api_interfaces";
//import {isError} from "@gen_lib/gen_functions";



export function getUnixTimeMs():unixtimeMS {
    return (new Date()).valueOf();
}
export function getUnixTime():unixtime {
    return Math.floor((new Date()).valueOf() / 1000);
}

export function isError(e:any): e is Error {
    return isObject(e) &&
        (objectToString(e) === '[object Error]' || e instanceof Error);
}

export function isObject(arg:any):boolean {
    return typeof arg === 'object' && arg !== null;
}


export function objectToString(o:string):string {
    return Object.prototype.toString.call(o);
}
//function 

export async function wait(ms?: number) {
    if (ms)
        await new Promise(r => setTimeout(r, ms));
    else
        await new Promise(r => setImmediate(r));
}


export function pathjoin (sep: string , ...vals: string[] ): string {
    let v= vals.join(sep);
    const rs = sep+sep;
    while (true) {
        let oldv = v;
        v = v.replace( rs , sep);
        if (v===oldv) return v;
    };
}

export function isRoot (p: string): boolean {
    return p === "/" || p.endsWith(":") || p.endsWith(":\\");
}     
/*
export interface APIResult {
    result?: any;
    //error?: Error;
    error?: string;

}
*/
export function MakeError( e:Error|string):Error{
    if (isError(e)) return e
    return Error(e)
}


export async function callServer( qpath:string , fun: string): Promise<APIResult> {
    const r = await fetch( qpath ).catch((e) => Error(e));
    const res = await getJSON(r, fun );
    return res
}


export async function getJSON(r: Error | Response, fun: string): Promise<APIResult> {
    if (isError(r)) {
        console.error(`${fun}:`, r);
        return {error: r.message };
    }
    const res = (await r.json()) as APIResult;
    if (res.error) {
        console.error(`${fun}:`, res.error);
        //return {error: Error(res.error)};
        return res;//{error: res.error};
    }
    console.log(`${fun}:`, res);
    return res; //{result: res.result};
}

export async function getRawData(r: Error | Response, fun: string): Promise<string> {
    if (isError(r)) {
        console.error(`${fun}:`, r);
        return r.message;
    }
    const res = await r.text();
    console.log(`${fun}:`, res);
    return res;
}

//this implementation is slow, but we don't expect to call it frequently
export function createUUID() {
    let dt = Date.now();
    let uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (dt + Math.random()*16)%16 | 0;
        dt = Math.floor(dt/16);
        return (c=='x' ? r :(r&0x3|0x8)).toString(16);
    });
    return uuid;
}

export function makeUri( cmdpath:string, data:any  ){
    let arr=[]
    for (let k in data ) {
        arr.push(`${k}=${encodeURIComponent(data[k])}`)
    }
    if (!arr.length) return cmdpath;
    return `${cmdpath}?${arr.join("&")}`
}

type Callback = (r: APIResult ) => void;

export class LongPolling {
    private cbs_: Callback[] = [];
    private id = '_' + Math.random().toString(36).substr(2, 9) + (new Date).valueOf();

    subscribe(cb: Callback) {
        this.cbs_.push(cb);
    }

    run() {
        const self = this;
        fetch(`/cmd/pollingstate?sessionid=${this.id}`).then(
            async result => {
                const r = await getJSON(result, "LongPolling.run");
                if (!r.error) {
                    for (const cb of this.cbs_) {
                        try {
                            cb(r);
                        }
                        catch(e) {
                            console.error("LongPolling.run", e);
                        }
                    }
                } else {
                    console.error("LongPolling.run", r.error);
                }
                self.run();
            },
            error => {
                console.error("LongPolling.run", error);
                self.run();
            });
    }
}