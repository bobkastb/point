// Модуль caplist.tsx содержит:
// Элементы управления страницы видеозахвата ( /#capture )
// Диалог выбора ранее записаного видео-файла для воспроизведения
import * as ui from "hyperoop";
import * as cmn from "./common";
import * as svg from "./svg";

export interface iPageControl {
    setDialogText(txt: string);
    OnChangeFileName(txt: string);
    chooseFile(name: string);
    toggleDialog();
    startRecord();
    stopRecord();
    pauseRecord();
    cancelRecord();
    setRecordName();
    cmd_stoprecord();
    scrollRecords(el);
    fileSaveDialogState():number
}

interface State {
    curfile: string;
    files: string[];
    showdlg: number;
    control: iPageControl;
    recording: boolean;
    paused: boolean;
}

const FileLi = (a: {active: boolean, name: string, onclick: ()=>void}) => (
    <li class={"presets-li" + (a.active ? " presets-li-on" : "")}>
        &mdash; <a href={window.location.hash} onclick={a.onclick}>{a.name}</a>
    </li>
)

const FilesUl = (a: {active: string, data: string[], onclick: (file: string) => () => void, scroll: (el)=>void} ) => (
    <ul class="presets-ul" oncreate={(el)=>a.scroll(el)} onupdate={(el)=>a.scroll(el)}>
        {a.data.map((info: string) => (
            <FileLi
                active={info === a.active}
                name={info}
                onclick={a.onclick(info)}/>
        ))}
    </ul>
    
)

const initInput = (control: iPageControl) => (inp) => {
    inp.value = "";
    inp.onchange = () => control.setDialogText(inp.value);
    inp.focus();
    inp.addEventListener("keyup", event => {
        if (event.key == "Escape") { control.toggleDialog(); return; } 
        if (event.key == "Enter") { 
            control.setRecordName();
            event.preventDefault();
            return;}
        control.OnChangeFileName(inp.value);
    });
};

export const NewFileDialog = (a: {control: iPageControl}) => (
    <div class="modal">
        <div class="modal-content">
            <span class="close" onclick={() => a.control.toggleDialog()}>&times;</span>
            <p>{ a.control.fileSaveDialogState()==1 ? "Введите имя файла:" : "Этот файл уже существует!" }</p>
            <input type="text" style="display:block" autofocus class="preset-name-input" oncreate={initInput(a.control) }/>
            <button class="preset-create-button" type="submit" onclick={() => a.control.setRecordName()}>
                { a.control.fileSaveDialogState()==1 ? "Добавить" : "Перезаписать" }</button>
            <button class="preset-create-button" type="submit" onclick={() => a.control.cancelRecord()}>Не записывать</button>
        </div>
    </div>
)

export const FileReplaceDialog = (a: {control: iPageControl}) => (
    <div class="modal">
        <div class="modal-content">
            <span class="close" onclick={() => a.control.toggleDialog()}>&times;</span>
            <p>Введите имя файла:</p>
            <input type="text" style="display:block" autofocus class="preset-name-input" oncreate={initInput(a.control) }/>
            <button class="preset-create-button" type="submit" onclick={() => a.control.setRecordName()}>Заменить</button>
            <button class="preset-create-button" type="submit" onclick={() => a.control.cancelRecord()}>Не записывать</button>
        </div>
    </div>
)


const recordEnabled = (a: State) => !a.recording;
const recordMethod = (a: State) => recordEnabled(a) ? (() => { a.control.startRecord() }) : null;
const recordStyle = (a: State) => "capture-btn" + (recordEnabled(a) ? "" : " capture-btn-inactive");

const playStyle = (a: State) => "capture-btn" + (recordEnabled(a) ? "" : " capture-btn-inactive");
const playEnabled = (a: State) => !a.recording;
const playMethod = (a: State) => pauseEnabled(a) ? (() => a.control.pauseRecord()) : null;

const pauseEnabled = (a: State) => a.recording;
const pauseMethod = (a: State) => pauseEnabled(a) ? (() => a.control.pauseRecord()) : null;
const pauseStyle = (a: State) => "capture-btn" + (pauseEnabled(a) ? "" : " capture-btn-inactive");

const stopEnabled = (a: State) => a.recording;
const stopMethod = (a: State) => (() =>a.control.cmd_stoprecord());
const stopStyle = (a: State) => "capture-btn" + (stopEnabled(a) ? "" : " capture-btn-inactive");




export const FilesTable = (a: State) => (
    <table class="presets-table">
        <tr class="presets-controls-tr">
            <td>
                <cmn.ClickTextButton
                        onclick={recordMethod(a)}
                        svg={svg.Record } //svg.Play
                        cls={recordStyle(a)}
                        text="Запись"
                        disabled={!recordEnabled(a)}/>
            </td>
        </tr>
        <tr class="presets-controls-tr">
            <td>
                <cmn.ClickTextButton
                        onclick={pauseMethod(a)}
                        svg={a.paused? svg.Play : svg.Pause}
                        cls={pauseStyle(a)}
                        //text="Пауза"{a.paused? svg.Play : svg.Pause}
                        text={a.paused? "Продолжить" : "Пауза"}
                        disabled={!pauseEnabled(a)}/>
            </td>
        </tr>
        <tr class="presets-controls-tr">
            <td>
                <cmn.ClickTextButton
                        onclick={stopMethod(a)}
                        svg={svg.Stop}
                        cls={stopStyle(a)}
                        text="Стоп"
                        disabled={!stopEnabled(a)}/>
            </td>
        </tr>
        <tr>
            <td colspan="2" class="presets-ul-td">
                {a.showdlg ? <NewFileDialog control={a.control}/> : null}
                <FilesUl
                    active={a.curfile}
                    data={a.files}
                    onclick={(file: string) => () => a.control.chooseFile(file)}
                    scroll={(el) => a.control.scrollRecords(el)}/>
            </td>
        </tr>
    </table>
)

/*
<tr class="presets-controls-tr">
<td>
    <cmn.ClickTextButton
            onclick={playMethod(a)}
            svg={svg.Play}
            cls={playStyle(a)}
            text="Воспроизвести"
            disabled={!playEnabled(a)}/>
</td>         
</tr> */
