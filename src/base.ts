import type * as types from './types';
import isInBrowser from './is-in-browser';
import { 
    getKeyInfo, 
    request, 
    getResponse, 
    setApiBaseUrl, 
    getApiBaseUrl 
} from './utils';
import type { EventEmitter } from 'events';

const refreshMinutesBeforeExpiration = 5;

export class Base implements types.Base {

    public eventEmitter : EventEmitter | undefined;

    protected keyInfo : types.KeyInfo | undefined;
    protected refreshTimer : any | undefined;
    protected refreshUrl : string | undefined;

    public setApiBaseUrl(url: string) : void {
        setApiBaseUrl(url);
    }

    public getApiBaseUrl() : string {
        return getApiBaseUrl();
    }

    public getAuthKey() : string {
        if (!this.keyInfo || !this.keyInfo.key) {
          throw new Error('key info is not set');
        }
        return this.keyInfo.key;
    }

    public isExpired() : boolean {
        if (!this.keyInfo || this.keyInfo.expires_at === undefined) {
          throw new Error('key info is not set');
        }
        if (this.keyInfo.expires_at && this.keyInfo.expires_at < new Date()) {
          return true;
        }
        return false;
    }

    public async getKeyInfo(refetch: boolean = false) : Promise<types.KeyInfo> {
        if (refetch || !this.keyInfo) {
            const { key, type } = this.keyInfo || {};
            await this.updateKeyInfoFromServer(key, type);
        }
        return this.keyInfo!;
    }

    public async request(path : string, options : types.RequestOptions = {}) : Promise<types.ApiRequestResult> {
        if (!options.key) options.key = this.getAuthKey();
        return await request(path, options);
    }

    public async getResponse(url : string, options : types.RequestOptions = {}) : Promise<any> {
        if (!options.key) options.key = this.getAuthKey();
        return await getResponse(url, options);
    }

    public async cleanup(disableToken = false): Promise<void> {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = undefined;
        }
        if (disableToken && this.keyInfo?.key?.startsWith('ses-')) {
            await this.request('/api/v1/auth/disable');
        }
        this.keyInfo = undefined;
    }

    public setRefreshUrl(url : string) : void {
        if (!this.keyInfo?.key?.startsWith('ses-')) {
            throw new Error('refresh url is only supported for session keys');
        }
        if (!url || url === this.refreshUrl) return;
        this.refreshUrl = url;
        this.scheduleRefresh();
    }

    protected autoRefresh() : boolean {
        if (this.keyInfo?.key?.startsWith('ses-')) {
            if (this.refreshUrl) return true;
        }
        return false;
    }

    protected updateKeyInfo({ key, type, expires_at, scopes, customer_id, name } : types.ExKeyInfoOptions) : void {
        const data = this.getKeyUpdateData({ key, type, expires_at, scopes, customer_id, name });
        if (this.keyInfo) {
            const current_expires_at = this.keyInfo.expires_at;
            Object.assign(this.keyInfo, data);
            if (this.autoRefresh() && expires_at !== current_expires_at) {
                this.scheduleRefresh();
            }
        } else {
            this.keyInfo = data as types.KeyInfo;
            if (this.autoRefresh() && expires_at) {
                this.scheduleRefresh();
            }
        }
    }
    
    protected async updateKeyInfoFromServer(key?: string, type?: string) : Promise<void> {
        if (!type && key) {
            if (key.startsWith('ses-')) type = 'session-key';
            else if (key.startsWith('api-')) type = 'api-key';
            else if (key !== undefined) throw new Error('invalid key');
        } else if (type && type !== 'session-key' && type !== 'api-key') {
            throw new Error('invalid key type');
        }
        if (key) this.keyInfo = { key, expires_at: null, type };
        else if (!isInBrowser()) throw new Error('key is required');
        const data = await getKeyInfo(key, false);
        this.updateKeyInfo(data);
    }

    private getKeyUpdateData({ key, type, expires_at, scopes, customer_id, name } : types.ExKeyInfoOptions): types.ExKeyInfoOptions {
        if (typeof expires_at === 'string') {
            expires_at = new Date(expires_at);
        }
        const data: any = { key, type, expires_at };
        if (scopes) data.scopes = scopes;
        if (customer_id && type === 'session-key') data.customer_id = customer_id;
        if (name && type === 'api-key') data.name = name;
        return data;
    }

    private scheduleRefresh() : void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = undefined;
        }
        const { expires_at } = this.keyInfo;
        if (!expires_at) {
          return;
        }
        if (!this.refreshUrl) {
            return;
        }
        let timeout = expires_at.getTime() - Date.now() - refreshMinutesBeforeExpiration * 60 * 1000;
        if (timeout < 0) timeout = 0;
        this.refreshTimer = setTimeout(async () => {
            try {
                const { data, error} = await request(this.refreshUrl, { apiCall: false });
                if (!data || error) {
                    throw new Error(error.message || 'failed to refresh key info');
                }
                this.updateKeyInfo(data);
                if (this.eventEmitter) this.eventEmitter.emit('key-refreshed');
            } catch (e) {
                console.error('failed to refresh key info', e);
            }
        }, timeout);
    }
}
