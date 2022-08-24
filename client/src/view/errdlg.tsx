// Модуль errdlg.tsx содержит:
// Диалог сообщений об ошибке 
import * as ui from "hyperoop";

export const NewErrDialog = (a: {toggle: () => void, errors: string[]}) => (
    <div class="modal">
        <div class="modal-content">
            <span class="close" onclick={a.toggle}>&times;</span>
            <div class="in-camscreen-errors">
                {a.errors.map(err => <p>
                    {`Ошибка: ${err}`}
                </p>)}
            </div>
        </div>
    </div>
)