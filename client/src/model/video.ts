// Модуль video.ts содержит:
// Интерфейсы  для работы с видеопотоком (mjpeg)

export type TextPosX = "left" | "center" | "right";
export type TextPosY = "bottom" | "center" | "top";
export type StyledText = [string, string]; // [text, color]

export type TextTable = {[pos: string]: StyledText};

//export function setTableText(tab: TextTable, txt: string | null, [posx, posy]: [TextPosX, TextPosY] = ["left", "bottom"], color: string = "black"): TextTable {
export function setTableText(tab: TextTable, txt: string | null, keyp: [TextPosX, TextPosY]| string , color: string = "black"): TextTable {    
    let key = typeof keyp == "object" ? keyp.join('_') : keyp;
    const result = {...tab}
    if ( txt ) {
        result[key] = [txt, color];
    } else {
        delete result[key];
    }
    return result;
}


export let onErrorVideoMjpg=()=>{};
export function Set_onErrorVideoMjpg( f= ()=>{}) {
    onErrorVideoMjpg = f;
}



