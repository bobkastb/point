// Модуль camera.tsx содержит:
// Элементы управления страницы управления камерами (/#camera)
import * as ui from "hyperoop";
import { SidebarTD } from "./sidebar";
import * as cmn from "./common";
import * as svg from "./svg";
import * as model from "../model/camera";
import * as vmodel from "../model/video";
import { PresetsTable } from "./presets";
import * as video from "./video";
import { NewErrDialog } from "./errdlg";
import * as pano from "./panorama";
//import {rCameraState} from "../model/camera";
import {rCameraState,iCameraData_PosExt,rCameraSoftPreset
    ,iCameraHumanLimits,rCameraSpeedInfo,rImageTruncateData,tTruncateValue} from "@gen_lib/camera_interfaces";
import {PresetIdType  } from "@gen_lib/api_interfaces";


export interface CameraPageControl {
    setVisibleCamera(ID: string);
    moveVisibleCamera(dir: string);
    stopVisibleCamera();
    setVisibleCameraSpeed(val: number);
    getPresets(cameraID: string): Promise<rCameraSoftPreset[]>;
    addPreset(): Promise<rCameraSoftPreset>;
    deletePreset(ID: PresetIdType): Promise<void>;
    choosePreset(ID: PresetIdType): Promise<void>;
    setDialogText(txt: string);
    toggleDialog();
    toggleErrorsDialog();
    togglePanorama();
    varea_mouseevent( event:MouseEvent );
    varea_panoevent( event:MouseEvent );
    makePanorama();
    toggleIndication();
    onSocketError(msg: string);
    setVideoCallback(cb: (ev: MessageEvent) => void);
}

export interface CameraState {
    cameras: rCameraState[];
    activecam: string;
    video: string;
    curpreset: PresetIdType;
    control: CameraPageControl;
    sidebar: boolean;
    togglebar: () => {}
    showdlg: boolean;
    showerr: boolean;
    presets: rCameraSoftPreset[];
    speedinf: rCameraSpeedInfo;
    errors: model.PerCameraErrors;
    panorama: string;
    panvisible: boolean;
    campos: iCameraData_PosExt | null;
    camlimits: iCameraHumanLimits | null;
    truncated: rImageTruncateData | null;
    videotext: vmodel.TextTable;
    indvisible: boolean;
}

function makeDiagnString(kind: string, ctrl?: string[], comm?: string[]): string {
    let result = "";
    if (ctrl) {
        for (const x of ctrl) {
            result += `${kind}: ${x}\n`
        }
    }
    if (comm) {
        for (const x of comm) {
            result += `${kind}: ${x}\n`
        }
    }
    return result.trim();
}

function collectErrors(ew: model.ErrorsAndWarnings): string[] {
    let result = [];
    if (ew.CtrlError) {
        for (const x of ew.CtrlError) {
            result.push(x);
        }
    }
    if (ew.CommError) {
        for (const x of ew.CommError) {
            result.push(x);
        }
    }
    return result;
}


const mkErrString = (ctrl?: string[], comm?: string[]) => makeDiagnString("Ошибка", ctrl, comm);
const mkWrnString = (ctrl?: string[], comm?: string[]) => makeDiagnString("Предупреждение", ctrl, comm);

//const mkErrString = (ctrl?: string[], comm?: string[]) => (ctrl ? JSON.stringify(ctrl) + " :: " +  (comm ? JSON.stringify(comm) : "") : "").trim();

const CameraButton = (a: {cam: rCameraState, on: boolean, onclick: ()=>void, errors: model.ErrorsAndWarnings}) => (
    <div class={["camera-choose-button-div", a.on ? "" : "camera-choose-button-div-off"].join(" ")} >
        <button
            class={["choose-camera-btn", a.on ? "" : "btn-off"].join(" ")}
            onclick={a.onclick}
        >
            {a.cam.Name}
        </button>
        <div class="camera-errors-div">
            {(a.errors.CommError || a.errors.CtrlError) ? 
                <div style="display:inline-block" title={mkErrString(a.errors.CtrlError, a.errors.CommError)}>
                    <svg.Cancel cls="error-icon"/>
                </div> : null}
            {(a.errors.CommWarning || a.errors.CtrlWarning) ? 
                <div style="display:inline-block" title={mkWrnString(a.errors.CtrlWarning, a.errors.CommWarning)}>
                    <svg.Info cls="warn-icon"/>
                </div>: null}
        </div>
    </div>
);

