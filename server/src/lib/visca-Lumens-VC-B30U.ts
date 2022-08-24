// Модуль visca-Lumens-VC-B30U.ts содержит:
// Специфический свойства протокола управления (VISCA) для камеры Lumens-VC-B30U.ts
import {Control as VISCAControl} from "./visca";
import { ControlI } from "./camera";

export class Control extends VISCAControl implements ControlI {
    public async drive(dir: string): Promise<object> {
        switch (dir) {
        case "LEFT":
            dir = "RIGHT";
            break;
        case "RIGHT":
            dir = "LEFT"
            break;
        }
        return await super.drive(dir);
    }
}