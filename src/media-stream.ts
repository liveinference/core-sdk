
import EventEmitter from 'events';
import type * as types from './types';
import { recordingInterval } from './config';

export class MediaStream extends EventEmitter  {

    client: types.Client;
    player: HTMLVideoElement | HTMLAudioElement;
    inputData: string[] | Blob [] | Response [] = [];
    arrayBuffers: ArrayBuffer[] = [];
    mimeType: string | undefined | null;
    live: boolean;
    batchSize: number = 3;
    mediaSource: MediaSource;
    sourceBuffer: SourceBuffer;
    pipeStopped: boolean = false;
    loopsStopped: boolean = false;
    receivedTotal: number = 0;
    maxIdleSeconds: number = 180;
    idleStartedAt: number | undefined;
    ready: boolean = false;
    debug: boolean = false;

    constructor(
        player: HTMLVideoElement | HTMLAudioElement,
        {
            client, 
            data,
            mimeType, 
            live,
            batchSize,
            maxIdleSeconds,
            debug
        }: types.MediaStreamCreateOptions = {}
    ) {
        super();
        if  (client) this.client = client;
        this.player = player;
        if (data && data.length) {
            this.inputData = [ ...data ] as string[] | Blob [] | Response [];
            if (live === undefined) live = false;
        } else {
            if (live === undefined) live = true;
        }
        if (live === undefined) live = false;
        if (mimeType) this.mimeType = mimeType;
        this.live = live;
        if (batchSize) this.batchSize = batchSize;
        if (maxIdleSeconds) this.maxIdleSeconds = maxIdleSeconds;
        if (debug) this.debug = debug;
        if (this.debug) console.log('media stream created', this);
        this.cleanupSrc();
        player.addEventListener('ended', this.onEnded.bind(this));
        this.mediaSource = new MediaSource();
        this.runDataPipe();
        this.player.src = URL.createObjectURL(this.mediaSource);
        this.runUpdatingLoops().then(() => this.callEndOfStream());
    }

    append(data: any, mimeType?: string): void {
        if (!this.live) {
            throw new Error('append is only supported for live mode');
        }
        if (this.pipeStopped) {
            console.error('cannot append data after pipe stopped');
            return
        }
        //if (this.debug) console.log('append', data);
        if (mimeType) {
            if (this.mimeType) {
                if (this.mimeType !== mimeType) {
                    console.error('mimeType mismatch', this.mimeType, mimeType);
                    return;
                }
            } else {
                this.mimeType = mimeType;
            }
        }
        if (Array.isArray(data)) {
            this.inputData.push(...data);
        } else {
            this.inputData.push(data);
        }
        if (this.ready && this.player.paused) {
            this.toPlay();
        }
    }

    toPlay(): void {
        this.ready = true;
        if (!this.player.paused) return;
        if (this.player.src && this.player.readyState === 4) {
            this.player.play();
        } else if (!this.player.oncanplay) {
            this.player.oncanplay = () => {
                if (this.debug) console.log('oncanplay called 1');
                this.player.play();
                this.player.oncanplay = null;
            };
        }
    }

    isEmpty(): boolean {
        return this.inputData.length === 0 && this.arrayBuffers.length === 0;
    }

    reset(): void {
        this.inputData.length = 0;
        this.arrayBuffers.length = 0;
        if (!this.player.paused) {
            this.player.pause();
        }
        this.cleanupSrc();
    }

    done(): void {
        if (this.debug) console.log('done called');
        this.pipeStopped = true;
    }

    destroy(): void {
        if (this.debug) console.log('stop called');
        this.inputData.length = 0;
        this.pipeStopped = true;
        this.loopsStopped = true;
        this.arrayBuffers.length = 0;
        this.player.oncanplay = null;
        if (!this.player.paused) {
            this.player.pause();
        }
        this.cleanupSrc();
        this.player.removeEventListener('ended', this.onEnded.bind(this));
    }

    // private methods

    onEnded() {
        //if (this.debug) console.log('onEnded called');
        this.idleStartedAt = Date.now();
    }

    cleanupSrc() {
        if (!this.player.src) return;
        URL.revokeObjectURL(this.player.src);
        this.player.removeAttribute('src');
        this.player.src = '';
    }

    setClient(client: types.Client): void {
        this.client = client;
    }