function clickable(dir: string, pos: iCameraData_PosExt | null, limits: iCameraHumanLimits | null, truncated: rImageTruncateData | null): boolean {
    if (!pos || !limits) {
        return true;
    }
    const [x, y] = pos.PanTiltPos_h;
    const z = pos.ZoomPos_h;
    const {x: [xmin, xmax], y: [ymin, ymax]} = limits.PanTiltPos_h;
    const [zmin, zmax] = limits.ZoomPos_h;

    let tpx: tTruncateValue = 0;
    let tpy: tTruncateValue = 0;
    let tpz: tTruncateValue = 0;

    if (truncated && truncated.PanTiltPos) {
        [tpx, tpy] = truncated.PanTiltPos;
    }

    if (truncated && truncated.ZoomPos) {
        tpz = truncated.ZoomPos;
    }

    switch (dir) {
    case "UP":
        return tpy < 1 && y < ymax;
    case "LEFT":
        return tpx > -1 && x > xmin;
    case "RIGHT":
        return tpx < 1 && x < xmax;
    case "DOWN":
        return tpy > -1 && y > ymin;
    case "PLUS":
        return tpz < 1 && z < zmax;
    case "MINUS":
        return tpz > -1 && z > zmin;
    }
    return true;    
}

function styleBtn(ctrl: boolean, cls: string, dir: string, pos: iCameraData_PosExt, limits: iCameraHumanLimits, truncated: rImageTruncateData | null) {
    if (!ctrl || !clickable(dir, pos, limits, truncated)) return cls + " inactive-move-button";
    return cls;
}

