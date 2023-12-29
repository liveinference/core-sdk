import type { EventEmitter } from 'events';

export interface Base {
    eventEmitter : EventEmitter | undefined;
    setApiBaseUrl(url: string) : void;
    getApiBaseUrl() : string;
    getAuthKey() : string;
    isExpired() : boolean;
    getKeyInfo(refetch: boolean) : Promise<KeyInfo>;
    request(path : string, options : RequestOptions) : Promise<ApiRequestResult>;
    getResponse(url : string, options : RequestOptions) : Promise<any>;
    cleanup(disableToken: boolean): Promise<void>;
    setRefreshUrl(url : string) : void;
}

export interface Client extends Base {
    getProps(): Promise<ClientProps>;
    getChatCompleteOptions(): Promise<ChatCompletionsOptions>;
    getCurrentMessages(): Promise<InferenceCurrentMessages>;
    getHistory(page: number, size: number): Promise<InferenceHistoryPage>;
    getFiles(page: number, size: number): Promise<MediaFilePage>;
}

export interface ServerClient extends Base {
    getProps(key: string) : Promise<ApiRequestResult>;
    createSession(options : KeyCreateOptions) : Promise<ApiRequestResult>;
    createApiKey(options : KeyCreateOptions) : Promise<ApiRequestResult>;
    getInfo(key: string) : Promise<ApiRequestResult>;
    disableKey(key: string) : Promise<ApiRequestResult>;
    getFiles(idKey: string, page: number, size: number): Promise<MediaFilePage>
    getHistory(idKey: string, page: number, size: number): Promise<MediaFilePage>;
    setParams(data : any) : Promise<ApiRequestResult>;
    getParams() : Promise<ApiRequestResult>;
    updateParams(data : any) : Promise<ApiRequestResult>;
    resetParams() : Promise<ApiRequestResult>;
    getApiSession(userId: string): Promise<ApiSessionResult | null>;
    linkApiSession(userId: string, apiSessionToken: string, apiSessionExpires: number): Promise<boolean>;
    unlinkApiSession(userId: string): Promise<boolean>;
    createApiSession(userId: string, email: string, expiresInMinutes: number): Promise<ApiSessionResult>;
    syncApiSession(userId: string, email: string, expiresInMinutes: number, minimaExpiresInMinutes: number) : Promise<ApiSessionResult>;
}

export interface ClientCreateOptions {
    apiKey?: string,
    key?: string,
    expiresAt?: Date | String | null,
    expires_at?: Date | String | null,
    expires?: number,
    type?: string,
    scopes?: string[],
    customer_id?: string,   // session key only
    name?: string           // api key only
}

export interface InputOptions {
    token?: string,
    key?: string,
    type?: string,
    expiresAt?: Date | String,
    expires_at?: Date | String,
    expires?: number,
    audio?: boolean,
    action?: string,
    refreshUrl?: string,
    refresh_url?: string,
    store?: string,
    progress?: string[],
    maxDuration?: number,
    useQuery?: boolean,
    debug?: boolean,
}

export interface ExKeyInfoOptions {
    key: string,
    expires_at: Date | String | null,
    type?: string,
    scopes?: string[],
    customer_id?: string,           // session key only
    name?: string                   // api key only
    enabled?: boolean,              // info only
    expired?: boolean,              // info only
    last_used_at?: Date | String | null,  // info only
    usage_count?: number,           // info only
    created_at?: Date | String,     // info only
    updated_at?: Date | String,     // info only
    data?: any,             
    params?: any,           
}

export interface Params {
    key?: string,
    action?: string,
    audio?: boolean,
    video?: boolean,
    debug?: boolean,
    store?: string,
    ttsKey?: string;
    stream?: boolean,
    refreshUrl?: string,
    maxDuration?: number;
}

export interface BrowserClientCreateResult {
    client: Client,
    params: Params,
}

export interface KeyInfo {
    key: string,
    expires_at: Date | null,
    type: string,
    scopes?: string[],
    customer_id?: string,   // session key only
    name?: string           // api key only
}

export interface KeyCreateOptions {
    expires_in_minutes?: number,
    expires_in_days?: number,
    customer_id?: string,
    scopes?: string[], 
    origin?: string, 
    data?: any,
    params?: any,
}

