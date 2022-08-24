// Модуль video.ts содержит:
// Функции для приема видеопотока (mjpeg) с сервера, по соединению вебсокет
// В настоящее время не используется
// Для передачи видеопотока используется поток mjpeg в картинку



export class Socket {
    private sock_: WebSocket;
    private cb_: (ev: MessageEvent) => void;
    private ecb_: (e: string) => void = null;

    constructor(url: string) {
        let hasError = false;

        console.log("Открытие веб-сокета");
        this.sock_ = new WebSocket(url); //"ws://192.168.77.40:8032/video");
        this.sock_.binaryType = "arraybuffer";

        this.sock_.onclose = (event) => {
            if (event.wasClean) {
                console.log('Соединение закрыто чисто');
            } else {
                const err = 'Нет соединения с медиасервером';
                if (!hasError && this.ecb_ != null) {
                    this.ecb_(err);
                    hasError = true;
                }
                console.error(err);
            }
            console.log('Код: ' + event.code + ' причина: ' + event.reason);
            this.sock_ = null;
        };

        this.sock_.onmessage = (event) => {
            if (hasError && this.ecb_ != null) {
                this.ecb_(null);
                hasError = false;
            }
            if (this.cb_) this.cb_(event);
        };

        this.sock_.onerror = (error: ErrorEvent) => {
            console.error("Ошибка:", error);
        };
    }

    public start(cb: (ev: MessageEvent) => void, ecb: (e: string) => void) {
        console.log("NEW SOCKET START");
        this.cb_ = cb;
        this.ecb_ = ecb;
    }

    public stop() {
        console.log("NEW SOCKET STOP");
        this.cb_ = null;
        this.ecb_ = null;
    }
}