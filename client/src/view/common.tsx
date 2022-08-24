// Модуль common.tsx содержит:
// Общие элементы управления html

import * as ui from "hyperoop";

export interface MoveBtnParams {
    cls: string;
    svg: (a: {cls: string}) => any;
    onmouseup: ()=>void;
    onmousedown: ()=>void;
    disabled?: boolean;
}

export const MoveButton = (a: MoveBtnParams) => (
    <button 
        class={"ctrl-button" + (a.disabled ? " ctrl-button-disabled": "")} 
        onmousedown={a.disabled ? null : a.onmousedown}
        onmouseup={a.disabled ? null : a.onmouseup}
    >
        <a.svg cls={a.cls}/>
    </button>
)

export interface ClickBtnParams {
    cls: string;
    style?:string
    svg: (a: {cls: string}) => any;
    onclick: ()=>void;
    disabled?: boolean;
    btnclass?: string;
}

export const ClickButton = (a: ClickBtnParams) => (
    a.disabled ?
        <button class={"ctrl-button btn-disabled" + (a.btnclass ? " " + a.btnclass : "")}
            style={ a.style ? a.style : "" }
            onclick={null}
            disabled
        >
            <a.svg cls={a.cls}/>
        </button>
        :
        <button class={"ctrl-button" + (a.btnclass ? " " + a.btnclass : "")}
            style={ a.style ? a.style : "" }
            onclick={a.onclick}
        >
            <a.svg cls={a.cls}/>
        </button>
)

export interface ClickTextBtnParams extends ClickBtnParams {
    text: string;
}

export const ClickTextButton = (a: ClickTextBtnParams) => (
    a.disabled ?
        <button class="click-button btn-disabled"
            onclick={null}
            disabled
        >
            <a.svg cls={a.cls}/> <span style="vertical-align: middle">{a.text}</span>
        </button>
        :
        <button class="click-button btn-enabled"
            onclick={a.onclick}
        >
            <a.svg cls={a.cls}/> <span style="vertical-align: middle">{a.text}</span>
        </button>
)

export class timeSpan {
    d:string;
    hms:string;
}

export function PrintTimeSpan(ts: timeSpan):string {
    if (ts.d === "")
        return ts.hms;
    return ts.d+" д. "+ts.hms
}

export function splitDuration(value: number):timeSpan {
    const hms = value%86400;
    const d = (value-hms)/86400;
    const dhms = new Date(hms*1000);
    const dtArr = dhms.toISOString().split("T");
    const tmArr = dtArr[1].split(".");
    return {d:d.toString(), hms:tmArr[0]}
}

function combineDuration(value:timeSpan):number {
    const d = parseInt(value.d);
    const h_m_s = value.hms.split(":");
    const h = parseInt(h_m_s[0]);
    const m = parseInt(h_m_s[1]);
    const s = h_m_s.length > 2 ? parseInt(h_m_s[2]) : 0;
    return d*86400+h*3600+m*60+s;
}

export interface TimeSpanParams {
    cls?: string;
    id: string;
    tmspan:timeSpan;
    showdays?:boolean;
    oninput: (id:string, v:number)=>void;
}

export const TimeSpan = (a: TimeSpanParams) => (
    <span>
        {a.showdays ? 
            <input class={"timespan-days"+(a.cls ? " "+ a.cls : "")} value={a.tmspan.d}
                onkeypress = {(e) => e.key.match(/[0-9]/)}
                oninput = {(el) => {a.tmspan.d=el.target.value; a.oninput(a.id, combineDuration(a.tmspan))}}> 
            </input> : ""}
        {a.showdays ? "д. " : ""}
        <input  class={a.cls} type="time" required step="1" value={a.tmspan.hms}
            oninput = {(el) => {a.tmspan.hms=el.target.value; a.oninput(a.id, combineDuration(a.tmspan))}}>
        </input>
    </span>
)