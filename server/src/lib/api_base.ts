// Модуль api-base.ts содержит:
// Вспомогательные функции для обработки API запросов к серверу
// Вспомогательные функции для запросов к другим сервисам (Медиасервер) 
import http from "http";
import path from "path";
import { APIResult } from "./api_interfaces";
import { eErrorAction } from "./utils";
import {isError} from "./gen_functions";





export function get(addr: string): Promise<string | Error> {
    return new Promise(
        r => {
            let result = '';
            http.get(addr, resp => {
                resp.on('data', (chunk) => { result += chunk });
                resp.on('end', () => r(result));
            }).on('error', e => r(e));
        }
    )
}



export async function redirect(url: string , tohost: string , res: http.ServerResponse ): Promise<any> {
    url = path.join(tohost,url);
    //let r= get( url );
    //let req= http.get(url);
    //req.
    let inc:http.IncomingMessage|undefined;//={} as http.IncomingMessage;
    let chuncks:any[]=[]
    let rs= await new Promise(
        r => {
            let result:any[] = [];
            http.get(url, resp => {
                inc = resp;
                resp.on( 'data', (chunk) => { result.push(chunk) });
                resp.on('end', () => r(result));
            }).on('error', e => r(e));
        }
    )
    //res.sen

    if ( isError( rs ) ) {
        res.writeHead( 404, {} )
        res.end( rs.message ) 
    } else {   
        //console.log(rs)
        let ibuf:Buffer=Buffer.from([]);
        for (let x of (rs as any[])) {
            let b:Buffer|undefined;
            if ( Buffer.isBuffer( x) ) b=x 
            else if (typeof x=="string") b=Buffer.from(x) 
            if (b) ibuf = Buffer.concat( [ibuf,b]) 
        }
        if (inc?.statusCode) {
            res.writeHead(inc.statusCode, inc.headers )
            res.end( ibuf );  //TODO!
        }
    }    

    return 0;
}    


export async function getJSON(addr: string): Promise<any | Error> {
    const answer = await get(addr);
    if (isError(answer)) return answer;
    return JSON.parse(answer);
}

export async function MyApiCall(addr: string): Promise<APIResult> {
    const answer = await get(addr);
    if (isError(answer)) return { error: answer.message};
    return JSON.parse(answer);
}    

export function isApiError(e:any ):e is APIResult {
    return e && ("error" in e);
}

export function formaturl(u:string):string{
    let usa = u.split('?');
    usa[0]= usa[0].replace(/\/+/g,'/')
    usa[0]= usa[0].replace(/\:\/+/,'://')
    return usa.join('?')
}
