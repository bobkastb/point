// Модуль log.ts содержит:
//Функции для протоколирования и работы с логом
import path from "path";
import {unixtime2ISOLocalStr} from "./utils";
import fs from "fs";
import { getEnv } from "./environment"

if (!('toJSON' in Error.prototype)) {
    Object.defineProperty(Error.prototype, 'toJSON', {
        value: function () {
            return this.message;
        },
        configurable: true,
        writable: true
    });
}

const now_F = () => unixtime2ISOLocalStr().split("T")[0];
const trimQuote = (s: string) => s.replace(/^\"/, "").replace(/\"$/, "");
function useInternalLog() { return process.env.LogInternal ? false : true }
function InsPrefixArgs(args: any[]):any[] {
    if (!useInternalLog()) return args;
    return [`[${(new Date()).toLocaleString("ru-RU")}]`].concat(args);
}
function now_txt():string { return `[${(new Date()).toLocaleString("ru-RU")}]`; }
function ins_now(  ...args:any[]):any[] { 
    return (!useInternalLog()) ?  args : [now_txt(),...args];
   }
function mfilename( suffix:string ) { return path.join(  getEnv().LogDir , `${now_F()}${suffix}.log`); }


export function doFLog(fname: string, ...args: any[]) {
    const s = args.map(x => trimQuote(JSON.stringify(x))).join(" ")+"\n";
    fs.appendFileSync(fname, s, {encoding: "utf8"});
}
function doLog(fname: string, ...args: any[]) {
    if (!useInternalLog()) return args;
    fname= mfilename(fname);
    const s = args.map(x => trimQuote(JSON.stringify(x))).join(" ")+"\n";
    fs.appendFileSync(fname, s, {encoding: "utf8"});
}


function NLogFN() { return mfilename('') }        
function loge(  ...args: any[] ){
    args = ins_now(...args )
    doLog('', ...args);   
    console.log(...args);        
}

export function log(...args: any[]) { 
    loge( ...args); 
}

export function error(...args: any[]) {
    args = ['Error:',...args];
    args = ins_now(...args )
    console.error(...args);        
    doLog('', ...args);   
    doLog('-errors', ...args);   

}
export function warning(...args: any[]) {
    const wa=['Warning:' , ...args]
    log( wa ); 
    doLog('-errors', now_txt(),...wa);   
}