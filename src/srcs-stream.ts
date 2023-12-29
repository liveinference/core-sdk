
import EventEmitter from 'events';
import type * as types from './types';

export class SrcsStream extends EventEmitter  {

    client: types.Client | undefined;
    player: HTMLAudioElement | HTMLVideoElement;
    inputData: string[] | Response [] | Blob[] = [];
    dataBlobs: Blob[] = [];
    batchSize: number = 3;
    live: boolean = false;
    idleStartedAt: number | undefined;
    maxIdleSeconds: number = 180;
    stopped: boolean = false;
    pipeStopped: boolean = false;
    receivedTotal: number = 0;
    playedTotal: number = 0;
    srcInitiated: boolean = false;
    ready: boolean = false;
    debug: boolean = false;

    constructor(
        player: HTMLAudioElement | HTMLVideoElement,
        {
            client, 
            data,
            batchSize,
            live,
            maxIdleSeconds,
            debug
        }: types.BlobsStreamCreateOptions = {}
    ) {
        super();
        if  (client) this.client = client;
        this.player = player;
        if (data && data.length) {
            this.inputData = [ ...data ] as string[] | Blob [] | Response [];
        }
        if (batchSize) this.batchSize = batchSize;
        if (live) this.live = live;
        if (maxIdleSeconds) this.maxIdleSeconds = maxIdleSeconds;
        if (debug) this.debug = debug;
        if (this.debug) console.log('srcs stream created', this);
        this.cleanupSrc();
        this.player.addEventListener('ended', this.onEnded.bind(this));
        this.runDataPipe();
        this.playNext();
    }

    append(data: any): void {
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
        return !this.player.src && this.inputData.length === 0 && this.dataBlobs.length === 0;
    }

    done(): void {
        if (this.debug) console.log('done called');
        this.pipeStopped = true;
    }

    reset(): void {
        this.inputData.length = 0;
        this.dataBlobs.length = 0;
        if (!this.player.paused) {
            this.player.pause();
        }
        this.cleanupSrc();
    }

    destroy(): void {
        if (this.debug) console.log('destroy called');
        if (this.stopped) return
        this.stopped = true;
        this.pipeStopped = true;
        this.inputData.length = 0;
        this.dataBlobs.length = 0;
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
        this.playedTotal++;
        const ended = this.pipeStopped && this.dataBlobs.length === 0;
        URL.revokeObjectURL(this.player.src);
        if (ended) {
            this.player.removeAttribute('src');
            this.emit('ended');
        } else {
            this.playNext();            
        }
    }

    setClient(client: types.Client): void {
        this.client = client;
    }

    cleanupSrc() {
        if (!this.player.src) return;
        URL.revokeObjectURL(this.player.src);
        this.player.removeAttribute('src');
        this.player.src = '';
    }

    playNext(): boolean {
        if (this.stopped) return false;
        if (!this.player.paused) {
            this.idleStartedAt = undefined;
            return false;
        }
        if (this.playedTotal === 0 && this.srcInitiated) {
            if (this.ready) {
                this.player.play();
                return true;
            }
            return false;
        }
        if (this.dataBlobs.length === 0) {
            this.idleStartedAt = Date.now();
            return false
        }
        const blob = this.dataBlobs.shift() as Blob;
        this.player.src = URL.createObjectURL(blob);
        if (this.playedTotal > 0) {
            this.player.play();
        } else {
            this.srcInitiated = true;
        }
        return true;
    }

    async runDataPipe(): Promise<void> {
        const promises: any = [];
        let hasMore;
        do {
            hasMore = false;
            let data = this.inputData.shift();
            if (data) {
                if (data instanceof Blob) {
                    hasMore = true;
                    this.receivedTotal++;
                    this.dataBlobs.push(data);
                    this.playNext();
                    continue;
                }
                promises.push(this.getDataBlob(data));
                if (promises.length !== this.batchSize) {
                    continue;
                }
            }
            if (promises.length) {
                const blobs: any[] = await Promise.all(promises);
                for (const blob of blobs) {
                    this.receivedTotal++;
                    if (!blob) continue;
                    this.dataBlobs.push(blob);
                }
                promises.length = 0;
                this.playNext();
                if (blobs.length === this.batchSize) {
                    hasMore = true;
                    if (this.dataBlobs.length > this.batchSize) {
                        await new Promise((resolve) => setTimeout(resolve, 3000));
                    } else {
                        const { receivedTotal } = this;
                        this.emit('more', { receivedTotal });
                    }
                    continue;
                }
            }
            do {
                const { receivedTotal } = this;
                this.emit('more', { receivedTotal });
                await new Promise((resolve) => setTimeout(resolve, 3000));
                if (this.idleStartedAt && Date.now() - this.idleStartedAt > this.maxIdleSeconds * 1000) {
                    if (this.debug) console.log('runDataPipe, max idle seconds reached');
                    this.pipeStopped = true;
                    break;
                }
            } while (
                this.live &&                // live mode, for no live mode, this loop runs only once
                !this.inputData.length &&   // has data to process
                !this.pipeStopped &&        // not pipe stopped
                !this.stopped               // not stopped
            );
        } while (!this.pipeStopped || this.inputData.length || promises.length || hasMore);
        this.pipeStopped = true;
    }

    async getDataBlob(obj: string | Response): Promise<Blob | void> {
        //if (this.debug) console.log('call getDataBlobs', obj);
        let response: Response;
        if (typeof obj === 'string') {
            let url = obj as string;
            if (this.client) {
                response = await this.client.getResponse(url, { useQuery: true })
            } else {
                response = await fetch(url);
            }
        } else {
            response = obj as Response;
        }
        if (!response.ok) {
            console.log('getDataBlob response not ok', response);
            return;
        }
        return await response.blob();
    }
}