const CameraMoveArrows = (a: {
        onmousedown: (dir:string) => () => void, 
        onmouseup: () => void, 
        onspeedchange: (v:number) => void,
        si:rCameraSpeedInfo,
        errors: model.ErrorsAndWarnings,
        onErrors: (errors: model.ErrorsAndWarnings) => () => void,
        pos: iCameraData_PosExt | null,
        limits: iCameraHumanLimits | null,
        truncated: rImageTruncateData | null,
    }) => (
    <table class="camera-pos-table">
        <tr>
            <td class="camera-pos-btn-td"></td>
            <td class="camera-pos-btn-td">
                <cmn.MoveButton
                    cls={styleBtn(a.errors.Controlled, "arrow-up", "UP", a.pos, a.limits, a.truncated)}
                    onmousedown={a.errors.Controlled ? a.onmousedown("UP") : a.onErrors(a.errors)}
                    onmouseup={a.errors.Controlled ? a.onmouseup : null}
                    svg={svg.Arrow}
                    disabled = {!clickable("UP", a.pos, a.limits, a.truncated)}/>
            </td>
            <td class="camera-pos-btn-td"></td>
        </tr>
        <tr>
            <td class="camera-pos-btn-td">
                <cmn.MoveButton
                    cls={styleBtn(a.errors.Controlled, "arrow-left", "LEFT", a.pos, a.limits, a.truncated)}
                    onmousedown={a.errors.Controlled ? a.onmousedown("LEFT") : a.onErrors(a.errors)}
                    onmouseup={a.errors.Controlled ? a.onmouseup : null}
                    svg={svg.Arrow}
                    disabled = {!clickable("LEFT", a.pos, a.limits, a.truncated)}/>
            </td>
            {a.errors?.Controlled ? 
                <td class="camera-pos-btn-td"></td>
                :
                <td class="camera-pos-btn-td" title={mkErrString(a.errors?.CtrlError)}>
                    <cmn.MoveButton
                        cls="camera-not-controlled-sign"
                        onmousedown={a.onErrors(a.errors)}
                        onmouseup={null}
                        svg={svg.Cancel}/>
                </td>   
            }
            <td class="camera-pos-btn-td">
                <cmn.MoveButton
                    cls={styleBtn(a.errors.Controlled, "arrow-right", "RIGHT", a.pos, a.limits, a.truncated)}
                    onmousedown={a.errors.Controlled ? a.onmousedown("RIGHT") : a.onErrors(a.errors)}
                    onmouseup={a.errors.Controlled ? a.onmouseup : null}
                    svg={svg.Arrow}
                    disabled = {!clickable("RIGHT", a.pos, a.limits, a.truncated)}/>
            </td>
        </tr>
        <tr>
            <td class="camera-pos-btn-td"></td>
            <td class="camera-pos-btn-td">
                <cmn.MoveButton
                    cls={styleBtn(a.errors.Controlled, "arrow-down", "DOWN", a.pos, a.limits, a.truncated)}
                    onmousedown={a.errors.Controlled ? a.onmousedown("DOWN") : a.onErrors(a.errors)}
                    onmouseup={a.errors.Controlled ? a.onmouseup : null}
                    svg={svg.Arrow}
                    disabled = {!clickable("DOWN", a.pos, a.limits, a.truncated)}/>
            </td>
            <td class="camera-pos-btn-td"></td>
        </tr>
        <tr>
            <td class="camera-pos-btn-td" colspan="3">
                {a.errors?.Controlled ? <input type="range"
                    value={a.si.speed}
                    min={a.si.speedRange[0]} max={a.si.speedRange[1]}
                    onchange = {(el) => a.onspeedchange(el.target.value)}
                    readonly = {a.si.speedRange[0] == a.si.speedRange[1]}>
                </input> : ""}
            </td>
        </tr>
        <tr>
            <td class="camera-pos-btn-td">
                <cmn.MoveButton
                    cls={styleBtn(a.errors.Controlled, "magnify-btn", "MINUS", a.pos, a.limits, a.truncated)}
                    onmousedown={a.errors.Controlled ? a.onmousedown("MINUS") : a.onErrors(a.errors)}
                    onmouseup={a.errors.Controlled ? a.onmouseup : null}
                    svg={svg.MagnifyMinus}
                    disabled = {!clickable("MINUS", a.pos, a.limits, a.truncated)}/>
            </td>
            <td class="camera-pos-btn-td"></td>
            <td class="camera-pos-btn-td">
                <cmn.MoveButton
                    cls={styleBtn(a.errors.Controlled, "magnify-btn", "PLUS", a.pos, a.limits, a.truncated)}
                    onmousedown={a.errors.Controlled ? a.onmousedown("PLUS") : a.onErrors(a.errors)}
                    onmouseup={a.errors.Controlled ? a.onmouseup : null}
                    svg={svg.MagnifyPlus}
                    disabled = {!clickable("PLUS", a.pos, a.limits, a.truncated)}/>
            </td>
        </tr>
    </table>
)

const vid = new video.Stream("-=CAMERA=-");
const pan = new pano.PanEvents();

