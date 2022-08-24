// Модуль capture.tsx содержит:
// Элементы управления страницы видеозахвата ( /#capture )


import * as ui from "hyperoop";
import {SidebarTD} from "./sidebar";
import * as svg from "./svg";
import * as video from "./video";
import { FilesTable , iPageControl } from "./caplist";
import * as cmn from "./common";
import * as mvideo from "../model/video";

interface ControlI extends iPageControl {
    setVideoCallback(cb: (ev: MessageEvent) => void);
}

export interface CaptureState {
    ctrl: ControlI;
    sidebar: boolean;
    togglebar: () => {};
    showdlg: number;
    video: string;
    recording: boolean;
    paused: boolean;
    files: string[];
    curfile: string;
    session: string;
}

const vid = new video.Stream("-=CAPTURE=-");

export const Main = (a: CaptureState) => (
    <table class="main-table">
        <tr class="main-table-tr">
            <SidebarTD rowspan={3} sidebar={a.sidebar} togglebar={a.togglebar}/>
            <td class="switch-top-td" colspan="2">
                <span class="table-caption">Захват и просмотр видео</span>
            </td>
        </tr>
        <tr class="main-table-tr">
            <td class="switch-table-td">
                <div class="video-div">
                    {
                        a.curfile === "" ?
                        (
                            a.video.startsWith("ws:") ?
                                <canvas class="camera-video"
                                oncreate={vid.onCreate(a.ctrl)}
                                onupdate = {vid.onUpdate(a.ctrl)}
                                ondestroy={() => vid.onDestroy()}
                                />
                                :
                                <img src={a.video} class="camera-video2" onerror={ mvideo.onErrorVideoMjpg  } />
                        )
                        :
                        <div class="camera-video" ondestroy={() => a.ctrl.chooseFile("")}>
                            <cmn.ClickButton
                                style="position: fixed; right: 0px;"
                                onclick={() => a.ctrl.chooseFile("")} 
                                svg={svg.Close}
                                cls="close-video-btn"
                                btnclass="button-right"/>
                            <video src={`/video/${a.curfile}?session=${a.session}`} class="captured-video" controls autoplay muted/>
                            
                        </div>
                    }
                </div>
             </td>
            <td class="presets-td">
                <FilesTable
                    curfile={a.curfile}
                    files={a.files}
                    showdlg={a.showdlg}
                    control={a.ctrl}
                    recording={a.recording}
                    paused={a.paused}/>
            </td>
        </tr>
        <tr class="main-table-tr">
            <td class="switch-bottom-td" colspan="2">
            </td>
        </tr>
    </table>
)

//<div style="margin-top: -60px;color: lightgreen;margin-left: 50px;">Исполинская звездная спираль   </div>