
const keys: string[] = ['token', 'action', 'audio', 'video', 'store', 'tts-key', 'progress', 'max-duration', 'refresh-url', 'debug'];

export default function getParams(params = {} as any) {
    const query = new URLSearchParams(window.location.search);
    for (const key of keys) {
        let value: any = query.get(key);
        if (value) {
            if (['audio', 'video', 'debug'].includes(key)) {
                value = value.toLowerCase();
                value = ['true', '1', 'yes'].includes(value);
                params[key] = value;
            } else if (key === 'progress') {
                if ([false, 'false', '0', 'no', '[]'].includes(value)) {
                    params[key] = [];
                } else if (['true', '1', 'yes'].includes(value)) {
                    params[key] = ['transcript', 'chat-completions'];
                } else {
                    params[key] = value.split(',').map((v: string) => v.trim()).filter((v: string) => ['transcript', 'chat-completions'].includes(v));
                }
            } else if (key === 'max-duration') {
                value = Number(value);
                if ([30, 45, 60, 90].includes(value)) {
                    params['maxDuration'] = value;
                } else {
                    params['maxDuration'] = 45;
                }
            } else if (key === 'tts-key') {
                params['ttsKey'] = value;
            } else if (key === 'refresh-url') {
                params['refreshUrl'] = value;
            } else if (key === 'key') {
                params['token'] = value;
            } else {
                params[key] = value;
            }
        }
    }
    return params;
}