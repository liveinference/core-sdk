
import EventEmitter from 'events';
import { io } from 'socket.io-client';
import axios from 'axios';
import { unauthorized } from './utils';
import type * as types from './types';
import { sampleRate, apiPath, moduleUrl, recordingInterval } from './config';

export class LiveInference extends EventEmitter {
    
    public audio: boolean = true;
    public video: boolean = false;
    public store: string = 'tmp';
    public ttsKey: string;
    public progress: string[] = ['transcript', 'chat-completions'];
    public maxDuration: number;
    public mediaOptions: any | null = null;
    public playback: boolean = false;
    public recording: boolean = false;
    public stopped: boolean = false;
    public debug: boolean = false;

    private client: types.Client;
    private mediaRecorder: MediaRecorder | null = null;
    private audioWorkletNode: AudioWorkletNode | null = null;
    private mediaStream: MediaStream | null = null;
    private recordedBlobs: Blob [] = [];
    private socket: any | null = null;
    private mode: number = 1;
    private mediaSaveUrls: any [] = [];
    private inputDone: boolean = false;
    private initializePhase: number = 0;

    constructor(client: types.Client, {
            audio,
            video,
            ttsKey,
            store,              // options: 'tmp', 'cdn', 'pub', 'pri'
            maxDuration = 45,   // options 30, 45, 60, 90
            progress,           // options: [], ['transcript'], ['chat-completions'], ['transcript', 'chat-completions']
            debug
        }: types.LiveInferenceOptions) {
        super();
        this.client = client;
        if (audio !== undefined) this.audio = !!audio;
        if (video !== undefined) this.video = !!video;
        if (store) this.store = store;
        if (ttsKey) this.ttsKey = ttsKey;
        if (Array.isArray(progress)) this.progress = progress;
        if (maxDuration) this.maxDuration = maxDuration;
        if (debug !== undefined) this.debug = !!debug;
        if (this.debug) {
            console.log('live inference', this);
        }
        client.eventEmitter = this;
        this.startSocket();
    }

    public async start(action: string = 'playback', options: any = {}): Promise<void> {
        if (this.debug) console.log('start', {action, options});
        this.playback = /playback/.test(action);
        this.recording = /recording/.test(action);
        this.inputDone = false;
        this.stopped = false;
        this.recordedBlobs.length = 0;
        this.startInference(action, options);
        this.emit('start');
    }

