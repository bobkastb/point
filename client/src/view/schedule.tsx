// Модуль schedule.tsx содержит:
// Элементы управления страницы "Расписания записи" ( /#schedule )

import * as ui from "hyperoop";
import {SidebarTD} from "./sidebar";
import * as svg from "./svg";
import * as cmn from "./common";
import * as msch from "../model/schedule";
import * as mcam from "../model/camera";
//import {rCameraState} from "../model/camera";
import {rCameraState } from "@gen_lib/camera_interfaces";
import {rScheduleTaskState} from "@gen_lib/schedule_interface";

interface ControlI {
    switchScheduler(enabled: boolean):Promise<void>;
    deleteSchedule(ID: string): Promise<void>;
    updateSchedule(): Promise<void>;
    addSchedule(camId: string):Promise<void>;
    toggleAllowed(ID: string):void;
    setCamera(camId: string):void;
    setPreset(presetId: string):void;
    setDuration(dur: number):void;
    setPeriod(per: number):void;
    setName(name: string):void;
    setFile(file: string):void;
    setStart(val :string, part: string):void;
    toggleSchedProps(ID?: string):void;
    toggleSchedEdit(ID?: string):void;
    startStopTask(ID: string):void;
    selectEntry(ID: string):void;
}

export interface SchedState {
    ctrl: ControlI;
    sidebar: boolean;
    entries: msch.ScheduleMap;
    enabled: boolean;
    cameras: rCameraState[];
    presets: msch.CameraPresets;
    taskprops:rScheduleTaskState|null;
    tasklog: string;
    records: string[];
    togglebar: () => {};
    playfile: (name: string) => void;
    editentryid: string;
    entry2edit: msch.SchedEntry_Local|null;
}

const Fields = ["Имя", "Камера", "Старт", "Длительность", "Период",  "Пресет", "Статус", ""];

const cameraList = (cls: string, cams: readonly rCameraState[], cn: string) => 
    cams.map(c => 
        c.ID.toString()===cn ? <option class={cls} selected value={c.ID}>{c.Name}</option> : <option value={c.ID}>{c.Name}</option>
    )

const camera = (ctrl:ControlI, entry:msch.SchedEntry_Local, cameras: readonly rCameraState[], cls:string) => 
    <select class={cls} size="1" onchange = {(el) => ctrl.setCamera(el.target.value)}>
        {cameraList(cls, cameras, entry.Camera)}
    </select>

const presetList = (cls: string, presets: msch.Presets, cp: string) =>
    Object.entries(presets).map(p =>
            p[0]===cp ? <option class={cls} selected value={p[1].ID}>{p[1].Name}</option> : <option value={p[1].ID}>{p[1].Name}</option>
        )

const preset = (ctrl:ControlI, entry:msch.SchedEntry_Local, presets: msch.Presets, cls:string) => 
    presets === undefined ? <div></div> :
    <select class={cls} size="1" onchange = {(el) => ctrl.setPreset(el.target.value)}>
        {presetList(cls, presets, entry.Camera_PresetID)}
    </select>
    
const startDT = (ctrl:ControlI, entry:msch.SchedEntry_Local, cls:string) => 
    <div class={cls}>
        <input type="date" min={entry.StartDate} value={entry.StartDate} required="true"
            oninput = {(el) => ctrl.setStart(el.target.value, "d")}>
        </input>
        <input type="time" step="1" value={entry.StartTime} required="true"
            oninput = {(el) => ctrl.setStart(el.target.value, "t")}>
        </input>
    </div>    

const presetStr = (presets: msch.Presets, presetID:string) =>
    Object.keys(presets).length > 0 ? presets[presetID] === undefined ? "Неизвестный пресет!" : presets[presetID].Name : ""


const tableRows = (a: SchedState) => 
    Object.keys(a.entries).map((ID:string, row:number) => 
        <tr class={"sched-table-row-tr" + (ID===a.editentryid ? " sched-table-row-select" :row%2 ? " sched-table-row-odd" : " sched-table-row-even")} 
            onclick={()=>a.ctrl.selectEntry(ID)} ondblclick={()=>a.ctrl.toggleSchedEdit(ID)}>
            <td class="sched-table-row-td">
                {a.entries[ID].Name}
            </td>
            <td class="sched-table-row-td unselectable">
                {a.cameras.find(cam => cam.ID.toString()===a.entries[ID].Camera).Name}
            </td>
            <td class="sched-table-row-td unselectable">
                {a.entries[ID].StartDate+"  "+a.entries[ID].StartTime}
            </td>
            <td class="sched-table-row-td unselectable">
                {cmn.PrintTimeSpan(cmn.splitDuration(a.entries[ID].Duration))}
            </td>
            <td class="sched-table-row-td unselectable">
                {cmn.PrintTimeSpan(cmn.splitDuration(a.entries[ID].Period))}
            </td>
            <td class="sched-table-row-td unselectable">
                {presetStr(a.presets[a.entries[ID].Camera], a.entries[ID].Camera_PresetID)}
            </td>
            <td class="sched-table-row-mark-td unselectable">
                {a.entries[ID].Running ? svg.VideoCamera({cls: "sched-save-del-btn"}) : a.entries[ID].Allowed ?  svg.CheckMark({cls: "sched-save-del-btn"}) : svg.Close({cls: "sched-save-del-btn"})}
            </td>
            <td class="sched-table-row-td unselectable">
                <cmn.ClickButton
                    onclick={() => a.ctrl.toggleSchedProps(ID)}
                    svg={svg.Props}
                    cls="sched-save-del-btn"/>
            </td>
        </tr>
    )

