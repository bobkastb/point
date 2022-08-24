// Модуль camera.ts содержит:
// Интерфейсы для управления камерой



export interface ErrorsAndWarnings {
    CtrlError?: string[];
    CtrlWarning?: string[];
    CommError?: string[];
    CommWarning?: string[];
    Controlled: boolean;
    Visible: boolean;
    HasCtrlErrors: boolean;
    HasCommErrors: boolean;
}

export interface PerCameraErrors {
    [id: string]: ErrorsAndWarnings;
}




