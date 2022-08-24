// Модуль options.tsx содержит:
// Элементы управления страницы "Настройки" ( /#options )

import * as ui from "hyperoop";
import { SidebarTD } from "./sidebar";
import * as svg from "./svg";
import { enumServerID,enumReloadProcessStatusID } from "../model/options";
import * as cmn from "./common";
import { pathjoin } from "../controller/utils";
import { rProgramOptions   } from "@gen_lib/api_interfaces";


interface ControlI {
    setVideoPath(p: string);
    setTheme(s: string);
    goTo(s: string);
    select(s: string);
    reloadServer( srvid:enumServerID )
    reloadProcessStatus( srvid:enumServerID , statusD:enumReloadProcessStatusID )
}

export interface OptionsState {
    ctrl: ControlI;
    sidebar: boolean;
    togglebar: () => {}
    options: rProgramOptions;
    folders: string[];
    selection: string;
}

const OptionsTable = (a: {ctrl: ControlI, options: rProgramOptions, folders: string[], selection: string}) => (
    <table class="options-table">
        <tr>
            <td>
                Стиль пользовательского интерфейса:
            </td>
            <td class="options-parameter-td">
                <select class="select-theme" oncreate={(el) => {
                    el.onchange = () => a.ctrl.setTheme(el.value);
                }}>
                    {a.options.Themes.map(name =>
                        name === a.options.DefaultTheme ?
                        <option value={name} selected="selected">
                            {name[0].toUpperCase()+name.slice(1)}
                        </option>
                        :
                        <option value={name}>
                            {name[0].toUpperCase()+name.slice(1)}
                        </option>
                    )}
                </select>
            </td>
        </tr>
            <td>
                Папка для хранения видеофайлов:
            </td>
            <td class="options-parameter-td">
                {a.options.SaveVideoPath}
                <ul class="options-folders-ul">
                    <li class="options-folders-cap-li">
                        {a.selection}
                    </li>
                    {a.folders.map((name: string) => (
                        <li 
                            class="options-folders-li" 
                            onclick={() => a.ctrl.goTo(name)}
                        >
                            {name} {
                                name !== "..." ?
                                    <cmn.ClickButton
                                        cls={pathjoin(a.options.PathSep, a.selection, name ) === a.options.SaveVideoPath ? "cur-dir-btn-svg" : "choose-dir-btn-svg"}
                                        btnclass="choose-dir-btn"
                                        svg={svg.CheckMark}
                                        onclick={chooseDir(a, name, pathjoin(a.options.PathSep , a.selection, name ) !== a.options.SaveVideoPath)}
                                    />
                                    : ""}
                        </li>
                    ))}
                </ul>
            </td>
        <tr>
        </tr>
    </table>
)

const chooseDir = ((a: { ctrl: ControlI }, name: string, doChoose: boolean) => (e: Event) => {
    if (doChoose) a.ctrl.setVideoPath(name);
    e.stopPropagation();
    e.preventDefault();
}) as (a: { ctrl: ControlI }, name: string, doChoose: boolean) => () => void;


export const SvgButtonXX=( a:{  cls:string , svg: (a: {cls: string}) => any } )=>(
    <a.svg cls={a.cls}/>
)

export const ReloadButtonXX = (a: {ctrl: ControlI , sid: enumServerID , prc:boolean , active:boolean }) => (
    <button class={"click-button btn-"+ (!a.active?"disabled":"enabled") }
    onclick={ !a.active? null : ()=>a.ctrl.reloadServer(a.sid) }
    disabled={!a.active}>
    <SvgButtonXX svg={a.prc? svg.SandClock : svg.Reload} cls={"settings-btn" + (a.prc? "-inactive" :"")} />    
    <span style="vertical-align: middle">
        {(a.prc ? "Перезагружается" : "Перезагрузить") +" "+ (a.sid=="server"? "сервер" :"медиа-сервер")}
    </span>
    </button>
)

export const ReloadButton = (a: {ctrl: ControlI , sid: enumServerID}) => 
       ReloadButtonXX( { ctrl:a.ctrl , sid:a.sid , prc:a.ctrl.reloadProcessStatus(a.sid,"process") , active:a.ctrl.reloadProcessStatus(a.sid,"enabled")
     })
export const Main = (a: OptionsState) => (
    <table class="main-table">
        <tr class="main-table-tr">
            <SidebarTD rowspan={3} sidebar={a.sidebar} togglebar={a.togglebar}/>
            <td class="switch-top-td" colspan="2">
                <span class="table-caption">Настройки</span>
            </td>
        </tr>
        <tr class="main-table-tr">
            <td class="switch-table-td">
                <OptionsTable ctrl={a.ctrl} options={a.options} folders={a.folders} selection={a.selection}/>
            </td>
            <td class="presets-td"></td>
        </tr>
        <tr class="main-table-tr">
            <td class="switch-bottom-td">
                <table style="width: 500px;font-size: 12px;"><tr>
                <td><ReloadButton ctrl={a.ctrl} sid="server" /></td>
                <td><ReloadButton ctrl={a.ctrl} sid="media" /></td>
                </tr></table>
            </td>
        </tr>
    </table>
)

//<td class="switch-bottom-td" colspan="2">
