// Модуль switch.ts содержит:
// Функции для управления коммутатором на клиенте, которые вызываются со страницы "/#switch"

import * as ui from "hyperoop";
import * as utils from "./utils";
//import * as model from "../model/switch";
import { opts } from "../model/options";
import {PresetInfo,PresetIdType,rSwitchState,SwitchNamingIOPins} from "@gen_lib/api_interfaces";
import {InvalidPresetID} from "@gen_lib/api_const";
import {APIResult} from "@gen_lib/api_interfaces";

//export const InvalidPresetID= null//"-1";

export interface ErrorsAndWarnings {
    Error?: string[];
    Warning?: string[];
    Controlled: boolean;
    HasErrors: boolean;
}
export type SwitchPageState = {
    SwitchNaming?: SwitchNamingIOPins;
    State?: rSwitchState;
    ActivePresetID: PresetIdType;
    ShowDialog: boolean;
    ShowErrorsDialog: boolean;
    Presets: PresetInfo[];
    Errors: ErrorsAndWarnings;
}

export class SwitchPageController extends ui.SubActions<SwitchPageState> {
    private dialogText: string = "";

    constructor(parent: ui.Actions<object>) {
        super({
            ActivePresetID: InvalidPresetID, 
            ShowDialog: false, 
            ShowErrorsDialog: false,
            Presets: [], 
            Errors: {Controlled: true, HasErrors: false}
        }, parent);
    }

    private async switchStateRefresh() {
        if(document.visibilityState === "visible" && window.location.hash.endsWith("switch")) {
            const state = await this.getState();
            if (state !== null) this.State.State = state
        }
    }

    async setup(poll: utils.LongPolling) {
        this.State.Presets = await this.getPresets();
        this.State.SwitchNaming = await this.getNames();
        await this.switchStateRefresh();
        const self = this;
        poll.subscribe((r: APIResult) => {
            const state = r.result.switch as rSwitchState;
            if (state) self.State.State = state;
        })
    }

    async getNames(): Promise<SwitchNamingIOPins | null> {
        const res = await utils.callServer( `/cmd/switch/names` , "getNames" )

        if (res.error) return null;
        return res.result as SwitchNamingIOPins;
    }

    private setErrors(state: rSwitchState) {
        const ew: ErrorsAndWarnings = {
            Controlled: true,
            HasErrors: false
        }

        function updateError(...msgs: string[]) {
            if (ew.Error) ew.Error = ew.Error.concat(msgs);
            else ew.Error = msgs;
            ew.Controlled = false;
            ew.HasErrors = true;
        }

        function updateWarning(...msgs: string[]) {
            if (ew.Warning) ew.Warning = ew.Warning.concat(msgs);
            else ew.Warning = msgs;
        }

        if (!state.port) {
            updateError("не задан порт управления");
        } else if (!state.Controlled) {
            const dm = state.DiagnosticMessages;
            if (dm.IdError) {
                updateWarning(...dm.IdError);
            }
            if (dm.IdSet) {
                updateWarning(...dm.IdSet);
            }
            if (dm.SerialError) {
                updateError(dm.SerialError);
            }
            if (dm.InitError) {
                updateError(dm.InitError);
            }
        }
        //ew.Warning = ["ошибка 1", "ошибка 2"]; // УДАЛИТЬ!!!
        this.State.Errors = ew;
    }

    async getState(): Promise<rSwitchState | null> {
        const res = await utils.callServer( `/cmd/switch/state` , "switch.getState" )

        if (res.error) return null;
        const state = res.result as rSwitchState;
        this.setErrors(state);
        return state;
    }

    async connect(outp: number, inp: number): Promise<void> {
        await utils.callServer( `/cmd/switch/connect?input=${inp}&outputs=${outp}` , "switch.connect" )

        await this.switchStateRefresh();
        this.State.ActivePresetID = InvalidPresetID;
    }

    async toggleAFV(): Promise<void> {
        const mode = this.State.State?.AFV ? "breakaway" : "follow";
        await utils.callServer( `/cmd/switch/afv?mode=${mode}` , "switch.toggleAFV" )

        await this.switchStateRefresh();
        this.State.ActivePresetID = InvalidPresetID;
    }

    async getPresets(): Promise<PresetInfo[]> {
        const res =await utils.callServer( `/cmd/switch/preset/get` , "switch.getPresets" )

        if (res.error) return [];
        const presets = res.result as {[id: number]: PresetInfo};
        const result: PresetInfo[] = [];
        for (const k in presets) result.push(presets[k]);
        return result;
    }

    async deletePreset(ID: PresetIdType): Promise<void> {
        await utils.callServer( `/cmd/switch/preset/remove?preset=${ID}` , "switch.deletePreset" )

        this.State.Presets = await this.getPresets();
        this.State.ActivePresetID = InvalidPresetID;
    }

    async choosePreset(ID: PresetIdType): Promise<void> {
        await utils.callServer( `/cmd/switch/preset/set?preset=${ID}` , "switch.choosePreset" )

        this.State.ActivePresetID = ID;
        await this.switchStateRefresh();
    }

    async addPreset(): Promise<PresetInfo> {
        const name = encodeURIComponent(this.dialogText);
        const res =await utils.callServer( `/cmd/switch/preset/add?name=${name}` , "switch.addPreset" )

        this.State.Presets = await this.getPresets();
        this.toggleDialog();
        if (res.error) return null as PresetInfo;
        return res.result as PresetInfo;
    }

    toggleDialog() {
        this.State.ShowDialog = !this.State.ShowDialog;
    }

    toggleErrorsDialog() {
        this.State.ShowErrorsDialog = !this.State.ShowErrorsDialog;
    }

    setDialogText(txt: string) {
        this.dialogText = txt;
    }

    enter() {}
    exit() {}
}