    async runUpdatingLoops(): Promise<void> {
        // to ensure the first buffer available
        while (this.arrayBuffers.length === 0 && !this.loopsStopped) {
            await new Promise((resolve) => setTimeout(resolve, 300));
        }
        if (this.loopsStopped) return;
        if (!this.mimeType) {
            console.error('no mime type');
            return;
        }
        this.sourceBuffer = await this.addSourceBufferWhenOpen();
        let buffer = this.arrayBuffers.shift(); 
        while (!this.loopsStopped && buffer) {
            await this.waitForEndOfUpdate();
            this.sourceBuffer.appendBuffer(buffer as ArrayBuffer);
            while (this.arrayBuffers.length === 0 && !this.loopsStopped && !this.pipeStopped) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                if (this.idleStartedAt && Date.now() - this.idleStartedAt > this.maxIdleSeconds * 1000) {
                    if (this.debug) {
                        console.log('runUpdatingLoops, max idle seconds reached');
                    }
                    this.loopsStopped = true;
                    break;
                }
            }
            if (this.loopsStopped) break;
            buffer = this.arrayBuffers.shift();
        };
        this.loopsStopped = true;
    }

    async callEndOfStream(): Promise<void> {
        if (this.mediaSource.readyState === 'open') {
            await this.waitForEndOfUpdate();
            this.mediaSource.endOfStream();
        }
        this.emit('ended');
    }

    async waitForEndOfUpdate(): Promise<void> {
        for (let i = 0; i < 10; i++) {
            if (!this.sourceBuffer.updating) return;
            if (await new Promise((resolve) => {
                const handle = setTimeout(() => {
                    console.log('wait for onupdateend timeout');
                    resolve(false);
                }, 1000);
                this.sourceBuffer.onupdateend = () => {
                    clearTimeout(handle);
                    resolve(true);
                };
            })) {
                return;
            }
        }
    }

    addSourceBufferWhenOpen(): Promise<SourceBuffer> {
        return new Promise((resolve, reject) => {
            const getSourceBuffer = () => {
                try {
                    const sourceBuffer = this.mediaSource.addSourceBuffer(this.mimeType as string);
                    sourceBuffer.mode = 'sequence';
                    resolve(sourceBuffer);
                } catch (e) {
                    reject(e);
                }
            };
            if (this.mediaSource.readyState === 'open') {
                getSourceBuffer();
            } else {
                this.mediaSource.addEventListener('sourceopen', getSourceBuffer);
            }
        });
    }

    async runDataPipe(): Promise<void> {
        const promises: any = [];
        let hasMore;
        do {
            hasMore = false;
            let data = this.inputData.shift();
            if (data) {
                if (data instanceof ArrayBuffer) {
                    hasMore = true;
                    this.receivedTotal++;
                    this.arrayBuffers.push(data);
                    continue;
                }
                promises.push(this.getArrayBuffer(data));
                if (promises.length !== this.batchSize) {
                    continue;
                }
            }
            if (promises.length) {
                const result: any[] = await Promise.all(promises);
                for (const item of result) {
                    this.receivedTotal++;
                    if (!item) continue;
                    this.arrayBuffers.push(item);
                }
                promises.length = 0;
                if (result.length === this.batchSize) {
                    hasMore = true;
                    const overBuffers = this.arrayBuffers.length - 3 * this.batchSize;
                    if (overBuffers > 0) {  // to slow down the process
                        const factor = 1 + Math.ceil(overBuffers / this.batchSize);
                        await new Promise((resolve) => setTimeout(resolve, recordingInterval * factor));
                    } else if (this.arrayBuffers.length <= this.batchSize) {
                        const { receivedTotal } = this;
                        this.emit('more', { receivedTotal });
                    }
                    continue
                }
            }
            const idleStartedAt = Date.now();
            do {
                const { receivedTotal } = this;
                this.emit('more', { receivedTotal });
                await new Promise((resolve) => setTimeout(resolve, recordingInterval));
                if (Date.now() - idleStartedAt > this.maxIdleSeconds * 1000) {
                    if (this.debug) {
                        console.log('runDataPipe, max idle seconds reached');
                    }
                    this.pipeStopped = true;
                    break;
                }
            } while (
                this.live &&                // live mode, for no live mode, this loop runs only once
                !this.pipeStopped &&        // set to true to stop. for live mode, call done() or stop() to this to true
                !this.inputData.length      // has data to process
            );
        } while (this.inputData.length || promises.length || hasMore);
        this.pipeStopped = true;
    }

    async getArrayBuffer(obj: string | Blob | Response): Promise<ArrayBuffer | void> {
        let blob: Blob, response: Response | null = null;
        if (typeof obj === 'string') {
            let url = obj as string;
            if (this.client) {
                response = await this.client.getResponse(url, { useQuery: true })
            } else {
                response = await fetch(url);
            }
        } else if (obj instanceof Response) {
            response = obj as Response;
        }
        if (response) {
            if (!response.ok) {
                console.log('getArrayBuffer response not ok', response);
                return;
            }
            if (!this.mimeType) {
                this.mimeType = response.headers.get('content-type');
            }
            blob = await response.blob();
        } else {
            blob = obj as Blob;
        }
        return await blob.arrayBuffer();
    }
}