// Модуль environment.ts содержит:
// Функции работы с системным окружением
// Функции поиска переменных окружения в тексте и замены на актуальные значения
// Функции загрузки конфигурационного файла

import child_process from "child_process";
import path from "path";
import os from "os";
import fs from "fs";
import { log, error } from "./log";
import * as mutils  from "./utils";

function getMaindir():string { return path.dirname(process.argv[1]) }
export const mainDir = getMaindir();

interface baseEnvironmentType { 
    HOST_IPV4_ADDR:string, 
    ServerHome:string,
    LogDir: string,
    StorageDataDir:string,
    ShellExt:string,
    [key:string]:string
} 

export const isWindows = process.platform === "win32"; 
const c_ShellExt=process.platform === "win32" ? "cmd" : "sh";

const  defaultPrgEnv:baseEnvironmentType={
    HOST_IPV4_ADDR: getdefault_IPV4() , 
    ServerHome:mainDir,
    StorageDataDir:`${mainDir}/data`,
    LogDir:`${mainDir}/logs`,
    ShellExt: c_ShellExt, 
    
    SerialPortSettingScript:`${mainDir}/bin/SerialSetting.${c_ShellExt}`
}  


let MyEnv:any;
let MyEnvJ:any;

export function getEnv():baseEnvironmentType{ return MyEnv as baseEnvironmentType; }
let processArgs:any;
export function getprocessArgs():any{
    if (processArgs) return processArgs;
    let r:any={};
    for (let a of process.argv.slice(2)) {
        let v= a.split('=')
        r[v[0]]=v[1]?v[1]:"";
    }
    processArgs=r;
    return processArgs;
}

function copyFields( dst:any , src:any) {
    let e = Object.entries(src);
    for (let c of e) dst[c[0]]=c[1];
}

//os.networkInterfaces()
function openconfig_file_l( fn:string ){
    try {
            if ( !fs.existsSync( fn )) return;
            let data = JSON.parse(fs.readFileSync(fn, "utf8"));
            return data
        } catch (e) {
            let msg= mutils.getErrorMessage(e);
            throw(`on read file ${fn} error: ${msg}` )
        }
    return 
}

function getfirst_existfile( ...args:string[] ) {
    for ( let f of args) if ( fs.existsSync(f) ) return f;
}

export function openlocalhost_ConfigFiles( filename:string ):any{
    return openconfig_file_l(`${mainDir}/localhost.${os.hostname}/${filename}`);
}




function getdefault_IPV4():string{
    for ( let ia of Object.values( os.networkInterfaces() )) {
        if (ia!=undefined) for (let int of ia ) {
           if (int.internal) continue;
           if (int.family=="IPv6") continue;
           return int.address;
        }
    }
    return "localhost";
}

function json_decorate_string(s:string):string{
    let r = JSON.stringify(String(s));
    return r.slice(1,r.length-1);
  }


function makeMayEnvironment(){
    if (!MyEnv) {
        MyEnv={}; 
        copyFields(MyEnv , process.env);
        let lMyEnv = openlocalhost_ConfigFiles("env.json")
        if ( lMyEnv ) 
            copyFields(MyEnv , lMyEnv );
        copyFields(MyEnv , defaultPrgEnv);    
        MyEnvJ = {};
        for ( let k in MyEnv ) {
            MyEnvJ[k]=json_decorate_string(MyEnv[k])
        }
    };    

}  
type CtxReplace={ count:number; errs:{[keys:string]:number} }
function replace_env_E(s:string, ctx:CtxReplace ):string{
    let re = /\$\{(\w+)\}/g;
    let e= s.replace(re, (v,v1)=>{ ctx.count++;
            if (v1 in MyEnv) return MyEnv[v1]; ctx.errs[v]++; return v; });
    return e;
}

export function EnvStrExpand( s:string , onError?:"throw"|"retu" ):string{
    let ctx:CtxReplace={count:0,errs:{}}
    let r = replace_env_E(s,ctx)
    if (ctx.errs.length) {
        if (onError=="throw")  throw Error("undefined env var:" + Object.keys( ctx.errs).join(", "))
        if (onError=="retu")  return "";
    }   
    return r; 
}

function replace_env_s(s:string):string{
    let re = /\$\{(\w+)\}/g;
    let e= s.replace(re, (v,v1)=>{  return v1 in MyEnvJ ? MyEnvJ[v1]:v }  );
    return e;
}
export function replaceEnvironmentFJ(s: string):string {
    //os.hostname
    makeMayEnvironment();
    return replace_env_s(s);
}
let MyReplacer_tryloaded=false;
let MyReplacer:{ ByFieldName:any , ByValue:any };

