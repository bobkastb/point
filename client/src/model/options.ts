// Модуль options.ts содержит:
// Интерфейсы  для параметров клиенсткой части 

//import * as iapi from "@gen_lib/api_interfaces";
import { rProgramOptions   } from "@gen_lib/api_interfaces";



export interface Opts {
    switchStateRefresh: boolean;
}

export const opts = (x: any): Opts => x as unknown as Opts;


export interface imapServerID { server:any; media:any }

export type enumServerID = keyof imapServerID // "server"|"media"
export type enumReloadProcessStatusID = "enabled"|"process"

//export type OneOptions11 = {   [key in enumServerID ]:any; }



export type OneOptions = {
    [key in (keyof rProgramOptions) ]?:any;
}

export let OptionProperty:OneOptions={ SaveVideoPath:'S', Themes:'RO' , PathSep:'RO' }
export function isLocalOption( key : string ): boolean {
    return !(key in OptionProperty);
} 
//'S'  - saved 
//'RO' - read only 

