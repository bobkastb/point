// Модуль index.tsx содержит:
// основной код клиентской части
// функция main формирует скелет html страницы 
import * as ui from "hyperoop";
import { MainController } from "./controller/main";
import * as cam from "./view/camera";
import * as swtch from "./view/switch";
import * as capt from "./view/capture";
import * as op from "./view/options";
import { opts } from "./model/options";
import * as sched from "./view/schedule";
import { LongPolling } from "./controller/utils";


async function main() {
    opts(window).switchStateRefresh = true;

    const poller = new LongPolling();
    const ctrl = new MainController();
    const videoURL = await ctrl.cameraPage.getVideoURL();

    await ctrl.setup(poller, videoURL);

    const cameras = await ctrl.cameraPage.getCameras();

    ctrl.Router.go("./#" + ctrl.Options.DefaultPage);
    await ctrl.onLocationChange(null);
    ctrl.State.VideoUrl= videoURL

    const mainView = () =>(
        window.location.hash.endsWith("camera") ?
            <cam.Main
                activecam = {ctrl.cameraPage.State.VisibleCameraID}
                //video = {videoURL}
                video = {ctrl.State.VideoUrl}
                cameras = {cameras}
                control = {ctrl.cameraPage}
                sidebar = {ctrl.State.ShowSideBar}
                togglebar = {() => ctrl.toggleSideBar()}
                showdlg = {ctrl.cameraPage.State.ShowDialog}
                showerr = {ctrl.cameraPage.State.ShowErrorsDialog}
                presets = {ctrl.cameraPage.State.Presets}
                curpreset = {ctrl.cameraPage.State.ActivePresetID}
                speedinf = {ctrl.cameraPage.State.SpeedInfo}
                errors = {ctrl.cameraPage.State.Errors}
                panorama={ctrl.cameraPage.State.PanoramaFile}
                panvisible={ctrl.cameraPage.State.PanoramaVisible}
                campos = {ctrl.cameraPage.State.CameraPos}
                camlimits = {ctrl.cameraPage.State.CameraMoveLimits}
                truncated = {ctrl.cameraPage.State.Truncated}
                videotext = {ctrl.cameraPage.State.VideoText}
                indvisible = {ctrl.cameraPage.State.IndicationVisible}/>
        :
        window.location.hash.endsWith("switch") ?
            <swtch.Main
                ctrl = {ctrl.switchPage}
                sidebar = {ctrl.State.ShowSideBar}
                naming = {ctrl.switchPage.State.SwitchNaming}
                togglebar = {() => ctrl.toggleSideBar()}
                state = {ctrl.switchPage.State.State}
                showdlg = {ctrl.switchPage.State.ShowDialog}
                presets = {ctrl.switchPage.State.Presets}
                curpreset = {ctrl.switchPage.State.ActivePresetID}
                showerr = {ctrl.switchPage.State.ShowErrorsDialog}
                errors = {ctrl.switchPage.State.Errors}/>
        :
        window.location.hash.endsWith("capture") ?
            <capt.Main
                video = {ctrl.State.VideoUrl}
                ctrl = {ctrl.capturePage}
                sidebar = {ctrl.State.ShowSideBar}
                togglebar = {() => ctrl.toggleSideBar()}
                showdlg = {ctrl.capturePage.State.ShowDialog}
                recording = {ctrl.capturePage.State.IsRecording}
                paused = {ctrl.capturePage.State.IsPaused}
                files = {ctrl.capturePage.State.Files}
                curfile = {ctrl.capturePage.State.CurrentFile}
                session = {ctrl.capturePage.State.Session}/>
        :
        window.location.hash.endsWith("options") ?
            <op.Main
                ctrl = {ctrl.optionsPage}
                sidebar = {ctrl.State.ShowSideBar}
                togglebar = {() => ctrl.toggleSideBar()}
                options = {ctrl.optionsPage.State.Options}
                folders = {ctrl.optionsPage.State.Folders}
                selection = {ctrl.optionsPage.State.ShownFolder}/>
        : 
        window.location.hash.endsWith("schedule") ?
            <sched.Main
                ctrl = {ctrl.schedulePage}
                sidebar = {ctrl.State.ShowSideBar}
                togglebar = {() => ctrl.toggleSideBar()}
                entries = {ctrl.schedulePage.State.Entries}
                enabled = {ctrl.schedulePage.State.Enabled}
                cameras = {ctrl.schedulePage.State.Cameras}
                taskprops = {ctrl.schedulePage.State.TaskProps}
                tasklog = {ctrl.schedulePage.State.TaskLog}
                records = {ctrl.schedulePage.State.RecordFiles}
                playfile = {(file: string) => {
                        ctrl.capturePage.chooseFile(file.substring(0, file.lastIndexOf('.')));
                        ctrl.Router.go("./#capture");}}
                editentryid = {ctrl.schedulePage.State.EditEntryId}
                entry2edit = {ctrl.schedulePage.State.Entry2Edit}
                presets = {ctrl.schedulePage.State.Presets}/>
        : null
    ) 

    //const mV1 = () => {        console.log("call mainView");        return mainView()    }    

    ui.init(document.getElementsByTagName('body')[0], mainView , ctrl);
    poller.run();
}

main();