export function callReplacer( x: any) {
    if (!MyReplacer_tryloaded) {
        MyReplacer_tryloaded = true;
        MyReplacer = openlocalhost_ConfigFiles("replacer.json")
    }
    if (!MyReplacer) return; 
    let repla:string[]=[];
    function dorep( x : any ){
        //Object.entries( x ).filter( (value)=>{ return  } )
        for (let n of Object.entries( x )) { let key=n[0];
            let rv= MyReplacer.ByFieldName[key];
            if ( rv != undefined ) { 
                repla.push(`${key} => ${rv}`)
                x[key] = rv; continue;
            }
            if ( typeof(n[1])=="object") { dorep(n[1]); continue 
            } else if (( typeof(n[1])=="string") && (n[1] in MyReplacer.ByValue)) {
                x[key] = MyReplacer.ByValue[n[1]];     
                continue 
            }
        }

    }
    dorep(x);
    log(" replacer: ", repla.join(", ") );
   // console.log("replacer:", MyReplacer );
}    



export function replaceEnvironmentObj( x: any, loadenv:boolean):string {
    makeMayEnvironment();
    let ctx:CtxReplace={ count:0 , errs:{} };
    function dorep( x : any  ){
        let cnt=0;
        for (let n of Object.entries( x )) { let key=n[0];
            if (typeof n[1]=="string") {
                x[n[0]]= replace_env_E(n[1],ctx )
            }    
            else if ( typeof(n[1])=="object") dorep(n[1]);
        }

    }
    if (typeof(x.Environment)=="object" ) {
        dorep(x.Environment);
    }
    if (typeof(x.Environment)=="object" && loadenv) {
        for (let n in x.Environment)
            MyEnv[n] = x.Environment[n];

    }
    dorep(x);
    return Object.keys(ctx.errs).join(',')
}    

export function openconfig_file( filepath:string , loadenv:boolean=false ){

    makeMayEnvironment();
    //console.log(MyEnv);
    //let fna = [`${mainDir}/localhost.${os.hostname}/${filename}` , `${mainDir}/${filename}`].filter( (value)=>fs.existsSync( value ) )

    if (!path.isAbsolute(filepath)) filepath= `${mainDir}/${filepath}`;
    let filename= path.basename( filepath);
    let ff= getfirst_existfile( `${mainDir}/localhost.${os.hostname}/${filename}` , filepath );
    if (!ff) return;
    try {   
            filepath = ff;
            //if ( !fs.existsSync( filepath )) return;
            let txt = fs.readFileSync(filepath, "utf8");
            //txt = replaceEnvironmentFJ (txt);
            let data = JSON.parse(txt);
            let errs = replaceEnvironmentObj( data , loadenv )
            if (errs) throw(`on read file ${filepath}: Undefined environment variables:${errs}`)
            callReplacer(data);
            //console.log(data);throw "test";
            return data
        } catch (e) {
            console.log("---",e); 

            let msg=  mutils.getErrorMessage(e);
            throw(`on read file ${filepath} error: ${msg}` )
        }
    return 

}

async function Execute11( cmd:string , options?:{hide?:number,echo?:number} ):Promise<any> {
    let outdata:string[]=[];
    if (options?.echo) log("Exec:",cmd)
    await new Promise<any>( r => {
        const p = child_process.exec(cmd);
        let prefix=`New Child PID:${p.pid} cmd:${cmd}\n`;
        const nextpref=`Child(${p.pid})`;
        p.stdout?.on("data", (data) => { if (!options?.hide) log(prefix,data); prefix=nextpref; outdata.push(data);  })
        p.stderr?.on("data", (data) => { error(`${prefix}`,data); prefix=nextpref; });
        p.on("exit", r);
        //p.on("exit", code=>r(code)   );
    //p.on("exit",  );
    });
    return outdata.join("\n");
}

interface ExecResult{
	pid:number;
	exitcode?:number;
	out:string
	err:string
}

export async function Execute( cmd:string , options?:{hide?:number,echo?:number,raise?:number} ):Promise<ExecResult> {
    let outdata:string[]=[];
	let result:ExecResult={ pid:0, exitcode:0 , out:"", err:""  }
    if (options?.echo) log("Exec:",cmd)
    let code=await new Promise<any>(r => {
        const p = child_process.exec(cmd);
		result.pid=p.pid;
        let prefix=`New Child PID:${p.pid} cmd:${cmd}\n`;
        const nextpref=`Child(${p.pid})`;
        p.stdout?.on("data", (data) => { if (!options?.hide) log(prefix,data); prefix=nextpref; outdata.push(data);  })
        p.stderr?.on("data", (data) => { error(`${prefix}`,data); prefix=nextpref; result.err += data; });
        p.on("exit", code=>{ result.exitcode=code!=null ? code: undefined ; r(code); }   );
    });
    result.out = outdata.join("\n");
    if ( result.exitcode && options?.raise )  
        throw Error(`Error exit(${result.exitcode}):"${result.err}". at exec(${cmd})`)
    return result;
}