const ScheduleTable = (a: SchedState) => (
    <table class="sched-table">
        <tr class="sched-table-th">
            {Fields.map(name => 
                <th class="sched-table-th">{name}</th>
            )}
        </tr>
        { tableRows(a) }
    </table>
)
 
// onkeyup = {(e) => console.log("RECORDS KEY:", e.key)}

const records = (recs: string[], play:(file:string)=>void) => 
    <select class="sched-task-records" size={Math.min(recs.length, 6)} onchange={(el)=>{el.target.selected=true}} onkeyup = {(e) => e.key === "Enter"?play(e.target.value):false}>
        {recs.map((f, i) => 
            i===recs.length-1 ? 
            <option value={f} selected ondblclick = {(e) => play(e.target.value)}>{f}</option> : 
            <option value={f} ondblclick = {(e) => play(e.target.value)}>{f}</option>
        )}
    </select>

const SchedPropsDialog = (a: {control: ControlI, id: string, name:string, props: rScheduleTaskState, log:string, records:string[], play:(file:string)=>void}) => (
    <div class="modal">
        <div class="sched-modal-content">
            <span class="close" onclick={() => a.control.toggleSchedProps()}>&times;</span>
            <p>
                <span>{`Состояние задания ${a.name}: ${msch.TaskStates[a.props.state]} `}</span>
                <span>
                    <button class="sched-task-button" onclick={() => a.control.startStopTask(a.props.Id)}>
                        {a.props.state==="notrun" ? svg.Play({cls: "sched-task-button-icon"}) : svg.Stop({cls: "sched-task-button-icon"})}
                        <span class="sched-task-button-text">
                            {a.props.state==="notrun" ? "Запустить" : "Остановить"}
                        </span>
                    </button>
                </span>
            </p>
            <p>Следующий запуск: { msch.nexttime2str(a.props.next_starttime) }</p>
            <p>
                <span>Количество запусков: {a.props.cnt_calls}, из них с ошибкой: {a.props.cnt_errcalls}</span>
                <span>
                    <button class="sched-task-button sched-task-button-shift" onclick={() => a.control.toggleSchedEdit(a.id)}>
                        {svg.Blank({cls: "sched-task-button-icon"})}
                        <span class="sched-task-button-text">Редактировать</span>
                    </button>
                </span>
            </p>
            <p>Последний запуск: {a.props.last_starttime==0?"не запускалась":new Date(a.props.last_starttime*1000).toLocaleString()} 
                {a.props.last_starttime>0?", длительностью "+cmn.splitDuration(a.props.curr_duration).hms:""} </p>
            <p>Журнал выполнения задания:</p>
            <p><textarea  
                class="sched-task-log" readonly wrap="off" 
                oncreate={(el) => el.scrollTop=el.scrollHeight}
                onupdate={(el) => el.scrollTop=el.scrollHeight}>
                {a.log}
            </textarea></p>
            <p>Файлы записей задания:</p>
            <p>{records(a.records, a.play)}</p>
        </div>
    </div>
)

