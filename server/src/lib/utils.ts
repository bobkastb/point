// Модуль utils.ts содержит:
// Дополнительные функции широкого назначения используемые в различных файлах программы
import {isError} from "./gen_functions";
import url from "url";


export type unixtime = number; // unix time in second!!!
export type unixtimeMS = number; // unix time in millisecond!!!

export class cNoCopyNoJSON{
    toJSON(){ return {} };
    disableCLONE():boolean{ return true};
}
export class hNoCopy<Etype> extends cNoCopyNoJSON{
    itc? : Etype;
    constructor(itc? : Etype) { super(); this.itc = itc; }
}


export enum eErrorAction { Throw , Continue , Break , Warning }

export type DictionarySA = { [key:string]:any };
export function getUnixTimeMs():unixtimeMS{
    return (new Date()).valueOf();
}
export function getUnixTime():unixtime{
    return Math.floor( (new Date()).valueOf() / 1000 );
}

export function unixtime2ISOLocalStr(t?:unixtime):string{
    let tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
    let tn = t===undefined ? new Date().valueOf() : t*1000; 
    return (new Date(tn - tzoffset)).toISOString().split('.')[0]; //.slice(0, -1);    
}


export function containsA( testdata:any , array:any[] ):boolean{
 return array.indexOf(testdata)>=0;
}

export function MakePromise():Promise<any> { return Promise.all([]); }
export function MakePromiseAny(d:any):Promise<any> { return d; }

let re_Integer=/^\s*-?\s*\d+\s*$/
let re_Number=/^\s*-?\s*\d+(\.\d*)?(E-?\d+)?\s*$/
export function isInteger(v:string):boolean{
    return v.match(re_Integer)? true : false 
}
export function isNumberStr(v:string):boolean{
    return v.match(re_Number)? true : false 
}    
export function getErrorMessage(e:any):string{
    return (e==undefined && e==null) ? "" 
    : typeof(e)!="object" ? String(e) 
    : "message" in e ? e.message 
    : "error" in e ? e.error 
    : String(e) ;
}

export function convolutionarray<Tp>( ...ar:Tp[]):Tp[] {
    let s=new Set( ar ); let res:Tp[]=[];
    s.forEach(v=>res.push(v));
    return res;
}

export function testInvalidStrParamsFromAny<Tp>( q:any , template:Tp , throwMess="" ):[Tp,string[]] {
    let res:Tp={} as Tp; let errs:string[]=[]; let anyerr:string[]=[];
    for (let n in q) { let qv=q[n]
        if (!(n in template)) { errs.push(n); continue; }
        if (Array.isArray(qv)) throw Error(`${throwMess} Parametr ${n} must be string (not  array) `);
        let tv = (template as any)[n]
        switch (typeof( tv )) {
            case "number": if (!isNumberStr(qv)) anyerr.push(`Param ${n} must be a number value`)
                qv = Number(qv)
                break;
        } 
        (res as any)[n] = qv;
    }
    if (errs.length &&  throwMess) 
        throw Error(`${throwMess} Unexpected parametrs: ${errs}`);
    if (anyerr.length &&  throwMess) 
        throw Error(`${throwMess}  ${anyerr.join('. ')}`);
    errs=errs.concat( anyerr );    
    return [res,errs];
}
//export function HttpParamsToParams<Tp>( q:url.UrlWithParsedQuery , template:Tp , throwMess="" ):[Tp,string[]] {
export function HttpParamsToParams<Tp>( q:url.UrlWithParsedQuery , template:Tp , throwMess="" ):[Tp,string[]] {    
    
    let [r,e] = testInvalidStrParamsFromAny( q.query , template , throwMess );
    for (let n in r) if (typeof r[n]=="string") (r as any)[n] = decodeURIComponent(  (r as any)[n]   )
    return [r,e];
}    

export function catarrays<Tp>( ...args:(Tp[]|Tp)[] ):Tp[] {
    let res :Tp[] = [];
    for (let a of args) res = res.concat( a);
    return res; 
}







export function set_has<Tp>( a:Tp[] , s:Set<Tp> ):Tp[]|undefined{
    let ret = a.filter( x => s.has(x) )
    if (ret.length) return ret
    return;
}


