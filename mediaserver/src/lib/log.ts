// Модуль log.ts содержит:
// Функции работы с журналом сообщений (лог).
import path from "path";
import fs from "fs";

if (!('toJSON' in Error.prototype)) {
    Object.defineProperty(Error.prototype, 'toJSON', {
        value: function () {
            return this.message;
        },
        configurable: true,
        writable: true
    });
}

const myDir = path.dirname(process.argv[1]);
const now = () => (new Date).toISOString().split("T")[0];
const trimQuote = (s: string) => s.replace(/^\"/, "").replace(/\"$/, "");

function useInternalLog() { return process.env.LogInternal ? false : true }
function InsPrefixArgs(args: any[]):any[] {
    if (!useInternalLog()) return args;
    return [`[${(new Date()).toLocaleString("ru-RU")}]`].concat(args);
}

function doLog(fname: string, ...args: any[]) {
    if (!useInternalLog()) return;
    fname = path.join(myDir, "logs", `${now()}${fname}.log`);
    const s = args.map(x => trimQuote(JSON.stringify(x))).join(" ")+"\n";
    fs.appendFileSync(fname, s, {encoding: "utf8"});
}


export function log(...args: any[]) {
    args =InsPrefixArgs(args);
    doLog('', ...args);   
    console.log(...args);        
}

export function error(...args: any[]) {
    if (!String(args[0]).startsWith("ОШИБ")) args=["ОШИБКА:",...args]
    args =InsPrefixArgs(args);
    doLog('-errors', ...args);   
    console.error(...args);        
}