export const Main = (a: CameraState) => (
    <table class="main-table">
        <tr class="main-table-tr">
            <SidebarTD rowspan={3} sidebar={a.sidebar} togglebar={a.togglebar}/>
            <td colspan="2" class="choose-camera-td">
                {
                    (a.showerr && (a.errors[a.activecam]?.HasCommErrors || a.errors[a.activecam]?.HasCtrlErrors)) ? 
                        <NewErrDialog toggle={a.control.toggleErrorsDialog.bind(a.control)} errors={collectErrors(a.errors[a.activecam])}/>
                        :
                        null
                }
                <div class="camera-choose-buttons-box">
                    {a.cameras.map((cam) => <CameraButton
                        cam={cam}
                        on={cam.ID === a.activecam}
                        onclick={() => a.control.setVisibleCamera(cam.ID)}
                        errors = {a.errors[cam.ID]}
                    />)}
                    { 
                        (a.errors[a.activecam].Controlled && a.errors[a.activecam].Visible) ?
                            <div class="dropdown-menu-div">
                                <div class="dropdown-menu-btn"><svg.Grip cls="dropdown-menu-sign"/></div>
                                <div class="dropdown-content">
                                    <ul class="dropdown-ul">
                                        <li class="dropdown-li" onclick={()=>a.control.togglePanorama()}>
                                            { a.panvisible ? "Скрыть панораму" : "Показать панораму" }
                                        </li>
                                        <li class="dropdown-li" onclick={()=>a.control.makePanorama()}>Новая панорама</li>
                                        <li class="dropdown-li" onclick={()=>a.control.toggleIndication()}>
                                            { a.indvisible ? "Скрыть индикацию" : "Показать индикацию" }
                                        </li>
                                    </ul>
                                </div>
                            </div>
                            :
                            ""
                    }
                </div>
            </td>
        </tr>
        <tr class="main-table-tr">
            <td rowspan="2" class="video-td">
                {a.errors[a.activecam]?.Visible ? 
                    <div class="video-div2">
                        {
                            (a.panvisible ? 
                                <canvas class="panorama-img2"
                                    oncreate = {pan.onCreate(a.panorama, a.campos, a.indvisible)}
                                    onupdate = {pan.onUpdate(a.panorama, a.campos, a.indvisible)}
                                    ondestroy = {() => pan.onDestroy()}
                                    onclick={ (event)=>a.control.varea_panoevent(event) }
                                />
                                :
                                "")
                        }
                        {
                            a.video.startsWith("ws:") ?
                                <canvas class="camera-video2"
                                oncreate={vid.onCreate(a.control)}
                                onupdate = {vid.onUpdate(a.control)}
                                ondestroy={() => vid.onDestroy()}
                                ondblclick={ (event)=>a.control.varea_mouseevent(event) }
                                onwheel={ (event)=>a.control.varea_mouseevent(event) }
                                onmousedown={ (event)=>a.control.varea_mouseevent(event) }
                                onmouseup={ (event)=>a.control.varea_mouseevent(event) }
                                />
                                :
                                <div>
                                    <img src={a.video} class="camera-video2" 
                                    onerror={ vmodel.onErrorVideoMjpg }
                                     />
                                </div>
                                // img/videoNotAccessible.jpg
                                //<div style="margin-top: -60px;color: lightgreen;margin-left: 50px;">Исполинская звездная спираль   </div>
                        }
                        
                                    <div style="margin-left: 50px; font-size:12px">
                                        { a.indvisible ? a.videotext["location"][0] : "" }
                                    </div>
                                    
                        {
                            vid.setTable(a.videotext)
                        }
                    </div>
                    :
                    <div class="video-div" title={a.errors[a.activecam]?.HasCommErrors ? mkErrString([], a.errors[a.activecam]?.CommError) : ""}>
                        {a.errors[a.activecam]?.HasCommErrors ? 
                            <svg.Cancel cls="camera-not-visible-sign"/>
                            :
                            ""
                        }
                        {
                            (a.errors[a.activecam]?.HasCommErrors || a.errors[a.activecam]?.HasCtrlErrors) ?
                                <div class="in-camscreen-errors">
                                    {a.errors[a.activecam]?.CtrlError?.map(err => <p>{`Ошибка: ${err}`}</p>).concat(
                                        a.errors[a.activecam]?.CommError?.map(err => <p>{`Ошибка: ${err}`}</p>)
                                    )}
                                </div>
                                :
                                ""
                        }
                    </div>
                }
            </td>
            <td class="camera-pos-td">
                <CameraMoveArrows
                    onmousedown={(dir: string) => () => a.control.moveVisibleCamera(dir)}
                    onmouseup={()=>a.control.stopVisibleCamera()}
                    onspeedchange={(v: number) => a.control.setVisibleCameraSpeed(v)}
                    si={a.speedinf}
                    errors={a.errors[a.activecam]}
                    onErrors={(errors: model.ErrorsAndWarnings)=>()=>a.control.toggleErrorsDialog()}
                    pos = {a.campos}
                    limits = {a.camlimits}
                    truncated = {a.truncated}/>
            </td>
        </tr>
        <tr class="main-table-tr">
            <td class="presets-td">
                <PresetsTable
                    curpreset={a.curpreset}
                    control={a.control}
                    presets={a.presets}
                    showdlg={a.showdlg}
                    controlled={a.errors[a.activecam].Controlled}
                />
            </td>
        </tr>
    </table>
)