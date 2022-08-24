// Модуль switch.tsx содержит:
// Элементы управления страницы управления видеокоммутатором ( /#switch )

import * as ui from "hyperoop";
//import * as model from "../model/switch";
import {SidebarTD} from "./sidebar";
import * as svg from "./svg";
import { PresetsTable } from "./presets";
import { NewErrDialog } from "./errdlg";
import {PresetInfo,PresetIdType,rSwitchState,SwitchNamingIOPins} from "@gen_lib/api_interfaces";
import {ErrorsAndWarnings} from "../controller/switch";



interface ControlI {
    connect(outp: number, inp: number);
    toggleAFV();
    deletePreset(ID: PresetIdType): Promise<void>;
    choosePreset(ID: PresetIdType): Promise<void>;
    addPreset(): Promise<PresetInfo>;
    setDialogText(txt: string);
    toggleDialog();
    toggleErrorsDialog();
}

export interface SwitchState {
    ctrl: ControlI;
    sidebar: boolean;
    naming?: SwitchNamingIOPins;
    state?: rSwitchState;
    togglebar: () => {}
    curpreset: PresetIdType;
    presets: PresetInfo[];
    showdlg: boolean;
    showerr: boolean;
    errors: ErrorsAndWarnings;
}

const tableRows = (a: SwitchState) => 
    Object.entries(a.naming.OutputNames).map(
        ([outId, [outShortName, outLongName]], row) =>
            <tr class={"switch-table-row-tr" + (row%2 ? " switch-table-row-odd" : " switch-table-row-even")}>
                <th class="switch-table-row-start" title={outLongName}>
                    {
                        (a.state && a.state.ActiveOutputs && a.state.ActiveOutputs[Number(outId)-1] > 0) ?
                            <svg.Circle cls="switch-table-indication-on"/>
                            : 
                            <svg.Circle cls="switch-table-indication-off"/>
                    }
                    {outShortName}
                </th>
                {
                    Object.entries(a.naming.InputNames).map(
                        ([inId, [inShortName, inLongName]]) =>
                            <td class="switch-table-row-td"
                                onclick={a.errors.HasErrors ? () => a.ctrl.toggleErrorsDialog() : () => a.ctrl.connect(parseInt(outId), parseInt(inId))}
                            >
                                {
                                    (a.state && a.state.Video && a.state.Video[outId] == inId) ?
                                        svg.VideoCamera({cls: "switch-table-icon"})  : ""
                                }
                                {
                                    (a.state && a.state.Audio && a.state.Audio[outId] == inId) ?
                                        svg.SoundPlus({cls: "switch-table-icon"}) : ""
                                }
                                {
                                    a.errors.HasErrors ? 
                                        <div class="switch-tab-error-div" onclick={()=>a.ctrl.toggleErrorsDialog()} title={mkErrString(a.errors.Error)}>
                                            <svg.Cancel cls="switch-error-sign"/>
                                        </div>
                                        :
                                        null
        
                                }
                            </td>
                    )
                }
            </tr>
    )

const SwitchTable = (a: SwitchState) => (
    <table class="switch-table">
        <tr class="switch-table-th">
            <th
                width={`${100/(Object.entries(a.naming.InputNames).length+1)}%`}
                class="switch-table-empty-cell"
            > Вых\Вх
            </th>
            {
                Object.entries(a.naming.InputNames).map(
                    ([id, [shortName, longName]]) =>
                        <th width={`${100/(Object.entries(a.naming.InputNames).length+1)}%`}
                            class="switch-table-input-td" title={longName}
                        >
                            {
                                (a.state && a.state.ActiveInputs && a.state.ActiveInputs[Number(id)-1] > 0) ?
                                    <svg.Circle cls="switch-table-indication-on"/>
                                    : 
                                    <svg.Circle cls="switch-table-indication-off"/>
                            }
                            {shortName}
                        </th>
                )
            }
        </tr>
        { tableRows(a) }
    </table>
)

function mkInfoString(kind: string, msgs: string[]): string {
    let result = "";
    for (const msg of msgs) {
        result += `${kind}: ${msg}\n`
    }
    return result.trim();
}

const mkErrString = (msgs: string[]): string => mkInfoString("Ошибка", msgs);
const mkWarnString = (msgs: string[]): string => mkInfoString("Предупреждение", msgs);

export const Main = (a: SwitchState) => (
    <table class="main-table">
        <tr class="main-table-tr">
            <SidebarTD rowspan={3} sidebar={a.sidebar} togglebar={a.togglebar}/>
            <td class="switch-top-td" colspan="2">
                <span class="table-caption">Коммутация</span>
                {
                    (a.errors.Error && a.errors.Error.length > 0) ? 
                        <div class="switch-error-div" onclick={()=>a.ctrl.toggleErrorsDialog()} title={mkErrString(a.errors.Error)}>
                            <svg.Cancel cls="switch-error-sign"/>
                        </div>
                        : null
                }
                {
                    (a.errors.Warning && a.errors.Warning.length > 0) ? 
                        <div class="switch-warn-div" title={mkWarnString(a.errors.Warning)}>
                            <svg.Info cls="switch-warn-sign"/>
                        </div> : null
                }
            </td>
        </tr>
        <tr class="main-table-tr">
            <td class="switch-table-td">
                { SwitchTable(a) }
            </td>
            <td class="presets-td">
                <PresetsTable
                    curpreset={a.curpreset}
                    control={a.ctrl}
                    presets={a.presets}
                    showdlg={a.showdlg}
                    controlled={a.errors.Controlled}/>
            </td>
        </tr>
        <tr class="main-table-tr">
            <td class="switch-bottom-td" colspan="2">
                <button
                    class={["choose-camera-btn", a.state?.AFV ? "btn-off" : ""].join(" ")}
                    onclick={a.errors.HasErrors ? () => a.ctrl.toggleErrorsDialog() : () => a.ctrl.toggleAFV()}
                >
                    {
                        a.state?.AFV ?
                            svg.SoundPlus({cls: "switch-afv-button-icon"})
                            :
                            svg.SoundMinus({cls: "switch-afv-button-icon"})
                    }
                    <span class="switch-afv-button-text">
                        {a.state?.AFV ? "Коммутация со звуком" : "Коммутация без звука"}
                    </span>
                </button>
                {
                    (a.showerr && a.errors.HasErrors) ? 
                        <NewErrDialog toggle={a.ctrl.toggleErrorsDialog.bind(a.ctrl)} errors={a.errors.Error !== undefined ? a.errors.Error : []}/>
                        :
                        null
                }
            </td>
        </tr>
    </table>
)