export function TrivialCloneObject( src:any ): any {
    if(typeof src === "object"){
        let res:any = Array.isArray(src) ? [] :{};
        for (let f in src){ let v = src[f]; let nv:any;
            if (typeof v === "object" ) {
                if ('disableCLONE' in v) continue;
                nv =TrivialCloneObject( v );
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

export function typedCopy<T>( dst:T , src:T ) {
    for (let k in src) 
        dst[k] = src[k];
}
export function AnyCopyTo( dst:any , src:any ):any {
    if (typeof( dst) =="object" ) { 
        if (Array.isArray(dst)) dst= [] ; //= []
        for (let k in src) 
            dst[k] = AnyCopyTo(dst[k] , src[k]);
        return dst;    
    } else 
        return TrivialCloneObject(src);    
}

export function FindFieldsByName( obj:any , findnm:string ):{p:string,v:any}[]{
    let res:{p:string,v:any}[]=[];
    function fori(obj:any, p:string) {
        for (let n in obj ) {
            if (n==findnm) { res.push({p,v:obj[n]} ); }
            if (typeof obj[n]=="object") 
                fori(obj[n] , p+(p?'/':'')+n);
        }
    }
    fori(obj, '');
    return res;
}

export function DeleteFieldFromObj<TObj>( obj:TObj , ...fields:(keyof TObj)[] ){
    for (let nf of fields) {
        delete obj[nf];
    }
}

export function DeleteFieldFromObj__( fr:any , fieldpath:string[] ):any{
    let o = fr as DictionarySA;
    for( let ffn of fieldpath){
        let afn = ffn.split('/');
        let obj = o; let lastnm = afn.pop(); let err=0;
        if (!lastnm) continue;
        for (let fn of afn) 
           if (obj && typeof(obj)=="object") obj = obj[fn] as DictionarySA; 
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

export function CopyUnDefinedFileds( dst:any, src:any ):number{
    //let m:any={}; for (let f in dst) m[f]=1; 
    let cnt=0;
    for (let f in src) {
        if (dst[f]==undefined) { dst[f]=src[f]; cnt++ }
    }    
    return cnt;
}



export function minmax( v:number,minv:number , maxv:number ){
    return Math.min( maxv , Math.max(minv,v));
}



export function dt2UnixTime( dt:Date ){
    return Math.floor( dt.valueOf() / 1000 );
}

let tMonthName2Number:any=undefined
export function MonthNameToNumber( mn:string ){
    if (!tMonthName2Number) {   
        tMonthName2Number = {};    
        let monthlist1=["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"]    
        let ml=monthlist1
        for (let n in ml) 
                tMonthName2Number[ ml[n]]= n;
    }   
    mn = mn.trim().toLowerCase().slice(0,3);
    return tMonthName2Number[mn]; 
}

export function parseIPproto(ip:string){
    //let r= ip.match(/((\w+):\/\/)?(\d+\.\d+\.\d+\.\d+)(:(\d+))? /) 
    let r= ip.match(/(?:(\w+):\/\/)?(\d+\.\d+\.\d+\.\d+)(?::(\d+))?/) 
    if (!r) return;
    //console.log(r)
    return { proto:r[1] , ip:r[2], port:r[3] };
 }

 export function CompareForEqual( dst:any , src:any ):boolean {
    if (typeof( dst) !=typeof( src) ) return false;
    if (typeof( dst) =="object" ) { 
        //for (let k in dst) if (!(k in src)) return false;
        for (let k in src) if (!(k in dst)) return false;
        for (let k in dst)
            if (!CompareForEqual(dst[k] , src[k])) return false;
        return true;    
    } else 
        return dst==src;    
}

export function object2Line(o:any):string{
    if (Array.isArray(o)) {
        let s= o.map( v=>object2Line(v)).join(", ")
        return `[${s}]` 
    }else if (typeof o === "object"){
        let a=[];
        for (let k in o) { a.push(`${k}:${object2Line(o[k])}`) }
        return `{${ a.join(";") }}` ;    
    }else if (typeof o === "string"){
        return `"${o}"` ;    
    }else return String(o);
}
