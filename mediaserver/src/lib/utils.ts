// Модуль utils.ts содержит:
// различные вспомогательные функции которые могут использоваться в других модулях программы

import url from "url";

export type unixtime = number;
export class cNoCopyNoJSON {
    toJSON() { return {} };
    disableCLONE(): boolean { return true };
}
export class hNoCopy<Etype> extends cNoCopyNoJSON {
    itc?: Etype;
    constructor(itc?: Etype) { super(); this.itc = itc; }
}


export enum eErrorAction { Throw, Continue, Break, Warning }

export type DictionarySA = { [key: string]: any };
export function getUnixTimeMs() {
    return (new Date()).valueOf();
}
export function getUnixTime():unixtime {
    return Math.floor(getUnixTimeMs() / 1000);
}

export function containsA(testdata: any, array: any[]): boolean {
    return array.indexOf(testdata) >= 0;
}

export function MakePromise(): Promise<any> { return Promise.all([]); }
export function MakePromiseAny(d: any): Promise<any> { return d; }

let re_Integer = /^\s*-?\s*\d+\s*$/
let re_Number = /^\s*-?\s*\d+(\.\d*)?(E-?\d+)?\s*$/
export function isInteger(v: string): boolean {
    return v.match(re_Integer) ? true : false
}
export function isNumberStr(v: string): boolean {
    return v.match(re_Number) ? true : false
}
export function getErrorMessage(e: any): string {
    return (e == undefined && e == null) ? ""
        : typeof (e) != "object" ? String(e)
            : "message" in e ? e.message
                : "error" in e ? e.error
                    : String(e);
}

export function convolutionarray<Tp>(...ar: Tp[]): Tp[] {
    let s = new Set(ar); let res: Tp[] = [];
    s.forEach(v => res.push(v));
    return res;
}

export function testInvalidStrParamsFromAny<Tp>(q: any, template: Tp, throwMess = ""): [Tp, string[]] {
    let res: Tp = {} as Tp; let errs: string[] = []; let anyerr: string[] = [];
    for (let n in q) {
        let qv = q[n]
        if (!(n in template)) { errs.push(n); continue; }
        if (Array.isArray(qv)) throw Error(`${throwMess} Parametr ${n} must be string (not  array) `);
        let tv = (template as any)[n]
        switch (typeof (tv)) {
            case "number": if (!isNumberStr(qv)) anyerr.push(`Param ${n} must be a number value`)
                qv = Number(qv)
                break;
        }
        (res as any)[n] = qv;
    }
    if (errs.length && throwMess)
        throw Error(`${throwMess} Unexpected parametrs: ${errs}`);
    if (anyerr.length && throwMess)
        throw Error(`${throwMess}  ${anyerr.join('. ')}`);
    errs = errs.concat(anyerr);
    return [res, errs];
}
//export function HttpParamsToParams<Tp>( q:url.UrlWithParsedQuery , template:Tp , throwMess="" ):[Tp,string[]] {
export function HttpParamsToParams<Tp>(q: url.UrlWithParsedQuery, template: Tp, throwMess = ""): [Tp, string[]] {

    let [r, e] = testInvalidStrParamsFromAny(q.query, template, throwMess);
    for (let n in r) if (typeof r[n] == "string") (r as any)[n] = decodeURIComponent((r as any)[n])
    return [r, e];
}

export function catarrays<Tp>(...args: (Tp[] | Tp)[]): Tp[] {
    let res: Tp[] = [];
    for (let a of args) res = res.concat(a);
    return res;
}

export function trunctag(calcV: number, newV: number): number {
    return newV > calcV ? -1 : newV < calcV ? 1 : 0
}

export class Event {
    private efun: any
    private wh: Promise<any>
    constructor() {
        this.wh = new Promise(r => this.efun = r)
    }
    async wait() { return this.wh }
    signal(d: any) {
        this.efun(d);
        this.wh = new Promise(r => this.efun = r)
    }
}