export interface RequestOptions {
    key?: string,
    method?: string,
    body?: any,
    headers?: Headers
    useQuery?: boolean,
    apiCall?: boolean,
}

export interface AudioInferenceOptions  {
    key?: string, 
    expired_at?: Date | string, 
    audioRef?: any, 
    debug?: boolean
}

export interface KeyItem {
    id: number,
    key: string,
    enabled: boolean,
    expires_at: String | null,
    usage_count: number,
    last_used_at: String | null,
    created_at: String,
    updated_at: String,
}

export interface ResponsiveImage {
    alt: string,
    srcset: string,
    src: string,
    width: number,
    height: number
}

export interface AssetSrc {
    src: string,
    size: number,
    width?: number,
    height?: number
}

export interface AssetInfo {
    id: string,
    name: string,
    caption: string,
    alt: string,
    mime: string,
    created_at: string,
    updated_at: string,
    assets?: {
        [key: string]: AssetSrc
    },
    src?: string,
    size?: number
}

export interface SubmitFileOptions {
    filename: string,
    alt?: string, 
    caption?: string,
    quality?: number, 
    rotate?: boolean,
    responsive?: boolean,
    breakpoints?: { [key: string]: BreakpointOptions | number } 
}

export interface SubmitUrlOptions {
    url: string, 
    alt?: string, 
    caption?: string,
    quality?: number, 
    rotate?: boolean,
    responsive?: boolean,
    breakpoints?: { [key: string]: BreakpointOptions | number } 
}

export interface BreakpointOptions {
    width: number,
    height?: number,
    fit?: string,
}

export interface LiveInferenceOptions {
    audio?: boolean,
    video?: boolean,
    store?: string,
    maxDuration?: number,
    ttsKey?: string;
    progress?: string[],
    debug?: boolean
}

export interface RequestResponseOptions {
    request: string,
    data: any,
}

export interface TextContent {
    role: string,
    content: string | any,
    content_type?: string,
    finish_reason?: string,
}

export interface MediaStreamCreateOptions {
    client?: Client,
    data?: string[] | Blob [];
    mimeType?: string;
    live?: boolean;
    batchSize?: number;
    maxIdleSeconds?: number;
    debug?: boolean;
}

export interface BlobsStreamCreateOptions {
    client?: Client,
    data?: string[] | Blob [];
    live?: boolean;
    batchSize?: number;
    maxIdleSeconds?: number;
    debug?: boolean;
}

export interface InferenceMessage {
    role: string,
    content: string,
    timestamp: number,
    finish_reason: string,
    name?: string,
    type?: string,
    provider?: string
}

export interface InferenceCurrentMessages {
    id: number,
    action: string,
    created_at: string,
    messages: InferenceMessage[],
}

export interface ChatCompletionsOptions {
    title: string, 
    system_prompt: string,
    provider: string,
    model: string,
    max_tokens?: number,
    temperature?: number
}

export interface InferenceHistoryItem {
    id: number,
    action: string,
    created_at: string,
    updated_at: string,
    messages: InferenceMessage[],
    ctx_id?: string,
}

export interface StatusInfo {
    status: string,
    message?: string,
}

export interface Pagination {
    page: number,
    size: number,
    total: number,
    total_pages: number,
}

export interface ApiError {
    message: string,
}

export interface ApiRequestResult {
    error?: ApiError,
    data?: any,
    pagination?: Pagination,
}

export interface InferenceHistoryPage {
    data: InferenceHistoryItem[],
    pagination: Pagination,
}

export interface MediaFile {
    text: string,
    url: string;
    seq_no: number,
    service_type: string,
    content_type: string,
    size: number,
    duration: number,
    ctx_id: string,
    created_at: string,
}

export interface MediaFilePage {
    data: MediaFile[],
    pagination: Pagination,
}

export interface ClientProps {
    action: string, 
    messages: InferenceMessage[],
    history: InferenceHistoryItem[],
    options: ChatCompletionsOptions[],
}

export interface ApiSessionResult {
    apiSessionToken: string,
    apiSessionExpires: number,
}