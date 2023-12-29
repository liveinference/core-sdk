
import type * as types from './types';
import { Client } from './browser-client';
import isInBrowser from './is-in-browser';
import * as utils from "./utils";
import updateParams from './params';

export default function createClient({
    token,
    key,
    expiresAt,
    expires_at,
    expires,
    audio = true,
    action = 'chat-openai',
    refreshUrl,
    refresh_url,
    store = 'tmp',
    progress = ['transcript', 'chat-completions'],
    maxDuration = 45,
    debug,
    useQuery = false, 
} : types.InputOptions = {}) : types.BrowserClientCreateResult {

    if (!isInBrowser()) {
        throw new Error('browser client must be created in browser');
    }

    if (debug === undefined) debug = utils.getApiBaseUrl().includes('localhost');
    
    if (!expiresAt && expires_at) {
        expiresAt = expires_at;
    }
    if (!expiresAt && expires) {
        expiresAt = new Date(expires * 1000);
    }

    const params: any = { 
        token: token || key, 
        expiresAt,
        audio, 
        refreshUrl: refreshUrl || refresh_url, 
        debug, 
        action, 
        store, 
        progress, 
        maxDuration
    };

    if (useQuery) {
        updateParams(params);
    }

    const client: types.Client = new Client(params);

    return { client, params };
}