    public stop(finished: boolean = false): void {
        if (this.stopped) return;
        this.stopped = true;
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.enabled = false);
        }
        if (this.audioWorkletNode) {
            this.audioWorkletNode.port.postMessage({action: 'stop'});
        }
        if (this.mediaRecorder) {
            if (this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.requestData();
                this.mediaRecorder.stop();
            }
            this.mediaRecorder = null;
        }
        if (this.socket) {
            this.socket.emit('command', {cmd: 'stop'});
        }
        const mimeType = this.getMediaOptions().mimeType
        this.emit('stop', { finished, blobs: this.recordedBlobs, mimeType });
    }

    public destroy(): void {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.audioWorkletNode) {
            this.audioWorkletNode.port.postMessage({action: 'destroy'});
            this.audioWorkletNode.disconnect();
            this.audioWorkletNode = null;
        }
        if (this.mediaRecorder) {
            if (this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
            }
            this.mediaRecorder = null;
        }
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.initializePhase = 0;
        this.emit('stop', {});
    }

    public async startInference(action: string, options: any = {}): Promise<void> {
        if (!this.socket || !this.socket.connected) {
            await this.startSocket();
        }
        const { audio, video } = this;
        if (this.debug) console.log('startInference', {action, ...options, socket_connected: this.socket.connected});
        this.socket.emit('command', {cmd: 'start', args: {action, ...options, timestamp: Date.now()}});
        if (!options.text && (audio || video)) {
            if (!this.mediaStream) {
                this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio, video });
                if (!this.mediaStream) throw new Error('failed to get media stream');
            } else {
                this.mediaStream.getTracks().forEach(track => track.enabled = true);
            }
        }
        if (this.mediaStream) {
            if (this.audioWorkletNode) {
                this.audioWorkletNode.port.postMessage({action: 'start'}); 
            } else {
                await this.setupLiveAudioStream();
            }
        }
        if (this.playback || this.recording || video) {
            if (this.recording) {
                await this.sendUrlsRequest();
            }
            await this.setupMediaRecording();
        }
    }

    public newSession(options: types.ChatCompletionsOptions): void {
        this.sendRequest('new-session', options);
    }

    public loadSession(id: number): void {
        this.sendRequest('load-session', { id });
    }

    public async sendRequest(request: string, options: any) : Promise<void> {
        if (!this.socket || !this.socket.connected || this.initializePhase !== 3) {
            await this.startSocket();
        }
        this.socket.emit('request', {request, options});
    }

    public sendResponse(request: string, data: any) : void {
        if (!this.socket || !this.socket.connected || this.initializePhase !== 3) {
            throw new Error('socket not initialized');
        }
        this.socket.emit('response', {request, data});
    }

    public sendText(content: any, type = 'message', content_type = 'text/plain' ): void{
        if (!this.socket || !this.socket.connected || this.initializePhase !== 3) {
            throw new Error('socket not initialized');
        }
        this.socket.emit('text', {type, content_type, content});
    }

    public sendEchoTest(data: any): void {
        if (!this.socket || !this.socket.connected || this.initializePhase !== 3) {
            throw new Error('socket not initialized');
        }
        this.socket.emit('echo-test', data);
    }

    private async startSocket() {
        if (this.debug) console.log('run startSocket');
        if (this.initializePhase === 0) {
            this.initializePhase = 1;
            this.stopped = false;
            await this.connectSocket();
        }
        for (let i = 0; i < 10; i++) {
            if (this.initializePhase === 3) return true;
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        return false;
    }

    private connectSocket() {
        if (this.debug) console.log('run connectSocket');
        const token =  this.client.getAuthKey();
        this.socket = io(this.client.getApiBaseUrl(), {
            path: apiPath,
            auth: { token },
            addTrailingSlash: false,
            closeOnBeforeunload: true,
            withCredentials: true,
            transports: ['websocket'],
        });
        this.socket.on('connect', async () => {
            if (this.debug) console.log('socket connected');
            if (this.initializePhase !== 1) {
                console.log('Error: on connect, invalid initialize phase', this.initializePhase);
            }
            this.initializePhase = 2;
            for (let i = 0; i < 20; i++) {
                this.sendInitialize();
                await new Promise(resolve => setTimeout(resolve, 334));
                if (this.initializePhase === 3) break;
            }
        });
        this.socket.on('initialized', (data: any) => {
            if (this.debug) console.log('initialized', data);
            this.initializePhase = 3;
        });
        this.socket.on('text', (data: types.TextContent) => {
            if (!data || !data.content) return;
            this.emit('text', data);
        });
        this.socket.on('image', (src: string | any) => {
            if (typeof src === 'string') {
                this.emit('image', src);
            } else if (src.buffer && src.type) {
                const { buffer, type } = src;
                const blob = new Blob([buffer], { type });
                const audioUrl = URL.createObjectURL(blob);
                this.emit('image', audioUrl);
            } else if (src.src) {
                this.emit('image', src);
            } else {
                console.log('Error: invalid image src', src);
            }
        });
        this.socket.on('audio', (src: string | any) => {
            if (typeof src === 'string') {
                this.emit('audio', src);
            } else if (src.buffer && src.type) {
                const { buffer, type } = src;
                const blob = new Blob([buffer], { type });
                const audioUrl = URL.createObjectURL(blob);
                this.emit('audio', audioUrl);
            } else {
                console.log('Error: invalid audio src', src);
            }
        });
        this.socket.on('video', (src: string | any) => {
            if (typeof src === 'string') {
                this.emit('video', src);
            } else if (src.buffer && src.type) {
                const { buffer, type } = src;
                const blob = new Blob([buffer], { type });
                const videoUrl = URL.createObjectURL(blob);
                this.emit('video', videoUrl);
            } else {
                console.log('Error: invalid video src', src);
            }
        });
        this.socket.on('status', (status: string) => {
                if (this.debug) console.log('received status', status);
                switch (status) {
                    case 'input-finished': {
                        if (!this.inputDone) {
                            this.inputDone = true;
                            this.emit('input-done');
                        }
                        break;
                    }
                    case 'done': {
                        this.stop(true);
                        break;
                    }
                    case 'invalid-token': {
                        unauthorized('invalid token');
                        this.stop();
                        break;
                    }
                    case 'error':
                    case 'timeout':
                    case 'stopped':
                    case 'toolong': {
                        this.stop();
                        break;
                    }
                    default:
                        console.log('Error: unhandled status', status);
                        this.stop();
                }
        });
        this.socket.on('response', ({request, data}: types.RequestResponseOptions) => {
            //if (this.debug) console.log('response', {request, data});
            switch (request) {
                case 'audio-urls': {
                    this.mediaSaveUrls.push(...data);
                    break;
                }
                case 'video-urls': {
                    this.mediaSaveUrls.push(...data);
                    break;
                }
                case 'saved-session': {
                    this.emit('saved-session', data);
                    break;
                }
                case 'load-session': {
                    this.emit('load-session', data);
                    break;
                }
                default:
                    this.emit('response', {request, data});
            }                
        });
        this.socket.on('echo-test', (data: any) => {
            if (this.debug) console.log('receive test', data);
            this.socket.emit('test-received', data);
        });
        this.socket.on('test-received', (data: any) => {
            if (this.debug) console.log('receive test-received confirmation', data);
            this.emit('test-received', data);
        });
        this.socket.on('disconnect', (reason: any) => {
            if (this.debug) console.log('disconnect', reason);
            this.destroy();
        });
        this.socket.on('connect_error', (error: any) => {
            if (this.debug) console.log('connect_error', error.message);
            this.destroy();
        });
        this.socket.on('error', (error: any) => {
            if (this.debug) console.log('error', error.message);
            this.destroy();
        });
    }

    private sendInitialize() {
        if (!this.socket || !this.socket.connected) throw new Error('socket not initialized');
        const { audio, video, store, ttsKey, maxDuration, progress, mode } = this;
        const options = { audio, video, store, ttsKey, sampleRate, maxDuration, progress, mode, timestamp: Date.now() };
        if (this.debug) console.log('send initialize', options);
        this.socket.emit('initialize', options);
    }

    private async setupLiveAudioStream(): Promise<void> {
        const audioContext = new window.AudioContext({ sampleRate });
        const source = audioContext.createMediaStreamSource(this.mediaStream);
        await audioContext.audioWorklet.addModule(moduleUrl);
        const { maxDuration, debug, mode } = this;
        this.audioWorkletNode = new AudioWorkletNode(audioContext, 'voice-worklet-processor', {
            processorOptions: { sampleRate, maxDuration, mode, debug }}
        );
        source.connect(this.audioWorkletNode);
        this.audioWorkletNode.connect(audioContext.destination);
        this.audioWorkletNode.port.onmessage = ({ data }) => {
            if (!this.audioWorkletNode || !this.socket || !this.mediaStream || !data) return;
            if (!this.socket.connected) {
                console.log('Error: onmessage, socket not connected');
                return;
            }
            //console.log('audio-worklet-node message', data);
            const { buffer, info } = data;
            this.socket.compress(true).emit('audio-data', {buffer, info});
            if (info && info.startsWith('stop-')) {
                if (this.debug) console.log('send stop cmd', info);
                if (!this.inputDone) {
                    this.inputDone = true;
                    this.emit('input-done');
                }
                this.socket.emit('command', {cmd: 'stop'});
            }
        };
    }

    private getMediaOptions(): any {
        if (!this.mediaOptions) {
            if (this.audio && !this.video) {
                if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                    this.mediaOptions = {mimeType: 'audio/webm; codecs=opus'};
                } else {
                    console.log('Error: no supported audio media options 1');
                    this.mediaOptions = {};
                }
            } else {
                if (MediaRecorder.isTypeSupported('video/webm;codecs="vp9,opus"')) {
                    this.mediaOptions = {mimeType: 'video/webm; codecs="vp9,opus"'};
                } else if (MediaRecorder.isTypeSupported('video/webm;codecs="vp8,opus"')) {
                    this.mediaOptions = {mimeType: 'video/webm; codecs="vp8,opus"'};
                } else if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
                    this.mediaOptions = {mimeType: 'video/mp4; codecs=avc1'}; // for safari, tested, issue keep loading, need more work
                } else {
                    console.log('Error: no supported video media options 2');
                    this.mediaOptions = {};
                }
            }
            if (this.debug) console.log('media options', this.mediaOptions);
        }
        return this.mediaOptions;
    }

    private async setupMediaRecording(): Promise<void> {
        let start = 0;
        while (!this.stopped && start < this.maxDuration * 1000) {
            this.startMediaRecorder();
            await new Promise(resolve => setTimeout(resolve, recordingInterval));
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.requestData();
                this.mediaRecorder.stop();
                this.mediaRecorder = null;
            }
            start += recordingInterval;
        }
    }

    private startMediaRecorder(): void {
        const startMs = Date.now();
        const options = this.getMediaOptions();
        if (!options.mimeType) return;
        this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
        const chunks : any [] = [];
        this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
            if (event.data.size > 0) {
                chunks.push(event.data);
            }
        }
        this.mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: options.mimeType });
            this.recordedBlobs.push(blob);
            if (this.recording && chunks.length > 0) {
                this.saveFile(blob, options.mimeType, startMs, Date.now());
            }
        }
        this.mediaRecorder.start(250);
    }

    private async saveFile(blob: Blob, type: string, startMs: number, endMs: number): Promise<void> {
        const { url, bucket, key } = await this.getSaveUrl();
        try {
            await axios.put(url, blob, { headers: { 'Content-Type': type } });
            this.sendRequest('saved-file', { bucket, key, size: blob.size, type, startMs, endMs, duration: Math.round((endMs - startMs) / 100) / 10 });
        } catch (e) {
            console.log('Error: failed to save file', e);
        }
    }

    private async sendUrlsRequest(wait = false) {
        const { mimeType } = this.getMediaOptions();
        if (mimeType) return;
        const [ type, ext ] = mimeType.split(';')[0].split('/');
        let count = 1;
        if (this.mediaSaveUrls.length === 0) {
            count = 3;
        } else if (this.mediaSaveUrls.length < 3) {
            count = 3 - this.mediaSaveUrls.length;
        }
        this.sendRequest(`${type}-urls`, { count, ext });
        if (!wait) return;
        for (let i = 0; i < 30; i++) {
            if (this.mediaSaveUrls.length > 0) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    private async getSaveUrl() {
        await this.sendUrlsRequest(true);
        if (this.mediaSaveUrls.length === 0) {
            throw new Error(`media save urls is empty`);
        }
        return this.mediaSaveUrls.shift();
    }
}

export default LiveInference;