const SchedEditDialog = (a: {control: ControlI, entry:msch.SchedEntry_Local, cameras:rCameraState[], presets:msch.Presets}) => (
    <div class="modal">
        <div class="sched-modal-content">
            <span class="close" onclick={()=>a.control.toggleSchedEdit()}>&times;</span>
            <p class="sched-panel-header">{`Редактирование параметров задания ${a.entry.Name}`}</p>
            <table class="sched-table">
                <tr>      
                    <td class="sched-edit-table-td">Начало записи</td>
                    <td class="sched-edit-table-td">{startDT(a.control, a.entry, "sched-edit-div")}</td>
                </tr>
                <tr>
                    <td class="sched-edit-table-td">Длительность записи</td>
                    <td class="sched-edit-table-td">
                    <cmn.TimeSpan
                        cls="sched-edit-item"
                        id={a.entry.Id}
                        tmspan={cmn.splitDuration(a.entry.Duration)}
                        oninput={(i, v)=>a.control.setDuration(v)}
                    />
                    </td>
                </tr>
                <tr>
                    <td class="sched-edit-table-td">Период записи</td>
                    <td class="sched-edit-table-td">
                    <cmn.TimeSpan
                        cls="sched-edit-item"
                        id={a.entry.Id}
                        tmspan={cmn.splitDuration(a.entry.Period)}
                        showdays={true}
                        oninput={(i, v)=>a.control.setPeriod(v)}
                    />
                    </td>
                </tr>
                <tr>
                    <td class="sched-edit-table-td">Имя задания</td>
                    <td class="sched-edit-table-td">
                        <input type="text" class="sched-edit-item" value={a.entry.Name}
                        oninput = {(el) => a.control.setName(el.target.value)}></input>
                    </td>
                </tr>
                <tr>
                    <td class="sched-edit-table-td">Камера</td>
                    <td class="sched-edit-table-td">{camera(a.control, a.entry, a.cameras, "sched-edit-item")}</td>
                </tr>
                <tr>
                    <td class="sched-edit-table-td">Пресет</td>
                    <td class="sched-edit-table-td">{preset(a.control, a.entry, a.presets, "sched-edit-item")}</td>
                </tr>
                <tr>
                    <td class="sched-edit-table-td">Шаблон имени файла</td>
                    <td class="sched-edit-table-td">
                        <input type="text" class="sched-edit-item" value={a.entry.FileTemplate}
                        oninput = {(el) => a.control.setFile(el.target.value)}></input>
                    </td>
                </tr>
            <tr>
                <td class="sched-edit-table-td">Задание активно</td>
                <td class="sched-edit-table-td">
                    <cmn.ClickButton
                        cls="sched-save-del-btn"
                        btnclass="allow-sched-btn"
                        svg={a.entry.Allowed ? svg.CheckMark : svg.Close}
                        onclick={() => {a.control.toggleAllowed(a.entry.Id)}}
                    />
                </td>
            </tr>
            <tr>
                <td class="sched-edit-table-td">
                    <button class="sched-task-button" onclick={() => a.control.toggleSchedProps(a.entry.Id)}>
                        {svg.Props({cls: "sched-task-button-icon"})}
                        <span class="sched-task-button-text">Свойства</span>
                    </button>
                </td>
                <td class="sched-edit-table-td">
                <button class="sched-task-button" onclick={() => a.control.deleteSchedule(a.entry.Id)}>
                        {svg.TrashBin({cls: "sched-task-button-icon"})}
                        <span class="sched-task-button-text">Удалить</span>
                    </button>
                </td>
                <td class="sched-edit-table-td">
                    <button class="sched-task-button" onclick={() => a.control.updateSchedule()}>
                        {a.entry.Changed ? svg.Upload({cls: "sched-task-button-icon"}) : svg.Upload({cls: "sched-button-inv-icon"})}
                        <span class="sched-task-button-text">Сохранить</span>
                    </button>
                </td>
            </tr>
            </table>
        </div>
    </div>
)

export const Main = (a: SchedState) => (
    <table class="main-table">
        <tr class="main-table-tr">
            <SidebarTD rowspan={3} sidebar={a.sidebar} togglebar={a.togglebar}/>
            <td class="sched-top-td">
                <span class="table-caption">Расписания записи</span>
            </td>
        </tr>
        <tr class="main-table-tr">
            <td class="sched-buttons-td" colspan="2">
                <button class="sched-button" onclick={() => a.ctrl.switchScheduler(a.enabled)}>
                    {a.enabled? svg.Stop({cls: "sched-button-icon"}):svg.Play({cls: "sched-button-icon"})}
                    <span class="sched-button-text">
                        {a.enabled?"Остановить планировщик":"Запустить планировщик"}
                    </span>
                </button>
                <button class="sched-button" onclick={() => a.ctrl.addSchedule(a.cameras[0].ID)}>
                    {svg.Plus({cls: "sched-button-icon"})}
                    <span class="sched-button-text">Новое задание</span>
                </button>
                <button class={a.editentryid==="" ? "sched-button-disabled" : "sched-button"} onclick={() => a.ctrl.toggleSchedEdit(a.editentryid)} disabled={a.editentryid===""}>
                    {svg.Blank({cls: "sched-button-icon"})}
                    <span class="sched-button-text">Редактировать задание</span>
                </button>
                <button class={a.editentryid==="" ? "sched-button-disabled" : "sched-button"} onclick={() => a.ctrl.deleteSchedule(a.editentryid)}  disabled={a.editentryid===""}>
                    {svg.TrashBin({cls: "sched-button-icon"})}
                    <span class="sched-button-text">Удалить задание</span>
                </button>
                {
                    a.taskprops !== null ? <SchedPropsDialog 
                        control={a.ctrl}
                        id={a.entries[a.taskprops.Id].Id}
                        name={a.entries[a.taskprops.Id].Name}
                        props={a.taskprops}
                        log={a.tasklog}
                        records={a.records}
                        play={a.playfile}/> 
                    : a.entry2edit !== null ? <SchedEditDialog 
                        control={a.ctrl}
                        entry={a.entry2edit}
                        cameras={a.cameras}
                        presets={a.presets[a.entry2edit.Camera]}/> 
                    : ""
                }
            </td>
        </tr>
        <tr class="main-table-tr">
            <td class="sched-table-td">
                { ScheduleTable(a) }
            </td>
        </tr>
    </table>
)
