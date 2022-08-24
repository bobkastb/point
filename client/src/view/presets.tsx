// Модуль presets.tsx содержит:
// Элементы управления пресетами камер

import * as ui from "hyperoop";
import * as cmn from "./common";
import * as svg from "./svg";
import  * as iapi from "@gen_lib/api_interfaces";
import  {PresetInfo,PresetIdType} from "@gen_lib/api_interfaces";




interface PageControl {
    deletePreset(ID: PresetIdType): Promise<void>;
    choosePreset(ID: PresetIdType): Promise<void>;
    addPreset(): Promise<PresetInfo>;
    setDialogText(txt: string);
    toggleDialog();
    toggleErrorsDialog();
}

//type  PresetInfo = iapi.PresetInfo
/*
interface PresetInfo {
    ID: number;
    Name: string;
};
*/
interface State {
    curpreset: PresetIdType;
    control: PageControl;
    presets: PresetInfo[];
    showdlg: boolean;
    controlled: boolean;
}

const PresetLi = (a: {active: boolean, name: string, onclick: ()=>void, controlled: boolean, errdlg: ()=>void}) => (
    <li class={"presets-li" + (a.active ? " presets-li-on" : "")}>
        &mdash; <a href={window.location.hash} onclick={a.controlled ? a.onclick : a.errdlg}>{a.name}</a>
    </li>
)

const PresetsUl = (a: {active: PresetIdType, data: PresetInfo[], onclick: (ID: PresetIdType) => () => void, controlled: boolean, errdlg: ()=>void}) => (
    <ul class="presets-ul">
        {a.data.map((info: PresetInfo) => (
            <PresetLi
                active={info.ID==a.active}
                name={info.Name}
                onclick={a.onclick(info.ID)}
                controlled={a.controlled}
                errdlg={a.errdlg}/>
        ))}
    </ul>
)

const initInput = (control: PageControl) => (inp) => {
    inp.value = "";
    inp.onchange = () => control.setDialogText(inp.value);
    inp.focus();
    inp.addEventListener("keyup", event => {
        if (event.key !== "Enter") return;
        control.addPreset();
        event.preventDefault();
    });
};

export const NewPresetDialog = (a: {control: PageControl}) => (
    <div class="modal">
        <div class="modal-content">
            <span class="close" onclick={() => a.control.toggleDialog()}>&times;</span>
            <p>Введите название:</p>
            <input type="text" autofocus class="preset-name-input" oncreate={initInput(a.control)}/>
            <button class="preset-create-button" type="submit" onclick={() => a.control.addPreset()}>Добавить</button>
        </div>
    </div>
)
export const PresetsTable = (a: State) => (
    <table class="presets-table">
        <tr class="presets-controls-tr">
            <td class="presets-btn-td">
                <cmn.ClickButton
                    //onclick= {() => a.control.toggleDialog()}
                    onclick={a.controlled ? () => a.control.toggleDialog() : () => a.control.toggleErrorsDialog()}
                    svg={svg.Star}
                    cls={"presets-btn" + (a.controlled ? "" : " presets-btn-off")}
                    //cls="presets-btn"
                    /></td>
            <td class="presets-btn-td">
                <cmn.ClickButton
                    onclick={() => a.control.deletePreset(a.curpreset)}
                    svg={svg.TrashBin}
                    cls="presets-btn"/></td>
        </tr>
        <tr>
            <td colspan="2" class="presets-ul-td">
                {a.showdlg ? <NewPresetDialog control={a.control}/> : null}
                <PresetsUl
                    active={a.curpreset}
                    data={a.presets}
                    onclick={(ID: PresetIdType) => () => a.control.choosePreset(ID)}
                    controlled={a.controlled}
                    errdlg={() => a.control.toggleErrorsDialog()}/>
            </td>
        </tr>
    </table>
)
