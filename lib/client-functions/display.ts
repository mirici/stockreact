import * as ui from '@sage/xtrem-ui';
import { ToastProps } from 'carbon-react/esm/components/toast';

export class NotifyAndWait {
    pageInstance: ui.Page;

    constructor(instance: ui.Page) {
        this.pageInstance = instance;
    }

    async showAndWait(message: string, type: ToastProps['variant'], timeout?: number) {
        await _notifyAndWait(this.pageInstance, message, type, timeout);
    }

    show(message: string, type: ToastProps['variant'], timeout?: number) {
        _notify(this.pageInstance, message, type, timeout);
    }
}

function _notifyAndWait(
    pageInstance: ui.Page,
    localizedNotificationText: string,
    type: ToastProps['variant'],
    timeout?: number,
) {
    return new Promise<void>(resolve => {
        _notify(pageInstance, localizedNotificationText, type, timeout);
        setTimeout(resolve, timeout);
    });
}

function _notify(
    pageInstance: ui.Page,
    localizedNotificationText: string,
    type: ToastProps['variant'],
    timeout = 5000,
) {
    pageInstance.$.showToast(localizedNotificationText, { type: type, timeout });
}
