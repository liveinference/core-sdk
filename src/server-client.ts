
import { Base } from './base';
import isInBrowser from './is-in-browser';
import type * as types from './types';

export class ServerClient extends Base {

    constructor({apiKey, type, expiresAt, ...options} : types.ClientCreateOptions) {
        super();
        if (isInBrowser()) {
            throw new Error('server client can not instantiated in browser');
        }
        if (!apiKey && options.key) {
            apiKey = options.key;
        }
        if (!apiKey) {
            throw new Error('api key is required for server client');
        } else {
            if (!apiKey.startsWith('api-')) {
              throw new Error('api key must start with api- for server client');
            }
        }
        if (!type) {
            type = 'api-key';
          } else if (type !== 'api-key') {
            throw new Error('api key info must be of type api-key for server client');
        }
        if (!expiresAt && options.expires_at) {
            expiresAt = options.expires_at;
        }
        if (!expiresAt || options.expires) {
            expiresAt = new Date(options.expires * 1000);
        }
        if (expiresAt === undefined) {
            this. updateKeyInfoFromServer(apiKey, type);
        } else {
            this.updateKeyInfo({key: apiKey, type, expires_at: expiresAt, ...options});
        }
    }

    public async getProps(key: string) : Promise<types.ApiRequestResult> {
        return await this.request('/api/v1/inference/props/' + key);
    }

    public async createSession(options : types.KeyCreateOptions = {}) : Promise<types.ApiRequestResult> {
        return await this.request('/api/v1/auth/session-key', { body: options });
    }

    public async createApiKey(options : types.KeyCreateOptions = {}) : Promise<types.ApiRequestResult> {
        return await this.request('/api/v1/auth/api-key', { body: options });
    }

    public async getInfo(key: string) : Promise<types.ApiRequestResult> {
        return await this.request('/api/v1/auth/info/' + key);
    }

    public async disableKey(key: string) : Promise<types.ApiRequestResult> {
        return await this.request('/api/v1/auth/disable/' + key);
    }

    public async getFiles(idKey: string, page: number = 1, size: number = 250): Promise<types.MediaFilePage> {
        const { data, pagination } = await this.request(`/api/v1/inference/files/${idKey}?page=${page}&size=${size}`) || {};
        return { data, pagination };
    }

    public async getHistory(idKey: string, page: number = 1, size: number = 250): Promise<types.MediaFilePage> {
        const { data, pagination } = await this.request(`/api/v1/inference/history/${idKey}?page=${page}&size=${size}`) || {};
        return { data, pagination };
    }

    public async setParams(data : any) : Promise<types.ApiRequestResult> {
        return await this.request('/api/v1/params', { method: 'POST', body: data});
    }

    public async getParams() : Promise<types.ApiRequestResult> {
        return await this.request('/api/v1/params');
    }

    public async updateParams(data : any) : Promise<types.ApiRequestResult> {
        return await this.request('/api/v1/params', { method: 'PUT', body: data});
    }

    public async resetParams() : Promise<types.ApiRequestResult> {
        return await this.request('/api/v1/params', { method: 'DELETE' });
    }

    async getApiSession(userId: string): Promise<types.ApiSessionResult | null> {
        const { data, error } = await this.request('/api/v1/user/api-session-link/' + userId);
        if (!data || error) return null;
        return data;
    }

    async linkApiSession(userId: string, apiSessionToken: string, apiSessionExpires: number): Promise<boolean> {
        if (!userId) {
            throw new Error("userId is required");
        }
        if (!apiSessionToken) {
            throw new Error("apiSessionToken is required");
        }
        if (!apiSessionExpires) {
            throw new Error("apiSessionExpires is required");
        }
        const body = { userId, apiSessionToken, apiSessionExpires };
        const { error } = await this.request('/api/v1/user/api-session-link', 
            { method: 'POST', body });
        if (error) return false;   
        else return true;
    }

    async unlinkApiSession(userId: string): Promise<boolean> {
        const { error } = await this.request('/api/v1/user/api-session-link/' + userId, 
            { method: 'DELETE' });
        if (error) return false;   
        else return true;
    }

    async createApiSession(userId: string, email: string, expiresInMinutes: number): Promise<types.ApiSessionResult> {
        const { data: {key: apiSessionToken, expires_at}, error } = 
            await this.createSession({
                expires_in_minutes: expiresInMinutes, 
                customer_id: email || userId
            });
        if (error) {
            throw new Error(error.message);
        }
        let apiSessionExpires: number;
        if (typeof expires_at === 'string') {
            apiSessionExpires = Math.round(new Date(expires_at).getTime() / 1000);
        } else {
            apiSessionExpires = Math.round((expires_at as Date).getTime() / 1000);
        }
        return { apiSessionToken, apiSessionExpires };
    }

    async syncApiSession(userId: string, email: string, expiresInMinutes: number = 120, minimaExpiresInMinutes: number = 15) : Promise<types.ApiSessionResult> {
        let { apiSessionToken, apiSessionExpires } = await this.getApiSession(userId) || {};
        if (!apiSessionToken || !apiSessionExpires || apiSessionExpires * 1000 - Date.now() < minimaExpiresInMinutes * 60000) {
            const result = await this.createApiSession(userId, email, expiresInMinutes);
            apiSessionToken = result.apiSessionToken;
            apiSessionExpires = result.apiSessionExpires;
            await this.linkApiSession(userId, apiSessionToken, apiSessionExpires);
            return { apiSessionToken, apiSessionExpires };
        }
        return { apiSessionToken, apiSessionExpires };
    } 
}
