import type * as types from './types';
import { Base } from './base';
import isInBrowser from './is-in-browser';

export class Client extends Base implements types.Client {

    constructor({token, type, expiresAt, ...options} : types.InputOptions) {
        super();
        if (!isInBrowser()) {
            throw new Error('browser client must be instantiated in browser');
        }
        if (!token && options.key) {
            token = options.key;
        }
        if (!token) {
            throw new Error('token is required for browser client');
        }
        if (!token.startsWith('ses-')) {
            throw new Error('token must start with ses-');
        }
        if (!type) {
            type = 'session-key';
        } else if (type !== 'session-key') {
            throw new Error('type must be session-key for browser client');
        }
        if (!expiresAt && options.expires_at) {
            expiresAt = options.expires_at;
        }
        if (!expiresAt || options.expires) {
            expiresAt = new Date(options.expires * 1000);
        }
        this.updateKeyInfo({key: token, type, expires_at: expiresAt, ...options});
    }

    public async getProps(): Promise<types.ClientProps> {
        const { data, error } = await this.request('/api/v1/inference/props');
        if (!data || error) {
            throw new Error(error?.message || 'failed to get props');
        }
        return data;
    }

    public async getChatCompleteOptions(): Promise<types.ChatCompletionsOptions> {
        const { data, error } = await this.request('/api/v1/inference/chat-completions-options');
        if (!data || error) {
            throw new Error(error?.message || 'failed to get chat completions options');
        }
        return data;
    }

    public async getCurrentMessages(): Promise<types.InferenceCurrentMessages> {
        const { data, error } = await this.request('/api/v1/inference/messages');
        if (!data || error) {
            throw new Error(error?.message || 'failed to get current messages');
        }
        return data;
    }

    public async getHistory(page: number = 1, size: number = 250): Promise<types.InferenceHistoryPage> {
        const { data, pagination, error } = await this.request(`/api/v1/inference/history?page=${page}&size=${size}`);
        if (!data || error) {
            throw new Error(error?.message || 'failed to get history');
        }
        return { data, pagination };
    }

    public async getFiles(page: number = 1, size: number = 250): Promise<types.MediaFilePage> {
        const { data, pagination, error } = await this.request(`/api/v1/inference/files?page=${page}&size=${size}`);
        if (!data || error) {
            throw new Error(error?.message || 'failed to get files');
        }
        return { data, pagination };
    }
}