export class cTimer extends cNoCopyNoJSON {
    //'www':number;
    timer?: NodeJS.Timeout;
    interval: number = 0;
    constructor(callback?: (...args: any[]) => void, ms?: number) {
        super();
        if (!callback || !ms) return;
        this.Start(callback, ms);
    }
    Start(callback: (...args: any[]) => void, ms: number) {
        this.Stop();
        this.timer = setInterval(callback, ms)
    };
    Stop() {
        if (this.timer) clearInterval(this.timer);
        delete this.timer;
    }
    Active(): boolean { return this.timer ? true : false; }
}



export async function wait(ms?: number) {
    if (ms)
        await new Promise(r => setTimeout(r, ms));
    else
        await new Promise(r => setImmediate(r));
}

export function set_has<Tp>(a: Tp[], s: Set<Tp>): Tp[] | undefined {
    let ret = a.filter(x => s.has(x))
    if (ret.length) return ret
    return;
}


export function TrivialCloneObject(src: any): any {
    if (typeof src === "object") {
        let res: any = Array.isArray(src) ? [] : {};
        for (let f in src) {
            let v = src[f]; let nv: any;
            if (typeof v === "object") {
                if ('disableCLONE' in v) continue;
                nv = TrivialCloneObject(v);
            } else nv = v;
            res[f] = nv;
            //if (Array.isArray(src)) res.push(nv); else res[f] = nv;
            //res[f] = typeof v === "object" ? TrivialCloneObject( v ) : v;
        };
        return res;
    } else {
        return src;
    }
}

export function typedCopy<T>(dst: T, src: T) {
    for (let k in src)
        dst[k] = src[k];
}
export function AnyCopyTo(dst: any, src: any): any {
    if (typeof (dst) == "object") {
        if (Array.isArray(dst)) dst = []; //= []
        for (let k in src)
            dst[k] = AnyCopyTo(dst[k], src[k]);
        return dst;
    } else
        return TrivialCloneObject(src);
}

export function FindFieldsByName(obj: any, findnm: string): { p: string, v: any }[] {
    let res: { p: string, v: any }[] = [];
    function fori(obj: any, p: string) {
        for (let n in obj) {
            if (n == findnm) { res.push({ p, v: obj[n] }); }
            if (typeof obj[n] == "object")
                fori(obj[n], p + (p ? '/' : '') + n);
        }
    }
    fori(obj, '');
    return res;
}

export function DeleteFieldFromObj<TObj>(obj: TObj, ...fields: (keyof TObj)[]) {
    for (let nf of fields) {
        delete obj[nf];
    }
}

export function DeleteFieldFromObj__(fr: any, fieldpath: string[]): any {
    let o = fr as DictionarySA;
    for (let ffn of fieldpath) {
        let afn = ffn.split('/');
        let obj = o; let lastnm = afn.pop(); let err = 0;
        if (!lastnm) continue;
        for (let fn of afn)
            if (obj && typeof (obj) == "object") obj = obj[fn] as DictionarySA;
            else { err++; break }
        if (!err)
            delete obj[lastnm]

    }
    return fr;
}

export function getObjPropertyByPath( obj:any , path:string , dothrow:boolean=false ):any{
    let a= path.split(/\/+|\\+/);
    for (let n of a){
        if ( typeof(obj)!="object")  { 
          if (dothrow) throw "Invalid path "+path;
          return;
        }  
        obj = obj[n];
    }
    return obj;
}

export function CopyUnDefinedFileds(dst: any, src: any): number {
    //let m:any={}; for (let f in dst) m[f]=1; 
    let cnt = 0;
    for (let f in src) {
        if (dst[f] == undefined) { dst[f] = src[f]; cnt++ }
    }
    return cnt;
}


export function minmax(v: number, minv: number, maxv: number) {
    return Math.min(maxv, Math.max(minv, v));
}


export function anyCopy_Exc(dst: any, src: any, excludes: any) {
    if (dst == undefined) dst = {};
    for (let k in src)
        if (!(k in excludes))
            dst[k] = src[k];
    return dst
}

