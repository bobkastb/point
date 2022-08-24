// Модуль process_utils.ts содержит:
// Вспомогательные функции для работы с системными процессами
import { spawn, ChildProcessWithoutNullStreams, ChildProcess } from "child_process";
import child_process from "child_process";
import * as mutils from "./utils";
//import *  from "times";



export class CProcess {
    private proc_: ChildProcessWithoutNullStreams| child_process.ChildProcess | null = null;
    private proc_event =new mutils.Event(); // Promise<void> | null = null;
    private proc_completed?:boolean;

    private on_close( code: number, signal: NodeJS.Signals ) {}

    IsRun() { return false }
    Exec( command: string, args?: ReadonlyArray<string>, options?: child_process.SpawnOptionsWithoutStdio ) {}
    Terminate( timeout?:number ) {}
    Proc() { return this.proc_ }
    onClose(event: "close", listener: (code: number, signal: NodeJS.Signals) => void) {


    };

}